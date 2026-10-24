-- Portal Financiero > Rendiciones (Rindegastos -> SAP). SOLO EN EL SERVIDOR.
-- stack\tareas\sincronizar-rindegastos.ps1 trae de la API v2 de Rindegastos los informes cerrados (aprobados) y
-- aun no integrados, con sus gastos, y de SAP (HANA, solo lectura) el plan de cuentas imputable, los socios de
-- negocio proveedores, los proyectos, el estado de los periodos y los asientos ya importados (Ref2 = 'RG-<id>');
-- escribe con la RPC rg_sincronizar (service_role).
--
-- Flujo de una rendicion (estado):
--   pendiente -> (observado) -> aprobado -> exportado -> integrado
--   aprobado:  contabilidad reviso y aprobo; el asiento queda congelado en rg_asiento_final
--   exportado: entro en un lote (rg_lotes); el portal arma el archivo de importacion de SAP (DTW, asientos)
--              y contabilidad lo importa en SAP. Anular el lote la devuelve a aprobado.
--   integrado: la sincronizacion encontro su asiento en SAP (Ref2 = 'RG-<id>'); guarda el numero y, si
--              rg_config.marcar_rindegastos, la tarea la marca como integrada en Rindegastos con ese numero.
--
-- Asiento (como lo registra hoy contabilidad: asiento manual, socio de negocio = RUT + 'P'):
--   debe   un gasto: cuenta de la categoria, CECO y proyecto
--   debe   una factura (si facturas_modo = 'proveedor'): el proveedor como socio de negocio (su cuenta asociada);
--          la factura ya entro a SAP por la recepcion del SII y aqui la deuda pasa del proveedor al colaborador
--   haber  la contrapartida: el colaborador como socio de negocio (contrapartida_modo = 'socio') o una cuenta
--
--   rg_informes      un informe (rendicion) de Rindegastos + su estado en el portal
--   rg_gastos        sus gastos + las correcciones de contabilidad (incluir, cuenta, ceco, proyecto, socio)
--   rg_categorias    tabla de cuentas: categoria de Rindegastos -> cuenta contable y regla de CECO
--   rg_config        contrapartida, facturas y nombres de los campos extra de Rindegastos
--   rg_cuentas_sap, rg_socios_sap, rg_proyectos_sap, rg_periodos_sap   catalogos de SAP para validar
--   rg_asiento_lineas (vista)  el asiento propuesto (en vivo, con las reglas de hoy)
--   rg_asiento_final           el asiento aprobado (congelado): lo que va al archivo
--   rg_lotes         archivos de importacion generados
--   rg_historial     quien hizo que y cuando
--
-- Accesos (ancla del portal Financiero, ver 20261019120000_financiero_sap.sql):
--   modulo_key 'fin:rendiciones'          ver la bandeja, los asientos y los lotes
--   modulo_key 'fin:rendiciones_aprobar'  ademas corregir, aprobar, observar, reabrir, generar y anular lotes y
--                                         editar la tabla de cuentas
-- Los admin del hub tienen ambos. Rindegastos no tiene sucursal: no se filtra por sucursal.
--
-- Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- accesos

create or replace function public.rg_puede_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select fin_es_admin(auth.uid()) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = auth.uid() and pe.proyecto_id = fin_ancla_id()
      and pe.modulo_key in ('fin:rendiciones', 'fin:rendiciones_aprobar'))
$$;

create or replace function public.rg_puede_aprobar()
returns boolean language sql stable security definer set search_path = public as $$
  select fin_es_admin(auth.uid()) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = auth.uid() and pe.proyecto_id = fin_ancla_id() and pe.modulo_key = 'fin:rendiciones_aprobar')
$$;

-- Se agrega rendiciones al menu del portal (mismo resultado que antes + dos claves).
create or replace function public.fin_mis_accesos()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin', fin_es_admin(auth.uid()),
    'configurar', fin_puede_configurar(),
    'eerr',    (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('eerr', s)),
    'balance', (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('balance', s)),
    'ventas',  (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('ventas', s)),
    'rendiciones', rg_puede_ver(),
    'rendiciones_aprobar', rg_puede_aprobar())
$$;

-- ---------------------------------------------------------------- tablas

create table if not exists public.rg_lotes (
  id                 serial primary key,
  creado_por         uuid references auth.users (id) on delete set null,
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  informes           integer not null,
  total              numeric(16, 2) not null,
  anulado_en         timestamptz,
  anulado_por_nombre text,
  motivo_anulacion   text
);

create table if not exists public.rg_informes (
  id                bigint primary key,            -- Id del informe en Rindegastos
  folio             text,                          -- ReportNumber (numero visible en Rindegastos)
  titulo            text,
  empleado_id       bigint,
  empleado_nombre   text,
  empleado_email    text,
  empleado_rut      text,                          -- Employee.Identification
  empleado_ceco     text,                          -- Employee.CostCenter
  politica          text,
  fondo             text,
  aprobador         text,
  fecha_envio       date,
  fecha_cierre      date,                          -- ClosedDate: cuando quedo aprobado en Rindegastos
  total             numeric(16, 2) not null default 0,
  total_aprobado    numeric(16, 2) not null default 0,
  moneda            text not null default 'CLP',
  nota              text,
  campos            jsonb not null default '{}',   -- campos extra del informe {nombre: valor}
  archivos          jsonb not null default '[]',
  integrado_rg      boolean not null default false, -- IsIntegrated en Rindegastos
  sincronizado_en   timestamptz not null default now(),
  -- portal
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'observado', 'aprobado', 'exportado', 'integrado')),
  observacion       text,
  fecha_asiento     date,                          -- fecha contable elegida al aprobar
  aprobado_por      uuid references auth.users (id) on delete set null,
  aprobado_en       timestamptz,
  lote_id           integer references public.rg_lotes (id),
  sap_trans_id      integer,                       -- OJDT.TransId del asiento importado
  sap_numero        integer,                       -- OJDT.Number (numero visible del asiento)
  integrado_en      timestamptz,                   -- cuando se encontro el asiento en SAP
  rg_marcado_en     timestamptz,                   -- cuando se marco como integrado en Rindegastos
  rg_marca_error    text,
  -- Rindegastos cambio el informe despues de aprobado en el portal (los gastos quedaron congelados)
  cambio_rg         boolean not null default false,
  actualizado_por   uuid references auth.users (id) on delete set null,
  actualizado_en    timestamptz not null default now()
);
create index if not exists rg_informes_estado_idx on public.rg_informes (estado, fecha_cierre desc);
create index if not exists rg_informes_lote_idx on public.rg_informes (lote_id);

create table if not exists public.rg_gastos (
  id                bigint primary key,            -- Id del gasto en Rindegastos
  informe_id        bigint not null references public.rg_informes (id) on delete cascade,
  estado_rg         smallint not null,             -- 1 aprobado, 2 rechazado, 0 en proceso
  fecha             date,                          -- IssueDate
  proveedor         text,
  categoria         text not null default '',
  categoria_codigo  text,
  categoria_grupo   text,
  tipo_documento    text,                          -- del campo extra rg_config.campo_tipo_documento
  numero_documento  text,                          -- del campo extra rg_config.campo_numero_documento
  rut_proveedor     text,                          -- del campo extra rg_config.campo_rut_proveedor
  neto              numeric(16, 2) not null default 0,
  iva               numeric(16, 2) not null default 0,
  otros_impuestos   numeric(16, 2) not null default 0,
  retencion         numeric(16, 2) not null default 0,
  total             numeric(16, 2) not null default 0, -- en la moneda del informe (Total)
  moneda            text not null default 'CLP',
  monto_original    numeric(16, 2),
  moneda_original   text,
  reembolsable      boolean not null default true,
  nota              text,
  campos            jsonb not null default '{}',   -- campos extra del gasto {nombre: valor}
  archivos          jsonb not null default '[]',   -- [{nombre, original, grande}]
  -- correcciones de contabilidad (null = lo que dicen la tabla de cuentas y las reglas)
  incluir           boolean,
  cuenta            text,
  ceco              text,
  proyecto          text,
  socio             text,                          -- proveedor de una factura (codigo de socio de SAP)
  glosa             text
);
create index if not exists rg_gastos_informe_idx on public.rg_gastos (informe_id);

create table if not exists public.rg_categorias (
  categoria         text primary key,              -- nombre de la categoria en Rindegastos
  categoria_codigo  text,
  cuenta            text,                          -- rg_cuentas_sap.codigo (AcctCode)
  regla_ceco        text not null default 'campo' check (regla_ceco in ('campo', 'empleado', 'fijo', 'manual')),
  ceco_fijo         text,
  excluir           boolean not null default false, -- nunca va al asiento (p. ej. se contabiliza por otra via)
  actualizado_por   uuid references auth.users (id) on delete set null,
  actualizado_en    timestamptz not null default now()
);

create table if not exists public.rg_config (
  id                     boolean primary key default true check (id),
  -- haber: 'socio' = el colaborador como socio de negocio (RUT + sufijo_socio, su cuenta asociada);
  --        'cuenta' = siempre cuenta_contrapartida
  contrapartida_modo     text not null default 'socio' check (contrapartida_modo in ('socio', 'cuenta')),
  cuenta_contrapartida   text,                     -- modo 'cuenta', o la cuenta asociada si el socio no la trae
  sufijo_socio           text not null default 'P', -- codigo de socio proveedor en SAP = RUT + sufijo (11849833-KP)
  -- facturas: 'proveedor' = al debe del proveedor como socio de negocio; 'excluir' = fuera del asiento
  facturas_modo          text not null default 'proveedor' check (facturas_modo in ('proveedor', 'excluir')),
  tipos_factura          text[] not null default '{factura}', -- tipos de documento que son factura (contienen el texto)
  factura_si_iva         boolean not null default true, -- sin tipo de documento: con IVA = factura
  campo_ceco             text,                     -- campo extra (del gasto o del informe) con el CECO
  campo_proyecto         text,                     -- campo extra con el proyecto de SAP
  campo_tipo_documento   text,                     -- campo extra con el tipo de documento (boleta, factura...)
  campo_numero_documento text,
  campo_rut_proveedor    text,                     -- campo extra con el RUT del proveedor (facturas)
  marcar_rindegastos     boolean not null default true, -- al integrar, marcar el informe en Rindegastos
  desde                  date not null default date '2026-01-01', -- informes cerrados desde esta fecha
  actualizado_por        uuid references auth.users (id) on delete set null,
  actualizado_en         timestamptz not null default now()
);
insert into public.rg_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.rg_cuentas_sap (
  codigo          text primary key,                -- OACT.AcctCode
  codigo_formato  text,                            -- codigo visible (FormatCode)
  nombre          text not null,
  activa          boolean not null default true
);

create table if not exists public.rg_socios_sap (
  codigo           text primary key,               -- OCRD.CardCode (proveedores)
  nombre           text not null,
  rut              text,                           -- LicTradNum
  cuenta_asociada  text,                           -- DebPayAcct
  activo           boolean not null default true
);

create table if not exists public.rg_proyectos_sap (
  codigo  text primary key,                        -- OPRJ.PrjCode
  nombre  text not null,
  activo  boolean not null default true
);

create table if not exists public.rg_periodos_sap (
  periodo  date primary key,                       -- primer dia del mes
  estado   text not null                           -- OFPR.PeriodStat: N abierto, Y bloqueado, C/S cerrandose
);

-- El asiento aprobado, congelado: no cambia aunque cambien la tabla de cuentas o Rindegastos.
create table if not exists public.rg_asiento_final (
  informe_id  bigint not null references public.rg_informes (id) on delete cascade,
  linea       integer not null,                    -- 0.. en el orden del archivo
  gasto_id    bigint,
  tipo        text not null check (tipo in ('gasto', 'proveedor', 'contrapartida')),
  cuenta      text,
  socio       text,
  ceco        text,
  proyecto    text,
  glosa       text,
  debe        numeric(16, 2) not null,
  haber       numeric(16, 2) not null,
  primary key (informe_id, linea)
);

create table if not exists public.rg_historial (
  id              bigserial primary key,
  informe_id      bigint not null references public.rg_informes (id) on delete cascade,
  accion          text not null,                   -- aprobado | observado | reabierto | gasto | exportado | lote_anulado
                                                   -- | integrado | marcado_rg | cambio_rg
  detalle         text,
  usuario         uuid references auth.users (id) on delete set null,
  usuario_nombre  text,
  en              timestamptz not null default now()
);
create index if not exists rg_historial_informe_idx on public.rg_historial (informe_id, en);

create table if not exists public.rg_estado (
  id               boolean primary key default true check (id),
  sincronizado_en  timestamptz not null,
  informes         integer not null,
  gastos           integer not null,
  mensaje          text
);

-- nombre de quien llama (profiles no es legible para todos)
create or replace function public.rg_nombre_usuario(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email) from profiles p where p.id = p_user
$$;

create or replace function public.rg_historial_nombre()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario is not null and new.usuario_nombre is null then
    new.usuario_nombre := rg_nombre_usuario(new.usuario);
  end if;
  return new;
end;
$$;
drop trigger if exists rg_historial_nombre on public.rg_historial;
create trigger rg_historial_nombre before insert on public.rg_historial for each row execute function public.rg_historial_nombre();

-- ---------------------------------------------------------------- asiento propuesto

-- CECO desde un texto como "1101 - SIP Santiago" o "1101": los 4 digitos del inicio; si no, el texto.
create or replace function public.rg_ceco_de(p text)
returns text language sql immutable as $$
  select nullif(coalesce(substring(btrim(p) from '^(\d{4})\M'), btrim(p)), '')
$$;

-- Proyecto desde "PRJ-001 - Obra X" o "PRJ-001": lo anterior a " - "; si no, el texto.
create or replace function public.rg_proyecto_de(p text)
returns text language sql immutable as $$
  select nullif(btrim(split_part(btrim(p), ' - ', 1)), '')
$$;

-- Codigo de socio de SAP desde un RUT ("11.849.833-k" -> "11849833-KP" con sufijo 'P'). null si no parece RUT.
create or replace function public.rg_socio_de(p_rut text, p_sufijo text)
returns text language sql immutable as $$
  with r as (select upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')) as s)
  select case when length(s) between 2 and 10 and s ~ '^\d+[0-9K]$'
              then left(s, length(s) - 1) || '-' || right(s, 1) || coalesce(p_sufijo, '') end
  from r
$$;

drop view if exists public.rg_asiento_lineas;
drop function if exists public.rg_motivo_exclusion(public.rg_gastos, public.rg_categorias, public.rg_config);

-- Es factura: el tipo de documento contiene alguno de tipos_factura; sin tipo, trae IVA (si factura_si_iva).
create or replace function public.rg_es_factura(g public.rg_gastos, cfg public.rg_config)
returns boolean language sql stable as $$
  select case
    when g.tipo_documento is not null then exists (
      select 1 from unnest(cfg.tipos_factura) t where t <> '' and g.tipo_documento ilike '%' || t || '%')
    else cfg.factura_si_iva and g.iva > 0
  end
$$;

-- Por que un gasto queda fuera del asiento (null = va). La correccion de contabilidad (incluir) manda.
create or replace function public.rg_motivo_exclusion(g public.rg_gastos, c public.rg_categorias, cfg public.rg_config)
returns text language sql stable as $$
  select case
    when g.estado_rg <> 1 then 'Gasto no aprobado en Rindegastos'
    when g.incluir is true then null
    when g.incluir is false then 'Excluido por contabilidad'
    when coalesce(c.excluir, false) then 'Categoría excluida en la tabla de cuentas'
    when cfg.facturas_modo = 'excluir' and rg_es_factura(g, cfg)
      then 'Factura (' || coalesce(g.tipo_documento, 'trae IVA') || '): se excluye'
  end
$$;

-- Una fila por gasto (al debe) y una contrapartida por informe (al haber). Solo filas visibles para quien
-- llama (security_invoker: aplica la seguridad de rg_gastos y rg_informes).
create view public.rg_asiento_lineas with (security_invoker = true) as
with cfg as (select * from rg_config where id),
gastos as (
  select g.informe_id, g.id as gasto_id, g.total,
         rg_motivo_exclusion(g, c, cfg) as motivo_exclusion,
         cfg.facturas_modo = 'proveedor' and rg_es_factura(g, cfg) as es_factura,
         g, c, i, cfg
  from rg_gastos g
  join rg_informes i on i.id = g.informe_id
  join rg_config cfg on cfg.id
  left join rg_categorias c on c.categoria = g.categoria
),
lineas as (
  select x.informe_id, x.gasto_id, x.motivo_exclusion, x.total,
         case when x.es_factura then 'proveedor' else 'gasto' end as tipo,
         case when x.es_factura then coalesce((x.g).socio, rg_socio_de((x.g).rut_proveedor, (x.cfg).sufijo_socio)) end as socio,
         case when not x.es_factura then coalesce((x.g).cuenta, (x.c).cuenta) end as cuenta_gasto,
         case when not x.es_factura then coalesce((x.g).ceco, case coalesce((x.c).regla_ceco, 'campo')
           when 'campo'    then rg_ceco_de(coalesce((x.g).campos ->> (x.cfg).campo_ceco, (x.i).campos ->> (x.cfg).campo_ceco))
           when 'empleado' then rg_ceco_de((x.i).empleado_ceco)
           when 'fijo'     then (x.c).ceco_fijo
         end) end as ceco,
         case when not x.es_factura then coalesce((x.g).proyecto,
           rg_proyecto_de(coalesce((x.g).campos ->> (x.cfg).campo_proyecto, (x.i).campos ->> (x.cfg).campo_proyecto))) end as proyecto,
         coalesce((x.g).glosa, left(concat_ws(' · ', nullif((x.g).categoria, ''), (x.g).proveedor,
           case when (x.g).numero_documento is not null then 'N° ' || (x.g).numero_documento end), 100)) as glosa
  from gastos x
)
select l.informe_id, l.gasto_id, 'debe'::text as lado, l.tipo,
       case when l.tipo = 'proveedor' then coalesce(s.cuenta_asociada, (select cuenta_contrapartida from cfg)) else l.cuenta_gasto end as cuenta,
       l.socio, l.ceco, l.proyecto, l.glosa, l.total as debe, 0::numeric(16, 2) as haber, l.motivo_exclusion
from lineas l left join rg_socios_sap s on s.codigo = l.socio
union all
select i.id, null, 'haber', 'contrapartida',
       case when cfg.contrapartida_modo = 'socio' then coalesce(s.cuenta_asociada, cfg.cuenta_contrapartida) else cfg.cuenta_contrapartida end,
       case when cfg.contrapartida_modo = 'socio' then rg_socio_de(i.empleado_rut, cfg.sufijo_socio) end,
       null, null,
       left(concat_ws(' ', 'Rendición N°' || coalesce(i.folio, i.id::text), '-', i.empleado_nombre), 100),
       0, coalesce((select sum(l.total) from lineas l where l.informe_id = i.id and l.motivo_exclusion is null), 0), null
from rg_informes i
cross join cfg
left join rg_socios_sap s on cfg.contrapartida_modo = 'socio' and s.codigo = rg_socio_de(i.empleado_rut, cfg.sufijo_socio);

-- Problemas que impiden aprobar un informe (lista vacia = se puede). null si quien llama no ve rendiciones.
create or replace function public.rg_problemas(p_informe bigint)
returns text[] language sql stable security definer set search_path = public as $$
  with l as (select * from rg_asiento_lineas where informe_id = p_informe and motivo_exclusion is null and rg_puede_ver())
  select case when rg_puede_ver() then coalesce(array_agg(x order by orden), '{}') end from (
    select 1 as orden, 'No hay gastos para contabilizar' as x
      where not exists (select 1 from l where lado = 'debe')
    union all
    select 2, 'El colaborador no tiene RUT en Rindegastos (no se puede armar su código de socio)'
      from l where tipo = 'contrapartida' and socio is null
        and (select contrapartida_modo from rg_config where id) = 'socio'
    union all
    select 3, 'Socio de negocio que no existe en SAP: ' || string_agg(distinct l.socio, ', ')
      from l where l.socio is not null and not exists (select 1 from rg_socios_sap s where s.codigo = l.socio and s.activo)
      having count(*) > 0
    union all
    select 4, 'Facturas sin RUT de proveedor: ' || count(*) from l where tipo = 'proveedor' and socio is null having count(*) > 0
    union all
    select 5, 'Falta la cuenta de contrapartida (tabla de cuentas)'
      from l where tipo = 'contrapartida' and cuenta is null
    union all
    select 6, 'Gastos sin cuenta: ' || count(*) from l where tipo = 'gasto' and cuenta is null having count(*) > 0
    union all
    select 7, 'Cuenta que no existe en SAP: ' || string_agg(distinct l.cuenta, ', ')
      from l where l.cuenta is not null and not exists (select 1 from rg_cuentas_sap s where s.codigo = l.cuenta and s.activa)
      having count(*) > 0
    union all
    select 8, 'Gastos sin CECO: ' || count(*) from l where tipo = 'gasto' and ceco is null having count(*) > 0
    union all
    select 9, 'CECO que no existe en SAP: ' || string_agg(distinct l.ceco, ', ')
      from l where l.ceco is not null and not exists (select 1 from fin_cecos c where c.codigo = l.ceco and c.activo)
      having count(*) > 0
    union all
    select 10, 'Proyecto que no existe en SAP: ' || string_agg(distinct l.proyecto, ', ')
      from l where l.proyecto is not null and not exists (select 1 from rg_proyectos_sap p where p.codigo = l.proyecto)
      having count(*) > 0
    union all
    select 11, 'Gastos en otra moneda que CLP: ' || count(*)
      from rg_gastos g where g.informe_id = p_informe and g.moneda <> 'CLP'
        and exists (select 1 from l where l.gasto_id = g.id) having count(*) > 0
  ) t
$$;

-- ---------------------------------------------------------------- seguridad por fila

do $$
declare t text;
begin
  foreach t in array array['rg_informes', 'rg_gastos', 'rg_categorias', 'rg_config', 'rg_cuentas_sap', 'rg_socios_sap',
                           'rg_proyectos_sap', 'rg_periodos_sap', 'rg_asiento_final', 'rg_lotes', 'rg_historial', 'rg_estado']
  loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select public.rg_puede_ver()))', t);
    execute format('revoke all on public.%s from anon, authenticated', t);
    execute format('grant select on public.%s to authenticated', t);
  end loop;
end $$;
revoke all on public.rg_asiento_lineas from anon, authenticated;
grant select on public.rg_asiento_lineas to authenticated;
revoke all on sequence public.rg_historial_id_seq, public.rg_lotes_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- acciones de contabilidad

create or replace function public.rg_exigir_aprobar()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not rg_puede_aprobar() then
    raise exception 'Sin permiso para revisar rendiciones' using errcode = '42501';
  end if;
end;
$$;

-- Estado de una rendicion en palabras (para los mensajes).
create or replace function public.rg_estado_texto(p text)
returns text language sql immutable as $$
  select case p when 'pendiente' then 'pendiente' when 'observado' then 'observada' when 'aprobado' then 'aprobada'
                when 'exportado' then 'exportada' when 'integrado' then 'integrada en SAP' else p end
$$;

-- Texto del estado de un periodo de SAP, o null si esta abierto.
create or replace function public.rg_periodo_cerrado(p_fecha date)
returns text language sql stable security definer set search_path = public as $$
  select case coalesce((select estado from rg_periodos_sap where periodo = date_trunc('month', p_fecha)::date), '?')
    when 'N' then null when 'Y' then 'bloqueado' when 'C' then 'cerrándose' when 'S' then 'cerrándose' else 'no existe' end
$$;

-- p = {incluir: bool|null, cuenta, ceco, proyecto, socio, glosa} (texto vacio o null = volver a la regla).
-- Solo en informes pendientes u observados.
create or replace function public.rg_guardar_gasto(p_gasto bigint, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_informe bigint;
  v_estado  text;
begin
  perform rg_exigir_aprobar();
  select g.informe_id, i.estado into v_informe, v_estado
  from rg_gastos g join rg_informes i on i.id = g.informe_id where g.id = p_gasto;
  if v_informe is null then raise exception 'Gasto % no existe', p_gasto; end if;
  if v_estado not in ('pendiente', 'observado') then
    raise exception 'La rendición está %: solo se corrige una pendiente u observada', rg_estado_texto(v_estado);
  end if;

  update rg_gastos set
    incluir  = case when p ? 'incluir' then (p ->> 'incluir')::boolean else incluir end,
    cuenta   = case when p ? 'cuenta' then nullif(btrim(p ->> 'cuenta'), '') else cuenta end,
    ceco     = case when p ? 'ceco' then nullif(btrim(p ->> 'ceco'), '') else ceco end,
    proyecto = case when p ? 'proyecto' then nullif(btrim(p ->> 'proyecto'), '') else proyecto end,
    socio    = case when p ? 'socio' then nullif(btrim(p ->> 'socio'), '') else socio end,
    glosa    = case when p ? 'glosa' then nullif(btrim(p ->> 'glosa'), '') else glosa end
  where id = p_gasto;
  update rg_informes set actualizado_por = auth.uid(), actualizado_en = now() where id = v_informe;
  insert into rg_historial (informe_id, accion, detalle, usuario)
  values (v_informe, 'gasto', 'Gasto ' || p_gasto || ': ' || concat_ws(', ',
    case when p ? 'incluir' then case (p ->> 'incluir')::boolean when true then 'incluido' when false then 'excluido'
                                  else 'inclusión según la regla' end end,
    case when p ? 'cuenta' then 'cuenta ' || coalesce(nullif(btrim(p ->> 'cuenta'), ''), 'según la tabla') end,
    case when p ? 'ceco' then 'CECO ' || coalesce(nullif(btrim(p ->> 'ceco'), ''), 'según la regla') end,
    case when p ? 'proyecto' then 'proyecto ' || coalesce(nullif(btrim(p ->> 'proyecto'), ''), 'según el campo') end,
    case when p ? 'socio' then 'proveedor ' || coalesce(nullif(btrim(p ->> 'socio'), ''), 'según el RUT') end,
    case when p ? 'glosa' then 'glosa' end), auth.uid());
end;
$$;

-- p_estado: aprobado (valida y congela el asiento; p_fecha = fecha contable) | observado (p_observacion
-- obligatoria) | pendiente (reabrir una aprobada u observada; una exportada se libera anulando su lote).
create or replace function public.rg_cambiar_estado(p_informe bigint, p_estado text, p_observacion text default null,
                                                    p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actual    text;
  v_problemas text[];
  v_cerrado   text;
begin
  perform rg_exigir_aprobar();
  select estado into v_actual from rg_informes where id = p_informe for update;
  if v_actual is null then raise exception 'Rendición % no existe', p_informe; end if;
  if v_actual in ('exportado', 'integrado') then
    raise exception 'La rendición ya está %: %', rg_estado_texto(v_actual),
      case v_actual when 'exportado' then 'anula su lote para cambiarla' else 'su asiento ya está en SAP' end;
  end if;

  if p_estado = 'aprobado' then
    if v_actual = 'aprobado' then raise exception 'La rendición ya está aprobada'; end if;
    if p_fecha is null then raise exception 'Indica la fecha contable del asiento'; end if;
    v_problemas := rg_problemas(p_informe);
    if cardinality(v_problemas) > 0 then
      raise exception 'No se puede aprobar: %', array_to_string(v_problemas, '; ');
    end if;
    v_cerrado := rg_periodo_cerrado(p_fecha);
    if v_cerrado is not null then
      raise exception 'El período % está % en SAP: elige otra fecha', to_char(p_fecha, 'MM-YYYY'), v_cerrado;
    end if;
    delete from rg_asiento_final where informe_id = p_informe;
    insert into rg_asiento_final (informe_id, linea, gasto_id, tipo, cuenta, socio, ceco, proyecto, glosa, debe, haber)
    select informe_id, (row_number() over (order by lado, gasto_id) - 1)::int, gasto_id, tipo, cuenta, socio, ceco, proyecto,
           glosa, debe, haber
    from rg_asiento_lineas where informe_id = p_informe and motivo_exclusion is null;
    update rg_informes set estado = 'aprobado', fecha_asiento = p_fecha, observacion = null, aprobado_por = auth.uid(),
      aprobado_en = now(), cambio_rg = false, actualizado_por = auth.uid(), actualizado_en = now()
    where id = p_informe;
    insert into rg_historial (informe_id, accion, detalle, usuario)
    values (p_informe, 'aprobado', 'Fecha contable ' || to_char(p_fecha, 'DD-MM-YYYY'), auth.uid());

  elsif p_estado = 'observado' then
    if nullif(btrim(p_observacion), '') is null then raise exception 'Escribe la observación'; end if;
    if v_actual = 'aprobado' then raise exception 'La rendición está aprobada: reábrela primero'; end if;
    update rg_informes set estado = 'observado', observacion = btrim(p_observacion), actualizado_por = auth.uid(),
      actualizado_en = now()
    where id = p_informe;
    insert into rg_historial (informe_id, accion, detalle, usuario) values (p_informe, 'observado', btrim(p_observacion), auth.uid());

  elsif p_estado = 'pendiente' then
    if v_actual = 'pendiente' then return jsonb_build_object('estado', 'pendiente'); end if;
    delete from rg_asiento_final where informe_id = p_informe;
    update rg_informes set estado = 'pendiente', observacion = null, fecha_asiento = null, aprobado_por = null,
      aprobado_en = null, actualizado_por = auth.uid(), actualizado_en = now()
    where id = p_informe;
    insert into rg_historial (informe_id, accion, detalle, usuario)
    values (p_informe, 'reabierto', nullif(btrim(p_observacion), ''), auth.uid());

  else
    raise exception 'Estado inválido: %', p_estado;
  end if;
  return jsonb_build_object('estado', p_estado);
end;
$$;

-- Lote de exportacion: las rendiciones aprobadas indicadas pasan a exportado. Devuelve el numero de lote; el
-- portal arma el archivo con rg_asiento_final. Rechaza todo si alguna no esta aprobada, cambio en Rindegastos,
-- su asiento no cuadra o su periodo ya no esta abierto.
create or replace function public.rg_crear_lote(p_informes bigint[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_lote  integer;
  v_malo  text;
  v_total numeric;
begin
  perform rg_exigir_aprobar();
  if coalesce(cardinality(p_informes), 0) = 0 then raise exception 'Elige al menos una rendición'; end if;
  perform 1 from rg_informes where id = any (p_informes) for update;

  select string_agg(coalesce(folio, id::text), ', ') into v_malo from rg_informes
  where id = any (p_informes) and (estado <> 'aprobado' or cambio_rg);
  if v_malo is not null then raise exception 'Solo rendiciones aprobadas y sin cambios en Rindegastos: %', v_malo; end if;
  if (select count(*) from rg_informes where id = any (p_informes)) <> (select count(distinct x) from unnest(p_informes) x) then
    raise exception 'Alguna rendición no existe';
  end if;

  select string_agg(coalesce(i.folio, i.id::text), ', ') into v_malo from rg_informes i
  where i.id = any (p_informes) and coalesce((select sum(debe) - sum(haber) from rg_asiento_final f where f.informe_id = i.id), 1) <> 0;
  if v_malo is not null then raise exception 'Asiento que no cuadra o vacío: %', v_malo; end if;

  select string_agg(coalesce(folio, id::text) || ' (' || rg_periodo_cerrado(fecha_asiento) || ')', ', ') into v_malo
  from rg_informes where id = any (p_informes) and rg_periodo_cerrado(fecha_asiento) is not null;
  if v_malo is not null then raise exception 'Fecha contable en período no abierto en SAP: % — reábrelas y cambia la fecha', v_malo; end if;

  select sum(haber) into v_total from rg_asiento_final where informe_id = any (p_informes);
  insert into rg_lotes (creado_por, creado_por_nombre, informes, total)
  values (auth.uid(), rg_nombre_usuario(auth.uid()), cardinality(p_informes), v_total)
  returning id into v_lote;
  update rg_informes set estado = 'exportado', lote_id = v_lote, actualizado_por = auth.uid(), actualizado_en = now()
  where id = any (p_informes);
  insert into rg_historial (informe_id, accion, detalle, usuario)
  select id, 'exportado', 'Lote ' || v_lote, auth.uid() from rg_informes where id = any (p_informes);
  return v_lote;
end;
$$;

-- Anula un lote (p. ej. el archivo no se pudo importar): sus rendiciones que aun no estan en SAP vuelven a aprobado.
create or replace function public.rg_anular_lote(p_lote integer, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform rg_exigir_aprobar();
  if nullif(btrim(p_motivo), '') is null then raise exception 'Escribe por qué se anula el lote'; end if;
  if not exists (select 1 from rg_lotes where id = p_lote and anulado_en is null) then
    raise exception 'El lote % no existe o ya está anulado', p_lote;
  end if;
  insert into rg_historial (informe_id, accion, detalle, usuario)
  select id, 'lote_anulado', 'Lote ' || p_lote || ': ' || btrim(p_motivo), auth.uid()
  from rg_informes where lote_id = p_lote and estado = 'exportado';
  update rg_informes set estado = 'aprobado', lote_id = null, actualizado_por = auth.uid(), actualizado_en = now()
  where lote_id = p_lote and estado = 'exportado';
  get diagnostics v_n = row_count;
  update rg_lotes set anulado_en = now(), anulado_por_nombre = rg_nombre_usuario(auth.uid()), motivo_anulacion = btrim(p_motivo)
  where id = p_lote;
  return v_n;
end;
$$;

-- p = [{categoria, cuenta, regla_ceco, ceco_fijo, excluir}, ...]: actualiza esas categorias.
create or replace function public.rg_guardar_categorias(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_malo text;
begin
  perform rg_exigir_aprobar();
  select string_agg(f ->> 'cuenta', ', ') into v_malo from jsonb_array_elements(p) f
  where nullif(f ->> 'cuenta', '') is not null and not exists (select 1 from rg_cuentas_sap s where s.codigo = f ->> 'cuenta');
  if v_malo is not null then raise exception 'Cuenta que no existe en SAP: %', v_malo; end if;

  update rg_categorias c set
    cuenta = nullif(f ->> 'cuenta', ''),
    regla_ceco = coalesce(nullif(f ->> 'regla_ceco', ''), 'campo'),
    ceco_fijo = nullif(btrim(f ->> 'ceco_fijo'), ''),
    excluir = coalesce((f ->> 'excluir')::boolean, false),
    actualizado_por = auth.uid(), actualizado_en = now()
  from jsonb_array_elements(p) f
  where c.categoria = f ->> 'categoria';
end;
$$;

-- Toma el valor de un campo extra para tipo, numero de documento y RUT del proveedor de cada gasto.
create or replace function public.rg_recalcular_campos()
returns void language sql security definer set search_path = public as $$
  update rg_gastos g set
    tipo_documento   = nullif(btrim(g.campos ->> c.campo_tipo_documento), ''),
    numero_documento = nullif(btrim(g.campos ->> c.campo_numero_documento), ''),
    rut_proveedor    = nullif(btrim(g.campos ->> c.campo_rut_proveedor), '')
  from rg_config c where c.id
$$;

-- p = {contrapartida_modo, cuenta_contrapartida, sufijo_socio, facturas_modo, tipos_factura: [..], factura_si_iva,
--      campo_ceco, campo_proyecto, campo_tipo_documento, campo_numero_documento, campo_rut_proveedor,
--      marcar_rindegastos, desde}
create or replace function public.rg_guardar_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform rg_exigir_aprobar();
  if nullif(p ->> 'cuenta_contrapartida', '') is not null
     and not exists (select 1 from rg_cuentas_sap s where s.codigo = p ->> 'cuenta_contrapartida') then
    raise exception 'La cuenta de contrapartida no existe en SAP';
  end if;
  update rg_config set
    contrapartida_modo     = coalesce(nullif(p ->> 'contrapartida_modo', ''), contrapartida_modo),
    cuenta_contrapartida   = nullif(p ->> 'cuenta_contrapartida', ''),
    sufijo_socio           = coalesce(btrim(p ->> 'sufijo_socio'), sufijo_socio),
    facturas_modo          = coalesce(nullif(p ->> 'facturas_modo', ''), facturas_modo),
    tipos_factura          = coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'tipos_factura') x
                                       where btrim(x) <> ''), '{}'),
    factura_si_iva         = coalesce((p ->> 'factura_si_iva')::boolean, true),
    campo_ceco             = nullif(btrim(p ->> 'campo_ceco'), ''),
    campo_proyecto         = nullif(btrim(p ->> 'campo_proyecto'), ''),
    campo_tipo_documento   = nullif(btrim(p ->> 'campo_tipo_documento'), ''),
    campo_numero_documento = nullif(btrim(p ->> 'campo_numero_documento'), ''),
    campo_rut_proveedor    = nullif(btrim(p ->> 'campo_rut_proveedor'), ''),
    marcar_rindegastos     = coalesce((p ->> 'marcar_rindegastos')::boolean, true),
    desde                  = coalesce((p ->> 'desde')::date, desde),
    actualizado_por = auth.uid(), actualizado_en = now()
  where id;
  perform rg_recalcular_campos();
end;
$$;

-- ---------------------------------------------------------------- sincronizacion (service_role)

-- p = { informes: [{id, folio, titulo, empleado_id, empleado_nombre, empleado_email, empleado_rut, empleado_ceco,
--                   politica, fondo, aprobador, fecha_envio, fecha_cierre, total, total_aprobado, moneda, nota,
--                   campos: {}, archivos: [], integrado_rg}],
--       gastos:   [{id, informe_id, estado_rg, fecha, proveedor, categoria, categoria_codigo, categoria_grupo, neto,
--                   iva, otros_impuestos, retencion, total, moneda, monto_original, moneda_original, reembolsable,
--                   nota, campos: {}, archivos: []}],          todos los gastos de cada informe que viene
--       cuentas:  [{codigo, codigo_formato, nombre}],          plan de cuentas imputable de SAP (si viene, reemplaza)
--       socios:   [{codigo, nombre, rut, cuenta_asociada, activo}], proveedores de SAP (si viene, reemplaza)
--       proyectos:[{codigo, nombre, activo}],
--       periodos: [{periodo: 'YYYY-MM', estado}],
--       asientos_sap: [{ref2: 'RG-<id>', trans_id, numero}],  asientos de SAP con Ref2 RG-<id>, sin los revertidos
--       mensaje }
-- Informes pendientes u observados: se reemplazan sus datos y gastos (las correcciones de contabilidad de un
-- gasto que sigue se conservan). Desde aprobado: no se tocan sus gastos; si Rindegastos cambio el total, se marca
-- cambio_rg para que contabilidad lo revise. Categorias nuevas entran a la tabla de cuentas sin cuenta. Un
-- informe exportado (o aprobado) cuyo asiento aparece en SAP pasa a integrado.
create or replace function public.rg_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_informes   integer;
  v_gastos     integer;
  v_cambios    integer;
  v_integrados integer;
begin
  -- catalogos de SAP
  if jsonb_array_length(coalesce(p -> 'cuentas', '[]')) > 0 then
    update rg_cuentas_sap s set activa = false
    where not exists (select 1 from jsonb_array_elements(p -> 'cuentas') f where f ->> 'codigo' = s.codigo);
    insert into rg_cuentas_sap (codigo, codigo_formato, nombre, activa)
    select f ->> 'codigo', nullif(f ->> 'codigo_formato', ''), f ->> 'nombre', true from jsonb_array_elements(p -> 'cuentas') f
    on conflict (codigo) do update set codigo_formato = excluded.codigo_formato, nombre = excluded.nombre, activa = true;
  end if;
  if jsonb_array_length(coalesce(p -> 'socios', '[]')) > 0 then
    update rg_socios_sap s set activo = false
    where not exists (select 1 from jsonb_array_elements(p -> 'socios') f where f ->> 'codigo' = s.codigo);
    insert into rg_socios_sap (codigo, nombre, rut, cuenta_asociada, activo)
    select f ->> 'codigo', coalesce(f ->> 'nombre', ''), nullif(f ->> 'rut', ''), nullif(f ->> 'cuenta_asociada', ''),
           coalesce((f ->> 'activo')::boolean, true)
    from jsonb_array_elements(p -> 'socios') f
    on conflict (codigo) do update set nombre = excluded.nombre, rut = excluded.rut,
      cuenta_asociada = excluded.cuenta_asociada, activo = excluded.activo;
  end if;
  if jsonb_array_length(coalesce(p -> 'proyectos', '[]')) > 0 then
    insert into rg_proyectos_sap (codigo, nombre, activo)
    select f ->> 'codigo', f ->> 'nombre', coalesce((f ->> 'activo')::boolean, true) from jsonb_array_elements(p -> 'proyectos') f
    on conflict (codigo) do update set nombre = excluded.nombre, activo = excluded.activo;
  end if;
  if jsonb_array_length(coalesce(p -> 'periodos', '[]')) > 0 then
    insert into rg_periodos_sap (periodo, estado)
    select to_date(f ->> 'periodo', 'YYYY-MM'), f ->> 'estado' from jsonb_array_elements(p -> 'periodos') f
    on conflict (periodo) do update set estado = excluded.estado;
  end if;

  create temp table _rg_inf on commit drop as
  select (f ->> 'id')::bigint as id, f ->> 'folio' as folio, f ->> 'titulo' as titulo,
         (f ->> 'empleado_id')::bigint as empleado_id, f ->> 'empleado_nombre' as empleado_nombre,
         f ->> 'empleado_email' as empleado_email, nullif(f ->> 'empleado_rut', '') as empleado_rut,
         nullif(f ->> 'empleado_ceco', '') as empleado_ceco, f ->> 'politica' as politica, nullif(f ->> 'fondo', '') as fondo,
         f ->> 'aprobador' as aprobador, (f ->> 'fecha_envio')::date as fecha_envio, (f ->> 'fecha_cierre')::date as fecha_cierre,
         coalesce((f ->> 'total')::numeric, 0) as total, coalesce((f ->> 'total_aprobado')::numeric, 0) as total_aprobado,
         coalesce(nullif(f ->> 'moneda', ''), 'CLP') as moneda, nullif(f ->> 'nota', '') as nota,
         coalesce(f -> 'campos', '{}') as campos, coalesce(f -> 'archivos', '[]') as archivos,
         coalesce((f ->> 'integrado_rg')::boolean, false) as integrado_rg
  from jsonb_array_elements(coalesce(p -> 'informes', '[]')) f;

  -- desde aprobado, con otro total en Rindegastos
  with c as (
    update rg_informes i set cambio_rg = true
    from _rg_inf n where n.id = i.id and i.estado not in ('pendiente', 'observado') and not i.cambio_rg
      and n.total_aprobado <> i.total_aprobado
    returning i.id, i.total_aprobado, n.total_aprobado as nuevo
  ), h as (
    insert into rg_historial (informe_id, accion, detalle)
    select id, 'cambio_rg', 'Rindegastos cambió el total aprobado de ' || total_aprobado || ' a ' || nuevo from c
    returning 1
  ) select count(*) into v_cambios from h;

  insert into rg_informes (id, folio, titulo, empleado_id, empleado_nombre, empleado_email, empleado_rut, empleado_ceco,
                           politica, fondo, aprobador, fecha_envio, fecha_cierre, total, total_aprobado, moneda, nota,
                           campos, archivos, integrado_rg, sincronizado_en)
  select id, folio, titulo, empleado_id, empleado_nombre, empleado_email, empleado_rut, empleado_ceco, politica, fondo,
         aprobador, fecha_envio, fecha_cierre, total, total_aprobado, moneda, nota, campos, archivos, integrado_rg, now()
  from _rg_inf
  on conflict (id) do update set
    folio = excluded.folio, titulo = excluded.titulo, empleado_id = excluded.empleado_id,
    empleado_nombre = excluded.empleado_nombre, empleado_email = excluded.empleado_email,
    integrado_rg = excluded.integrado_rg, sincronizado_en = now(),
    politica = excluded.politica, fondo = excluded.fondo, aprobador = excluded.aprobador,
    fecha_envio = excluded.fecha_envio, fecha_cierre = excluded.fecha_cierre, nota = excluded.nota,
    archivos = excluded.archivos,
    -- reabierto: ya trae lo nuevo de Rindegastos
    cambio_rg = rg_informes.cambio_rg and rg_informes.estado not in ('pendiente', 'observado'),
    -- lo que define el asiento solo cambia mientras no este aprobado
    empleado_rut   = case when rg_informes.estado in ('pendiente', 'observado') then excluded.empleado_rut else rg_informes.empleado_rut end,
    empleado_ceco  = case when rg_informes.estado in ('pendiente', 'observado') then excluded.empleado_ceco else rg_informes.empleado_ceco end,
    total          = case when rg_informes.estado in ('pendiente', 'observado') then excluded.total else rg_informes.total end,
    total_aprobado = case when rg_informes.estado in ('pendiente', 'observado') then excluded.total_aprobado else rg_informes.total_aprobado end,
    moneda         = case when rg_informes.estado in ('pendiente', 'observado') then excluded.moneda else rg_informes.moneda end,
    campos         = case when rg_informes.estado in ('pendiente', 'observado') then excluded.campos else rg_informes.campos end;
  get diagnostics v_informes = row_count;

  create temp table _rg_gas on commit drop as
  select (f ->> 'id')::bigint as id, (f ->> 'informe_id')::bigint as informe_id, coalesce((f ->> 'estado_rg')::smallint, 0) as estado_rg,
         (f ->> 'fecha')::date as fecha, nullif(f ->> 'proveedor', '') as proveedor, coalesce(f ->> 'categoria', '') as categoria,
         nullif(f ->> 'categoria_codigo', '') as categoria_codigo, nullif(f ->> 'categoria_grupo', '') as categoria_grupo,
         coalesce((f ->> 'neto')::numeric, 0) as neto, coalesce((f ->> 'iva')::numeric, 0) as iva,
         coalesce((f ->> 'otros_impuestos')::numeric, 0) as otros_impuestos, coalesce((f ->> 'retencion')::numeric, 0) as retencion,
         coalesce((f ->> 'total')::numeric, 0) as total, coalesce(nullif(f ->> 'moneda', ''), 'CLP') as moneda,
         (f ->> 'monto_original')::numeric as monto_original, nullif(f ->> 'moneda_original', '') as moneda_original,
         coalesce((f ->> 'reembolsable')::boolean, true) as reembolsable, nullif(f ->> 'nota', '') as nota,
         coalesce(f -> 'campos', '{}') as campos, coalesce(f -> 'archivos', '[]') as archivos
  from jsonb_array_elements(coalesce(p -> 'gastos', '[]')) f
  where (f ->> 'informe_id')::bigint in (
    select i.id from rg_informes i join _rg_inf n on n.id = i.id where i.estado in ('pendiente', 'observado'));

  -- gastos que ya no estan en un informe pendiente u observado que vino
  delete from rg_gastos g
  using rg_informes i, _rg_inf n
  where g.informe_id = i.id and n.id = i.id and i.estado in ('pendiente', 'observado')
    and not exists (select 1 from _rg_gas x where x.id = g.id);

  insert into rg_gastos (id, informe_id, estado_rg, fecha, proveedor, categoria, categoria_codigo, categoria_grupo,
                         tipo_documento, numero_documento, rut_proveedor, neto, iva, otros_impuestos, retencion, total, moneda,
                         monto_original, moneda_original, reembolsable, nota, campos, archivos)
  select x.id, x.informe_id, x.estado_rg, x.fecha, x.proveedor, x.categoria, x.categoria_codigo, x.categoria_grupo,
         nullif(btrim(x.campos ->> c.campo_tipo_documento), ''), nullif(btrim(x.campos ->> c.campo_numero_documento), ''),
         nullif(btrim(x.campos ->> c.campo_rut_proveedor), ''),
         x.neto, x.iva, x.otros_impuestos, x.retencion, x.total, x.moneda, x.monto_original, x.moneda_original,
         x.reembolsable, x.nota, x.campos, x.archivos
  from _rg_gas x cross join rg_config c where c.id
  on conflict (id) do update set
    informe_id = excluded.informe_id, estado_rg = excluded.estado_rg, fecha = excluded.fecha, proveedor = excluded.proveedor,
    categoria = excluded.categoria, categoria_codigo = excluded.categoria_codigo, categoria_grupo = excluded.categoria_grupo,
    tipo_documento = excluded.tipo_documento, numero_documento = excluded.numero_documento,
    rut_proveedor = excluded.rut_proveedor, neto = excluded.neto,
    iva = excluded.iva, otros_impuestos = excluded.otros_impuestos, retencion = excluded.retencion, total = excluded.total,
    moneda = excluded.moneda, monto_original = excluded.monto_original, moneda_original = excluded.moneda_original,
    reembolsable = excluded.reembolsable, nota = excluded.nota, campos = excluded.campos, archivos = excluded.archivos;
  get diagnostics v_gastos = row_count;

  insert into rg_categorias (categoria, categoria_codigo)
  select categoria, max(categoria_codigo) from _rg_gas where categoria <> '' group by categoria
  on conflict (categoria) do update set categoria_codigo = coalesce(excluded.categoria_codigo, rg_categorias.categoria_codigo);

  -- asientos ya importados en SAP
  with a as (
    select distinct on (substring(f ->> 'ref2' from '^RG-(\d+)$')::bigint)
           substring(f ->> 'ref2' from '^RG-(\d+)$')::bigint as id, (f ->> 'trans_id')::integer as trans_id,
           (f ->> 'numero')::integer as numero
    from jsonb_array_elements(coalesce(p -> 'asientos_sap', '[]')) f
    where f ->> 'ref2' ~ '^RG-\d+$'
    order by substring(f ->> 'ref2' from '^RG-(\d+)$')::bigint, (f ->> 'trans_id')::integer desc
  ), u as (
    update rg_informes i set estado = 'integrado', sap_trans_id = a.trans_id, sap_numero = a.numero, integrado_en = now()
    from a where a.id = i.id and i.estado in ('aprobado', 'exportado')
    returning i.id, a.numero
  ), h as (
    insert into rg_historial (informe_id, accion, detalle)
    select id, 'integrado', 'Asiento SAP N° ' || numero from u
    returning 1
  ) select count(*) into v_integrados from h;

  insert into rg_estado (id, sincronizado_en, informes, gastos, mensaje)
  values (true, now(), (select count(*) from rg_informes), (select count(*) from rg_gastos), nullif(p ->> 'mensaje', ''))
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, informes = excluded.informes,
    gastos = excluded.gastos, mensaje = excluded.mensaje;

  return jsonb_build_object('informes', v_informes, 'gastos', v_gastos, 'cambios_rg', v_cambios, 'integrados', v_integrados,
                            'cuentas', jsonb_array_length(coalesce(p -> 'cuentas', '[]')),
                            'socios', jsonb_array_length(coalesce(p -> 'socios', '[]')));
end;
$$;

-- Integrados que faltan marcar en Rindegastos (la tarea los marca y avisa con rg_marcar_rindegastos).
create or replace function public.rg_por_marcar()
returns table (id bigint, sap_numero integer, fecha_asiento date)
language sql stable security definer set search_path = public as $$
  select i.id, i.sap_numero, i.fecha_asiento from rg_informes i
  where i.estado = 'integrado' and i.rg_marcado_en is null and (select marcar_rindegastos from rg_config where id)
  order by i.id
$$;

-- p = [{id, ok: bool, error}]: resultado de marcar en Rindegastos.
create or replace function public.rg_marcar_rindegastos(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with f as (
    select (x ->> 'id')::bigint as id, coalesce((x ->> 'ok')::boolean, false) as ok, x ->> 'error' as error
    from jsonb_array_elements(p) x
  ), u as (
    update rg_informes i set rg_marcado_en = case when f.ok then now() end, rg_marca_error = case when not f.ok then f.error end,
      integrado_rg = integrado_rg or f.ok
    from f where f.id = i.id
    returning i.id, f.ok, f.error, i.sap_numero
  ), h as (
    insert into rg_historial (informe_id, accion, detalle)
    select id, 'marcado_rg', case when ok then 'Marcada como integrada en Rindegastos (asiento ' || sap_numero || ')'
                                  else 'No se pudo marcar en Rindegastos: ' || coalesce(error, '?') end
    from u where ok   -- los errores quedan en rg_marca_error (se reintenta cada hora sin llenar el historial)
    returning 1
  ) select count(*) into v_n from u;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- permisos de las funciones

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'rg\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
grant execute on function
  public.rg_puede_ver(), public.rg_puede_aprobar(), public.rg_ceco_de(text), public.rg_proyecto_de(text),
  public.rg_socio_de(text, text), public.rg_es_factura(public.rg_gastos, public.rg_config),
  public.rg_motivo_exclusion(public.rg_gastos, public.rg_categorias, public.rg_config), public.rg_problemas(bigint),
  public.rg_periodo_cerrado(date), public.rg_guardar_gasto(bigint, jsonb),
  public.rg_cambiar_estado(bigint, text, text, date), public.rg_crear_lote(bigint[]), public.rg_anular_lote(integer, text),
  public.rg_guardar_categorias(jsonb), public.rg_guardar_config(jsonb)
  to authenticated;
grant execute on function public.rg_sincronizar(jsonb), public.rg_por_marcar(), public.rg_marcar_rindegastos(jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;

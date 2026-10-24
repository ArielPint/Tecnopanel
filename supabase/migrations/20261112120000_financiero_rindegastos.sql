-- Portal Financiero > Rendiciones (Rindegastos -> SAP), FASE 1: lectura y asiento propuesto. SOLO EN EL SERVIDOR.
-- stack\tareas\sincronizar-rindegastos.ps1 trae de la API v2 de Rindegastos los informes cerrados (aprobados) y
-- aun no integrados, con sus gastos, y de SAP (HANA, solo lectura) el plan de cuentas imputable, los proyectos y
-- el estado de los periodos contables; escribe con la RPC rg_sincronizar (service_role).
-- En el portal contabilidad revisa cada rendicion, corrige cuenta, CECO o proyecto de un gasto, y la aprueba,
-- observa o reabre. En esta fase NADA se escribe en SAP ni en Rindegastos (fase 2: archivo de importacion).
--
--   rg_informes      un informe (rendicion) de Rindegastos + su estado en el portal
--   rg_gastos        sus gastos + las correcciones de contabilidad (incluir, cuenta, ceco, proyecto)
--   rg_categorias    tabla de cuentas: categoria de Rindegastos -> cuenta contable y regla de CECO
--   rg_config        contrapartida y nombres de los campos extra (CECO, proyecto, tipo de documento)
--   rg_cuentas_sap, rg_proyectos_sap, rg_periodos_sap   catalogos de SAP para validar
--   rg_historial     quien hizo que y cuando
--   rg_asiento_lineas (vista)  el asiento propuesto: una linea al debe por gasto incluido y la contrapartida
--
-- Accesos (ancla del portal Financiero, ver 20261019120000_financiero_sap.sql):
--   modulo_key 'fin:rendiciones'          ver la bandeja y el asiento propuesto
--   modulo_key 'fin:rendiciones_aprobar'  ademas corregir, aprobar, observar, reabrir y editar la tabla de cuentas
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
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'observado', 'aprobado')),
  observacion       text,
  fecha_asiento     date,                          -- fecha contable elegida al aprobar
  aprobado_por      uuid references auth.users (id) on delete set null,
  aprobado_en       timestamptz,
  -- Rindegastos cambio el informe despues de aprobado en el portal (los gastos quedaron congelados)
  cambio_rg         boolean not null default false,
  actualizado_por   uuid references auth.users (id) on delete set null,
  actualizado_en    timestamptz not null default now()
);
create index if not exists rg_informes_estado_idx on public.rg_informes (estado, fecha_cierre desc);

create table if not exists public.rg_gastos (
  id                bigint primary key,            -- Id del gasto en Rindegastos
  informe_id        bigint not null references public.rg_informes (id) on delete cascade,
  estado_rg         smallint not null,             -- 1 aprobado, 2 rechazado, 0 en proceso
  fecha             date,                          -- IssueDate
  proveedor         text,
  categoria         text not null default '',
  categoria_codigo  text,
  categoria_grupo   text,
  tipo_documento    text,                          -- del campo extra configurado (rg_config.campo_tipo_documento)
  numero_documento  text,
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
  cuenta_contrapartida   text,                     -- haber: cuenta por pagar al colaborador o fondo por rendir
  campo_ceco             text,                     -- campo extra (del gasto o del informe) con el CECO
  campo_proyecto         text,                     -- campo extra con el proyecto de SAP
  campo_tipo_documento   text,                     -- campo extra con el tipo de documento (boleta, factura...)
  campo_numero_documento text,
  tipos_excluidos        text[] not null default '{factura}', -- tipos de documento que no van (contienen el texto)
  excluir_con_iva        boolean not null default true, -- sin tipo de documento: excluir si trae IVA (parece factura)
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

create table if not exists public.rg_proyectos_sap (
  codigo  text primary key,                        -- OPRJ.PrjCode
  nombre  text not null,
  activo  boolean not null default true
);

create table if not exists public.rg_periodos_sap (
  periodo  date primary key,                       -- primer dia del mes
  estado   text not null                           -- OFPR.PeriodStat: N abierto, Y bloqueado, C/S cerrandose
);

create table if not exists public.rg_historial (
  id          bigserial primary key,
  informe_id  bigint not null references public.rg_informes (id) on delete cascade,
  accion      text not null,                       -- aprobado | observado | reabierto | gasto | cambio_rg
  detalle     text,
  usuario     uuid references auth.users (id) on delete set null,
  en          timestamptz not null default now()
);
create index if not exists rg_historial_informe_idx on public.rg_historial (informe_id, en);
alter table public.rg_historial add column if not exists usuario_nombre text;

-- nombre de quien hizo la accion (profiles no es legible para todos)
create or replace function public.rg_historial_nombre()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario is not null and new.usuario_nombre is null then
    select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email) into new.usuario_nombre
    from profiles p where p.id = new.usuario;
  end if;
  return new;
end;
$$;
drop trigger if exists rg_historial_nombre on public.rg_historial;
create trigger rg_historial_nombre before insert on public.rg_historial for each row execute function public.rg_historial_nombre();

create table if not exists public.rg_estado (
  id               boolean primary key default true check (id),
  sincronizado_en  timestamptz not null,
  informes         integer not null,
  gastos           integer not null,
  mensaje          text
);

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

-- Por que un gasto queda fuera del asiento (null = va). La correccion de contabilidad (incluir) manda.
create or replace function public.rg_motivo_exclusion(g public.rg_gastos, c public.rg_categorias, cfg public.rg_config)
returns text language sql stable as $$
  select case
    when g.estado_rg <> 1 then 'Gasto no aprobado en Rindegastos'
    when g.incluir is true then null
    when g.incluir is false then 'Excluido por contabilidad'
    when coalesce(c.excluir, false) then 'Categoría excluida en la tabla de cuentas'
    when g.tipo_documento is not null and exists (
           select 1 from unnest(cfg.tipos_excluidos) t where t <> '' and g.tipo_documento ilike '%' || t || '%')
      then 'Tipo de documento excluido (' || g.tipo_documento || ')'
    when g.tipo_documento is null and cfg.excluir_con_iva and g.iva > 0 then 'Trae IVA: parece factura'
  end
$$;

-- Una fila por gasto (al debe) y una contrapartida por informe (al haber). Solo filas visibles para quien
-- llama (security_invoker: aplica la seguridad de rg_gastos y rg_informes).
create or replace view public.rg_asiento_lineas with (security_invoker = true) as
with cfg as (select * from rg_config where id),
gastos as (
  select g.informe_id, g.id as gasto_id, g.fecha, g.categoria, g.proveedor, g.total, g.moneda,
         rg_motivo_exclusion(g, c, cfg) as motivo_exclusion,
         coalesce(g.cuenta, c.cuenta) as cuenta,
         coalesce(g.ceco, case coalesce(c.regla_ceco, 'campo')
           when 'campo'    then rg_ceco_de(coalesce(g.campos ->> cfg.campo_ceco, i.campos ->> cfg.campo_ceco))
           when 'empleado' then rg_ceco_de(i.empleado_ceco)
           when 'fijo'     then c.ceco_fijo
         end) as ceco,
         coalesce(g.proyecto, rg_proyecto_de(coalesce(g.campos ->> cfg.campo_proyecto, i.campos ->> cfg.campo_proyecto))) as proyecto,
         coalesce(g.glosa, left(concat_ws(' · ', nullif(g.categoria, ''), g.proveedor, g.numero_documento), 100)) as glosa
  from rg_gastos g
  join rg_informes i on i.id = g.informe_id
  cross join cfg
  left join rg_categorias c on c.categoria = g.categoria
)
select g.informe_id, g.gasto_id, 'debe'::text as lado, g.cuenta, g.ceco, g.proyecto, g.glosa,
       g.total as debe, 0::numeric(16, 2) as haber, g.motivo_exclusion
from gastos g
union all
select i.id, null, 'haber', (select cuenta_contrapartida from cfg), null, null,
       left(concat_ws(' ', 'Rendición', i.folio, i.empleado_nombre), 100),
       0, coalesce((select sum(g.total) from gastos g where g.informe_id = i.id and g.motivo_exclusion is null), 0), null
from rg_informes i;

-- Problemas que impiden aprobar un informe (lista vacia = se puede). null si quien llama no ve rendiciones.
create or replace function public.rg_problemas(p_informe bigint)
returns text[] language sql stable security definer set search_path = public as $$
  with l as (select * from rg_asiento_lineas where informe_id = p_informe and motivo_exclusion is null and rg_puede_ver())
  select case when rg_puede_ver() then coalesce(array_agg(x order by orden), '{}') end from (
    select 1 as orden, 'No hay gastos para contabilizar' as x
      where not exists (select 1 from l where lado = 'debe')
    union all
    select 2, 'Falta la cuenta de contrapartida (tabla de cuentas)'
      where not exists (select 1 from l where lado = 'haber' and cuenta is not null)
    union all
    select 3, 'Gastos sin cuenta: ' || count(*) from l where lado = 'debe' and cuenta is null having count(*) > 0
    union all
    select 4, 'Cuenta que no existe en SAP: ' || string_agg(distinct l.cuenta, ', ')
      from l where l.cuenta is not null and not exists (select 1 from rg_cuentas_sap s where s.codigo = l.cuenta and s.activa)
      having count(*) > 0
    union all
    select 5, 'Gastos sin CECO: ' || count(*) from l where lado = 'debe' and ceco is null having count(*) > 0
    union all
    select 6, 'CECO que no existe en SAP: ' || string_agg(distinct l.ceco, ', ')
      from l where l.ceco is not null and not exists (select 1 from fin_cecos c where c.codigo = l.ceco and c.activo)
      having count(*) > 0
    union all
    select 7, 'Proyecto que no existe en SAP: ' || string_agg(distinct l.proyecto, ', ')
      from l where l.proyecto is not null and not exists (select 1 from rg_proyectos_sap p where p.codigo = l.proyecto)
      having count(*) > 0
    union all
    select 8, 'Gastos en otra moneda que CLP: ' || count(*)
      from rg_gastos g where g.informe_id = p_informe and g.moneda <> 'CLP'
        and exists (select 1 from l where l.gasto_id = g.id) having count(*) > 0
  ) t
$$;

-- ---------------------------------------------------------------- seguridad por fila

alter table public.rg_informes      enable row level security;
alter table public.rg_gastos        enable row level security;
alter table public.rg_categorias    enable row level security;
alter table public.rg_config        enable row level security;
alter table public.rg_cuentas_sap   enable row level security;
alter table public.rg_proyectos_sap enable row level security;
alter table public.rg_periodos_sap  enable row level security;
alter table public.rg_historial     enable row level security;
alter table public.rg_estado        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rg_informes', 'rg_gastos', 'rg_categorias', 'rg_config', 'rg_cuentas_sap', 'rg_proyectos_sap',
                           'rg_periodos_sap', 'rg_historial', 'rg_estado']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select public.rg_puede_ver()))', t);
    execute format('revoke all on public.%s from anon, authenticated', t);
    execute format('grant select on public.%s to authenticated', t);
  end loop;
end $$;
revoke all on public.rg_asiento_lineas from anon, authenticated;
grant select on public.rg_asiento_lineas to authenticated;
revoke all on sequence public.rg_historial_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- acciones de contabilidad

create or replace function public.rg_exigir_aprobar()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not rg_puede_aprobar() then
    raise exception 'Sin permiso para revisar rendiciones' using errcode = '42501';
  end if;
end;
$$;

-- p = {incluir: bool|null, cuenta, ceco, proyecto, glosa} (texto vacio o null = volver a la regla).
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
  if v_estado = 'aprobado' then raise exception 'La rendición está aprobada: reábrela para corregirla'; end if;

  update rg_gastos set
    incluir  = case when p ? 'incluir' then (p ->> 'incluir')::boolean else incluir end,
    cuenta   = case when p ? 'cuenta' then nullif(btrim(p ->> 'cuenta'), '') else cuenta end,
    ceco     = case when p ? 'ceco' then nullif(btrim(p ->> 'ceco'), '') else ceco end,
    proyecto = case when p ? 'proyecto' then nullif(btrim(p ->> 'proyecto'), '') else proyecto end,
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
    case when p ? 'glosa' then 'glosa' end), auth.uid());
end;
$$;

-- p_estado: aprobado (valida el asiento; p_fecha = fecha contable) | observado (p_observacion obligatoria)
-- | pendiente (reabrir). Devuelve el estado del periodo de SAP de la fecha (para avisar si esta bloqueado).
create or replace function public.rg_cambiar_estado(p_informe bigint, p_estado text, p_observacion text default null,
                                                    p_fecha date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actual    text;
  v_problemas text[];
  v_periodo   text;
begin
  perform rg_exigir_aprobar();
  select estado into v_actual from rg_informes where id = p_informe for update;
  if v_actual is null then raise exception 'Rendición % no existe', p_informe; end if;

  if p_estado = 'aprobado' then
    if v_actual = 'aprobado' then raise exception 'La rendición ya está aprobada'; end if;
    if p_fecha is null then raise exception 'Indica la fecha contable del asiento'; end if;
    v_problemas := rg_problemas(p_informe);
    if cardinality(v_problemas) > 0 then
      raise exception 'No se puede aprobar: %', array_to_string(v_problemas, '; ');
    end if;
    select estado into v_periodo from rg_periodos_sap where periodo = date_trunc('month', p_fecha)::date;
    if v_periodo is distinct from 'N' then
      raise exception 'El período % no está abierto en SAP (%): elige otra fecha', to_char(p_fecha, 'MM-YYYY'),
        coalesce(case v_periodo when 'Y' then 'bloqueado' when 'C' then 'cerrándose' when 'S' then 'cerrándose' else v_periodo end,
                 'no existe');
    end if;
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

-- p = {cuenta_contrapartida, campo_ceco, campo_proyecto, campo_tipo_documento, campo_numero_documento,
--      tipos_excluidos: [..], excluir_con_iva, desde}
create or replace function public.rg_guardar_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform rg_exigir_aprobar();
  if nullif(p ->> 'cuenta_contrapartida', '') is not null
     and not exists (select 1 from rg_cuentas_sap s where s.codigo = p ->> 'cuenta_contrapartida') then
    raise exception 'La cuenta de contrapartida no existe en SAP';
  end if;
  update rg_config set
    cuenta_contrapartida   = nullif(p ->> 'cuenta_contrapartida', ''),
    campo_ceco             = nullif(btrim(p ->> 'campo_ceco'), ''),
    campo_proyecto         = nullif(btrim(p ->> 'campo_proyecto'), ''),
    campo_tipo_documento   = nullif(btrim(p ->> 'campo_tipo_documento'), ''),
    campo_numero_documento = nullif(btrim(p ->> 'campo_numero_documento'), ''),
    tipos_excluidos        = coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(p -> 'tipos_excluidos') x
                                       where btrim(x) <> ''), '{}'),
    excluir_con_iva        = coalesce((p ->> 'excluir_con_iva')::boolean, true),
    desde                  = coalesce((p ->> 'desde')::date, desde),
    actualizado_por = auth.uid(), actualizado_en = now()
  where id;
  -- el tipo y numero de documento salen de los campos extra: se recalculan con los nombres nuevos
  update rg_gastos g set
    tipo_documento   = nullif(btrim(g.campos ->> c.campo_tipo_documento), ''),
    numero_documento = nullif(btrim(g.campos ->> c.campo_numero_documento), '')
  from rg_config c where c.id;
end;
$$;

-- ---------------------------------------------------------------- sincronizacion

-- p = { informes: [{id, folio, titulo, empleado_id, empleado_nombre, empleado_email, empleado_rut, empleado_ceco,
--                   politica, fondo, aprobador, fecha_envio, fecha_cierre, total, total_aprobado, moneda, nota,
--                   campos: {}, archivos: [], integrado_rg}],
--       gastos:   [{id, informe_id, estado_rg, fecha, proveedor, categoria, categoria_codigo, categoria_grupo, neto,
--                   iva, otros_impuestos, retencion, total, moneda, monto_original, moneda_original, reembolsable,
--                   nota, campos: {}, archivos: []}],          todos los gastos de cada informe que viene
--       cuentas:  [{codigo, codigo_formato, nombre}],          plan de cuentas imputable de SAP (si viene, reemplaza)
--       proyectos:[{codigo, nombre, activo}],
--       periodos: [{periodo: 'YYYY-MM', estado}] }
-- Informes pendientes u observados: se reemplazan sus datos y gastos (las correcciones de contabilidad de un
-- gasto que sigue se conservan). Aprobados: no se tocan sus gastos; si Rindegastos cambio el total, se marca
-- cambio_rg para que contabilidad lo revise. Categorias nuevas entran a la tabla de cuentas sin cuenta.
create or replace function public.rg_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_informes integer;
  v_gastos   integer;
  v_cambios  integer;
begin
  -- catalogos de SAP
  if jsonb_array_length(coalesce(p -> 'cuentas', '[]')) > 0 then
    update rg_cuentas_sap s set activa = false
    where not exists (select 1 from jsonb_array_elements(p -> 'cuentas') f where f ->> 'codigo' = s.codigo);
    insert into rg_cuentas_sap (codigo, codigo_formato, nombre, activa)
    select f ->> 'codigo', nullif(f ->> 'codigo_formato', ''), f ->> 'nombre', true from jsonb_array_elements(p -> 'cuentas') f
    on conflict (codigo) do update set codigo_formato = excluded.codigo_formato, nombre = excluded.nombre, activa = true;
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
         f ->> 'empleado_email' as empleado_email, f ->> 'empleado_rut' as empleado_rut,
         nullif(f ->> 'empleado_ceco', '') as empleado_ceco, f ->> 'politica' as politica, nullif(f ->> 'fondo', '') as fondo,
         f ->> 'aprobador' as aprobador, (f ->> 'fecha_envio')::date as fecha_envio, (f ->> 'fecha_cierre')::date as fecha_cierre,
         coalesce((f ->> 'total')::numeric, 0) as total, coalesce((f ->> 'total_aprobado')::numeric, 0) as total_aprobado,
         coalesce(nullif(f ->> 'moneda', ''), 'CLP') as moneda, nullif(f ->> 'nota', '') as nota,
         coalesce(f -> 'campos', '{}') as campos, coalesce(f -> 'archivos', '[]') as archivos,
         coalesce((f ->> 'integrado_rg')::boolean, false) as integrado_rg
  from jsonb_array_elements(coalesce(p -> 'informes', '[]')) f;

  -- aprobados en el portal con otro total en Rindegastos
  with c as (
    update rg_informes i set cambio_rg = true
    from _rg_inf n where n.id = i.id and i.estado = 'aprobado' and not i.cambio_rg and n.total_aprobado <> i.total_aprobado
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
    empleado_rut = excluded.empleado_rut, integrado_rg = excluded.integrado_rg, sincronizado_en = now(),
    -- reabierto: ya trae lo nuevo de Rindegastos
    cambio_rg = rg_informes.cambio_rg and rg_informes.estado = 'aprobado',
    -- lo que define el asiento solo cambia mientras no este aprobado
    empleado_ceco  = case when rg_informes.estado = 'aprobado' then rg_informes.empleado_ceco else excluded.empleado_ceco end,
    politica       = excluded.politica, fondo = excluded.fondo, aprobador = excluded.aprobador,
    fecha_envio    = excluded.fecha_envio, fecha_cierre = excluded.fecha_cierre, nota = excluded.nota,
    archivos       = excluded.archivos,
    total          = case when rg_informes.estado = 'aprobado' then rg_informes.total else excluded.total end,
    total_aprobado = case when rg_informes.estado = 'aprobado' then rg_informes.total_aprobado else excluded.total_aprobado end,
    moneda         = case when rg_informes.estado = 'aprobado' then rg_informes.moneda else excluded.moneda end,
    campos         = case when rg_informes.estado = 'aprobado' then rg_informes.campos else excluded.campos end;
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
    select i.id from rg_informes i join _rg_inf n on n.id = i.id where i.estado <> 'aprobado');

  -- gastos que ya no estan en un informe no aprobado que vino
  delete from rg_gastos g
  using rg_informes i, _rg_inf n
  where g.informe_id = i.id and n.id = i.id and i.estado <> 'aprobado'
    and not exists (select 1 from _rg_gas x where x.id = g.id);

  insert into rg_gastos (id, informe_id, estado_rg, fecha, proveedor, categoria, categoria_codigo, categoria_grupo,
                         tipo_documento, numero_documento, neto, iva, otros_impuestos, retencion, total, moneda,
                         monto_original, moneda_original, reembolsable, nota, campos, archivos)
  select x.id, x.informe_id, x.estado_rg, x.fecha, x.proveedor, x.categoria, x.categoria_codigo, x.categoria_grupo,
         nullif(btrim(x.campos ->> c.campo_tipo_documento), ''), nullif(btrim(x.campos ->> c.campo_numero_documento), ''),
         x.neto, x.iva, x.otros_impuestos, x.retencion, x.total, x.moneda, x.monto_original, x.moneda_original,
         x.reembolsable, x.nota, x.campos, x.archivos
  from _rg_gas x cross join rg_config c where c.id
  on conflict (id) do update set
    informe_id = excluded.informe_id, estado_rg = excluded.estado_rg, fecha = excluded.fecha, proveedor = excluded.proveedor,
    categoria = excluded.categoria, categoria_codigo = excluded.categoria_codigo, categoria_grupo = excluded.categoria_grupo,
    tipo_documento = excluded.tipo_documento, numero_documento = excluded.numero_documento, neto = excluded.neto,
    iva = excluded.iva, otros_impuestos = excluded.otros_impuestos, retencion = excluded.retencion, total = excluded.total,
    moneda = excluded.moneda, monto_original = excluded.monto_original, moneda_original = excluded.moneda_original,
    reembolsable = excluded.reembolsable, nota = excluded.nota, campos = excluded.campos, archivos = excluded.archivos;
  get diagnostics v_gastos = row_count;

  insert into rg_categorias (categoria, categoria_codigo)
  select categoria, max(categoria_codigo) from _rg_gas where categoria <> '' group by categoria
  on conflict (categoria) do update set categoria_codigo = coalesce(excluded.categoria_codigo, rg_categorias.categoria_codigo);

  insert into rg_estado (id, sincronizado_en, informes, gastos, mensaje)
  values (true, now(), (select count(*) from rg_informes), (select count(*) from rg_gastos), nullif(p ->> 'mensaje', ''))
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, informes = excluded.informes,
    gastos = excluded.gastos, mensaje = excluded.mensaje;

  return jsonb_build_object('informes', v_informes, 'gastos', v_gastos, 'cambios_rg', v_cambios,
                            'cuentas', jsonb_array_length(coalesce(p -> 'cuentas', '[]')));
end;
$$;

-- ---------------------------------------------------------------- permisos de las funciones

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'rg\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function
  public.rg_puede_ver(), public.rg_puede_aprobar(), public.rg_ceco_de(text), public.rg_proyecto_de(text),
  public.rg_motivo_exclusion(public.rg_gastos, public.rg_categorias, public.rg_config), public.rg_problemas(bigint),
  public.rg_guardar_gasto(bigint, jsonb), public.rg_cambiar_estado(bigint, text, text, date),
  public.rg_guardar_categorias(jsonb), public.rg_guardar_config(jsonb)
  to authenticated;
revoke execute on function public.rg_exigir_aprobar() from authenticated;
revoke all on function public.rg_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.rg_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

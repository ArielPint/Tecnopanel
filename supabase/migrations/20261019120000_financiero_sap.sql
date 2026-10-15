-- Portal Financiero (/financiero): estado de resultados contable desde SAP Business One, por linea de
-- negocio, centro de costo y sucursal. SOLO EN EL SERVIDOR: los datos los trae de SAP (HANA)
-- stack\tareas\sincronizar-sap-financiero.ps1 con la RPC fin_sap_sincronizar (service_role).
--
-- Que se guarda (solo cuentas de resultado, grupos 4 a 8 del plan de cuentas):
--   fin_asientos  una fila por linea de asiento (JDT1), sin los asientos de cierre del ejercicio
--   fin_saldos    los mismos asientos sumados por mes, cuenta, CECO, dimension 2 y proyecto
--   fin_cuentas, fin_cecos, fin_dim2   catalogos de SAP (plan de cuentas, dimension 1, dimension 2)
--   fin_prorrateo % fijo por CECO de linea y ano para repartir TODO el resultado de los CECO 9xxx
-- Linea y sucursal salen del CECO (dimension 1): 11xx-18xx lineas, 9xxx administracion; ultimo digito
-- 1 = Santiago, 2 = Puerto Varas. SAP no tiene multisucursal activada.
-- Signo de los montos: haber - debe (ingresos positivos, costos y gastos negativos).
--
-- Accesos: pseudo-proyecto ancla (slug 'financiero', tipo 'sistema'), un permiso por fila:
--   modulo_key 'fin:<informe>:<sucursal>'  informe eerr | balance | ventas; sucursal Santiago | Puerto Varas
--   modulo_key 'fin:configurar'            edita los % de prorrateo
-- Los admin del hub (rol admin, super admin, root) tienen todo en ambas sucursales.
-- Lo que no tiene sucursal lo ve quien tenga ese informe en alguna sucursal. El prorrateo reparte la
-- administracion de las dos sucursales, asi que quien ve una sucursal ve su parte de la administracion
-- total (sin el detalle de la otra).
-- "Ventas" reutiliza sap_ventas (Gestion > Ventas): aqui solo se agrega la politica de lectura.
--
-- Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla de accesos

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('5e0b9c3a-6f21-4d7e-8a94-c1f3e2d7b680', 'Financiero (sistema)', 'financiero', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del portal Financiero. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.fin_ancla_id()
returns uuid language sql immutable as $$
  select '5e0b9c3a-6f21-4d7e-8a94-c1f3e2d7b680'::uuid
$$;

-- ---------------------------------------------------------------- accesos

create or replace function public.fin_es_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin'))
$$;

-- p_sucursal null: en cualquier sucursal
create or replace function public.fin_usuario_tiene_en(p_informe text, p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select fin_es_admin(p_user_id) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = fin_ancla_id()
      and case when p_sucursal is null then pe.modulo_key like 'fin:' || p_informe || ':%'
               else pe.modulo_key = 'fin:' || p_informe || ':' || p_sucursal end)
$$;

create or replace function public.fin_tiene_en(p_informe text, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select fin_usuario_tiene_en(p_informe, auth.uid(), p_sucursal)
$$;

-- Sucursales donde quien llama tiene ese informe. Las politicas lo usan en un subselect para
-- calcularlo una vez por consulta y no una vez por fila. Una fila sin sucursal la ve quien tenga el
-- informe en alguna (lista no vacia).
create or replace function public.fin_sucursales(p_informe text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s), '{}') from unnest(array['Santiago', 'Puerto Varas']) s where fin_tiene_en(p_informe, s)
$$;

create or replace function public.fin_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select fin_es_admin(p_user_id) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = fin_ancla_id() and pe.modulo_key like 'fin:%')
$$;

create or replace function public.fin_puede_configurar()
returns boolean language sql stable security definer set search_path = public as $$
  select fin_es_admin(auth.uid()) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = auth.uid() and pe.proyecto_id = fin_ancla_id() and pe.modulo_key = 'fin:configurar')
$$;

-- Lo que puede ver quien llama, para armar el menu del portal.
-- { admin, configurar, eerr: [sucursales], balance: [...], ventas: [...] }
create or replace function public.fin_mis_accesos()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin', fin_es_admin(auth.uid()),
    'configurar', fin_puede_configurar(),
    'eerr',    (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('eerr', s)),
    'balance', (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('balance', s)),
    'ventas',  (select coalesce(jsonb_agg(s order by s), '[]') from unnest(array['Puerto Varas', 'Santiago']) s where fin_tiene_en('ventas', s)))
$$;

-- ---------------------------------------------------------------- linea y sucursal del CECO

create or replace function public.fin_linea_de(p_ceco text)
returns text language sql immutable as $$
  select case left(p_ceco, 2)
    when '11' then 'SIP' when '12' then 'Madera' when '13' then 'Acero' when '14' then 'Escaleras'
    when '15' then 'Wall' when '16' then 'Tecno Home' when '17' then 'Viv. Ind. Panelizada'
    when '18' then 'Viv. Ind. Modular'
    else case when p_ceco like '9%' then 'Administración' end
  end
$$;

create or replace function public.fin_sucursal_de(p_ceco text)
returns text language sql immutable as $$
  select case when left(p_ceco, 1) in ('1', '9') then
    case right(p_ceco, 1) when '1' then 'Santiago' when '2' then 'Puerto Varas' end
  end
$$;

-- ---------------------------------------------------------------- tablas

create table if not exists public.fin_cuentas (
  codigo          text primary key,              -- OACT.AcctCode (ej. _SYS00000000764)
  codigo_formato  text,                          -- codigo visible (ej. 4101101)
  nombre          text not null,
  grupo           smallint not null,             -- 4 ingresos, 5 costos, 6 gastos, 7 otros ingresos, 8 otros egresos
  nivel           smallint not null,
  padre           text,                          -- codigo de la cuenta padre
  imputable       boolean not null
);

create table if not exists public.fin_cecos (
  codigo    text primary key,                    -- dimension 1 (OOCR.OcrCode)
  nombre    text not null,
  linea     text,                                -- null = no es linea ni administracion
  sucursal  text check (sucursal in ('Santiago', 'Puerto Varas')),
  tipo      text check (tipo in ('linea', 'administracion')),
  activo    boolean not null default true
);

create table if not exists public.fin_dim2 (
  codigo  text primary key,                      -- dimension 2 "Tarea WIP"
  nombre  text not null
);

create table if not exists public.fin_asientos (
  trans_id    integer not null,                  -- OJDT.TransId
  linea_id    integer not null,                  -- JDT1.Line_ID
  periodo     date    not null,                  -- primer dia del mes de la fecha contable
  fecha       date    not null,                  -- fecha contable (RefDate)
  numero      integer,                           -- numero de asiento visible en SAP
  tipo_trans  text    not null,                  -- OJDT.TransType (13 factura, 30 asiento manual, ...)
  referencia  text,                              -- documento de origen (BaseRef)
  glosa       text,
  cuenta      text    not null,
  ceco        text    not null default '',
  dim2        text    not null default '',
  proyecto    text    not null default '',
  sucursal    text check (sucursal in ('Santiago', 'Puerto Varas')),
  debe        numeric(16, 2) not null,
  haber       numeric(16, 2) not null,
  primary key (trans_id, linea_id)
);
create index if not exists fin_asientos_saldo_idx on public.fin_asientos (periodo, cuenta, ceco);

create table if not exists public.fin_saldos (
  periodo   date not null,
  cuenta    text not null,
  ceco      text not null default '',
  dim2      text not null default '',
  proyecto  text not null default '',
  sucursal  text check (sucursal in ('Santiago', 'Puerto Varas')),
  debe      numeric(16, 2) not null,
  haber     numeric(16, 2) not null,
  lineas    integer not null,
  primary key (periodo, cuenta, ceco, dim2, proyecto)
);

create table if not exists public.fin_prorrateo (
  anio             integer not null check (anio between 2000 and 2100),
  ceco             text    not null references public.fin_cecos (codigo),
  porcentaje       numeric(7, 4) not null check (porcentaje between 0 and 100),
  actualizado_por  uuid references auth.users (id) on delete set null,
  actualizado_en   timestamptz not null default now(),
  primary key (anio, ceco)
);

create table if not exists public.fin_estado (
  id                boolean primary key default true check (id),
  sincronizado_en   timestamptz not null,
  desde             date not null,               -- meses rehechos en la ultima pasada
  hasta             date not null,
  completo_en       timestamptz,                 -- ultima carga completa
  asientos          integer not null,            -- total en la base
  primer_periodo    date,
  ultimo_periodo    date
);

-- ---------------------------------------------------------------- seguridad por fila

alter table public.fin_cuentas   enable row level security;
alter table public.fin_cecos     enable row level security;
alter table public.fin_dim2      enable row level security;
alter table public.fin_asientos  enable row level security;
alter table public.fin_saldos    enable row level security;
alter table public.fin_prorrateo enable row level security;
alter table public.fin_estado    enable row level security;

drop policy if exists fin_cuentas_select on public.fin_cuentas;
create policy fin_cuentas_select on public.fin_cuentas for select to authenticated using ((select public.fin_tiene_acceso()));
drop policy if exists fin_cecos_select on public.fin_cecos;
create policy fin_cecos_select on public.fin_cecos for select to authenticated using ((select public.fin_tiene_acceso()));
drop policy if exists fin_dim2_select on public.fin_dim2;
create policy fin_dim2_select on public.fin_dim2 for select to authenticated using ((select public.fin_tiene_acceso()));
drop policy if exists fin_prorrateo_select on public.fin_prorrateo;
create policy fin_prorrateo_select on public.fin_prorrateo for select to authenticated using ((select public.fin_tiene_acceso()));
drop policy if exists fin_estado_select on public.fin_estado;
create policy fin_estado_select on public.fin_estado for select to authenticated using ((select public.fin_tiene_acceso()));

drop policy if exists fin_asientos_select on public.fin_asientos;
create policy fin_asientos_select on public.fin_asientos for select to authenticated
  using (sucursal = any ((select public.fin_sucursales('eerr'))::text[])
         or (sucursal is null and cardinality((select public.fin_sucursales('eerr'))) > 0));
drop policy if exists fin_saldos_select on public.fin_saldos;
create policy fin_saldos_select on public.fin_saldos for select to authenticated
  using (sucursal = any ((select public.fin_sucursales('eerr'))::text[])
         or (sucursal is null and cardinality((select public.fin_sucursales('eerr'))) > 0));

revoke all on public.fin_cuentas, public.fin_cecos, public.fin_dim2, public.fin_asientos, public.fin_saldos,
              public.fin_prorrateo, public.fin_estado from anon, authenticated;
grant select on public.fin_cuentas, public.fin_cecos, public.fin_dim2, public.fin_asientos, public.fin_saldos,
               public.fin_prorrateo, public.fin_estado to authenticated;

-- Ventas (sap_ventas, de Gestion > Ventas): tambien la ve quien tenga el informe Ventas en esa sucursal.
-- Se suma a la politica de Gestion (las politicas permisivas se combinan con "o").
do $$
begin
  if to_regclass('public.sap_ventas') is not null then
    execute 'drop policy if exists sap_ventas_select_fin on public.sap_ventas';
    execute 'create policy sap_ventas_select_fin on public.sap_ventas for select to authenticated
               using (sucursal = any ((select public.fin_sucursales(''ventas''))::text[])
                      or (sucursal is null and cardinality((select public.fin_sucursales(''ventas''))) > 0))';
    execute 'drop policy if exists sap_ventas_estado_select_fin on public.sap_ventas_estado';
    execute 'create policy sap_ventas_estado_select_fin on public.sap_ventas_estado for select to authenticated
               using (cardinality((select public.fin_sucursales(''ventas''))) > 0)';
  end if;
end $$;

-- ---------------------------------------------------------------- estado de resultados

-- Resultado (haber - debe) entre dos meses, con lo que puede ver quien llama.
-- p_prorratear: el resultado de los CECO 9xxx (las dos sucursales) se reparte en cada mes y cuenta
-- entre los CECO de linea segun fin_prorrateo del ano; esas filas salen con prorrateado = true.
-- Un ano sin % cargados queda sin repartir (la administracion sigue en sus CECO 9xxx).
create or replace function public.fin_eerr(p_desde date, p_hasta date, p_prorratear boolean default false)
returns table (periodo date, cuenta text, ceco text, dim2 text, proyecto text, monto numeric, prorrateado boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_stgo boolean := fin_tiene_en('eerr', 'Santiago');
  v_pv   boolean := fin_tiene_en('eerr', 'Puerto Varas');
begin
  if not (v_stgo or v_pv) then
    raise exception 'Sin acceso al estado de resultados' using errcode = '42501';
  end if;

  return query
  with base as (
    select s.periodo, s.cuenta, s.ceco, s.dim2, s.proyecto, s.haber - s.debe as monto,
           c.tipo = 'administracion' and p_prorratear
             and exists (select 1 from fin_prorrateo r where r.anio = extract(year from s.periodo)::int) as repartir
    from fin_saldos s left join fin_cecos c on c.codigo = s.ceco
    where s.periodo between date_trunc('month', p_desde)::date and date_trunc('month', p_hasta)::date
  ),
  administracion as (
    select b.periodo, b.cuenta, b.dim2, sum(b.monto) as monto
    from base b where b.repartir
    group by b.periodo, b.cuenta, b.dim2
  ),
  filas as (
    select b.periodo, b.cuenta, b.ceco, b.dim2, b.proyecto, b.monto, false as prorrateado
    from base b where not b.repartir
    union all
    select a.periodo, a.cuenta, r.ceco, a.dim2, ''::text, a.monto * r.porcentaje / 100, true
    from administracion a
    join fin_prorrateo r on r.anio = extract(year from a.periodo)::int and r.porcentaje > 0
  )
  select f.periodo, f.cuenta, f.ceco, f.dim2, f.proyecto, round(f.monto, 2), f.prorrateado
  from filas f
  where case fin_sucursal_de(f.ceco) when 'Santiago' then v_stgo when 'Puerto Varas' then v_pv else true end;
end;
$$;

-- ---------------------------------------------------------------- prorrateo

-- p = [ {ceco: '1101', porcentaje: 12.5}, ... ] reemplaza los % del ano. Deben sumar 100 y ser CECO de
-- linea. Lista vacia: borra el ano (queda sin prorrateo).
create or replace function public.fin_guardar_prorrateo(p_anio integer, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_suma numeric;
  v_malo text;
begin
  if not fin_puede_configurar() then
    raise exception 'Sin permiso para configurar el prorrateo' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'array' then
    raise exception 'Formato inválido: se espera una lista de CECO y porcentaje';
  end if;

  select string_agg(coalesce(f ->> 'ceco', '(vacío)'), ', ') into v_malo
  from jsonb_array_elements(p) f
  where not exists (select 1 from fin_cecos c where c.codigo = f ->> 'ceco' and c.tipo = 'linea');
  if v_malo is not null then
    raise exception 'Solo se puede prorratear a CECO de línea de negocio: %', v_malo;
  end if;
  if (select count(*) from jsonb_array_elements(p)) <> (select count(distinct f ->> 'ceco') from jsonb_array_elements(p) f) then
    raise exception 'Hay CECO repetidos';
  end if;

  select sum((f ->> 'porcentaje')::numeric) into v_suma from jsonb_array_elements(p) f;
  if jsonb_array_length(p) > 0 and abs(v_suma - 100) > 0.005 then
    raise exception 'Los porcentajes de % suman % %%; deben sumar 100 %%', p_anio, round(v_suma, 4);
  end if;

  delete from fin_prorrateo where anio = p_anio;
  insert into fin_prorrateo (anio, ceco, porcentaje, actualizado_por)
  select p_anio, f ->> 'ceco', (f ->> 'porcentaje')::numeric, auth.uid()
  from jsonb_array_elements(p) f;
end;
$$;

-- ---------------------------------------------------------------- sincronizacion desde SAP

-- p = { cuentas: [{codigo, codigo_formato, nombre, grupo, nivel, padre, imputable}],
--       cecos:   [{codigo, nombre, activo}],
--       dim2:    [{codigo, nombre}],
--       periodos: ['2026-07', ...],            meses que se reemplazan enteros
--       asientos: [{trans_id, linea_id, fecha, numero, tipo_trans, referencia, glosa, cuenta, ceco,
--                   dim2, proyecto, debe, haber}],
--       completo: true }                        marca de carga completa (solo informativa)
-- Los catalogos que vengan se actualizan (cuentas y dimension 2 se reemplazan; un CECO que ya no venga
-- queda inactivo, porque el prorrateo lo puede usar). Luego borra los asientos de esos meses, carga los
-- nuevos y rehace sus saldos. Todo en una transaccion.
create or replace function public.fin_sap_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_periodos date[];
  v_nuevos   integer;
  v_antes    integer;
  v_fuera    integer;
  v_estado   record;
begin
  if jsonb_typeof(p -> 'periodos') is distinct from 'array' or jsonb_array_length(p -> 'periodos') = 0 then
    raise exception 'fin_sap_sincronizar: sin periodos';
  end if;
  select array_agg(to_date(x, 'YYYY-MM')) into v_periodos from jsonb_array_elements_text(p -> 'periodos') x;

  -- catalogos
  if jsonb_array_length(coalesce(p -> 'cuentas', '[]')) > 0 then
    delete from fin_cuentas c where not exists (
      select 1 from jsonb_array_elements(p -> 'cuentas') f where f ->> 'codigo' = c.codigo);
    insert into fin_cuentas (codigo, codigo_formato, nombre, grupo, nivel, padre, imputable)
    select f ->> 'codigo', nullif(f ->> 'codigo_formato', ''), f ->> 'nombre', (f ->> 'grupo')::smallint,
           (f ->> 'nivel')::smallint, nullif(f ->> 'padre', ''), (f ->> 'imputable')::boolean
    from jsonb_array_elements(p -> 'cuentas') f
    on conflict (codigo) do update set codigo_formato = excluded.codigo_formato, nombre = excluded.nombre,
      grupo = excluded.grupo, nivel = excluded.nivel, padre = excluded.padre, imputable = excluded.imputable;
  end if;

  if jsonb_array_length(coalesce(p -> 'cecos', '[]')) > 0 then
    update fin_cecos c set activo = false where not exists (
      select 1 from jsonb_array_elements(p -> 'cecos') f where f ->> 'codigo' = c.codigo);
    insert into fin_cecos (codigo, nombre, linea, sucursal, tipo, activo)
    select f ->> 'codigo', f ->> 'nombre', fin_linea_de(f ->> 'codigo'), fin_sucursal_de(f ->> 'codigo'),
           case when fin_linea_de(f ->> 'codigo') = 'Administración' then 'administracion'
                when fin_linea_de(f ->> 'codigo') is not null then 'linea' end,
           coalesce((f ->> 'activo')::boolean, true)
    from jsonb_array_elements(p -> 'cecos') f
    on conflict (codigo) do update set nombre = excluded.nombre, linea = excluded.linea,
      sucursal = excluded.sucursal, tipo = excluded.tipo, activo = excluded.activo;
  end if;

  if jsonb_array_length(coalesce(p -> 'dim2', '[]')) > 0 then
    delete from fin_dim2 d where not exists (
      select 1 from jsonb_array_elements(p -> 'dim2') f where f ->> 'codigo' = d.codigo);
    insert into fin_dim2 (codigo, nombre)
    select f ->> 'codigo', f ->> 'nombre' from jsonb_array_elements(p -> 'dim2') f
    on conflict (codigo) do update set nombre = excluded.nombre;
  end if;

  -- asientos
  create temp table _fin_nuevos on commit drop as
  select (f ->> 'trans_id')::integer as trans_id, (f ->> 'linea_id')::integer as linea_id,
         date_trunc('month', (f ->> 'fecha')::date)::date as periodo, (f ->> 'fecha')::date as fecha,
         (f ->> 'numero')::integer as numero, f ->> 'tipo_trans' as tipo_trans,
         nullif(f ->> 'referencia', '') as referencia, nullif(f ->> 'glosa', '') as glosa,
         f ->> 'cuenta' as cuenta, coalesce(f ->> 'ceco', '') as ceco, coalesce(f ->> 'dim2', '') as dim2,
         coalesce(f ->> 'proyecto', '') as proyecto, fin_sucursal_de(coalesce(f ->> 'ceco', '')) as sucursal,
         (f ->> 'debe')::numeric as debe, (f ->> 'haber')::numeric as haber
  from jsonb_array_elements(coalesce(p -> 'asientos', '[]')) f;

  select count(*) filter (where not (periodo = any (v_periodos))), count(*) into v_fuera, v_nuevos from _fin_nuevos;
  if v_fuera > 0 then
    raise exception 'fin_sap_sincronizar: % asientos fuera de los periodos indicados', v_fuera;
  end if;
  select count(*) into v_antes from fin_asientos where periodo = any (v_periodos);
  if v_nuevos = 0 and v_antes > 0 then
    raise exception 'fin_sap_sincronizar: SAP no trajo asientos para meses que tienen % en la base; no se borra nada', v_antes;
  end if;

  delete from fin_asientos where periodo = any (v_periodos);
  delete from fin_saldos where periodo = any (v_periodos);
  insert into fin_asientos (trans_id, linea_id, periodo, fecha, numero, tipo_trans, referencia, glosa, cuenta,
                            ceco, dim2, proyecto, sucursal, debe, haber)
  select trans_id, linea_id, periodo, fecha, numero, tipo_trans, referencia, glosa, cuenta, ceco, dim2, proyecto,
         sucursal, debe, haber
  from _fin_nuevos;
  insert into fin_saldos (periodo, cuenta, ceco, dim2, proyecto, sucursal, debe, haber, lineas)
  select periodo, cuenta, ceco, dim2, proyecto, max(sucursal), sum(debe), sum(haber), count(*)
  from _fin_nuevos group by periodo, cuenta, ceco, dim2, proyecto;

  select count(*) as n, min(periodo) as primero, max(periodo) as ultimo into v_estado from fin_asientos;
  insert into fin_estado (id, sincronizado_en, desde, hasta, completo_en, asientos, primer_periodo, ultimo_periodo)
  values (true, now(), (select min(x) from unnest(v_periodos) x), (select max(x) from unnest(v_periodos) x),
          case when (p ->> 'completo')::boolean then now() end, v_estado.n, v_estado.primero, v_estado.ultimo)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, desde = excluded.desde,
    hasta = excluded.hasta, completo_en = coalesce(excluded.completo_en, fin_estado.completo_en),
    asientos = excluded.asientos, primer_periodo = excluded.primer_periodo, ultimo_periodo = excluded.ultimo_periodo;

  return jsonb_build_object('periodos', cardinality(v_periodos), 'asientos', v_nuevos, 'reemplazados', v_antes,
                            'total', v_estado.n);
end;
$$;

-- ---------------------------------------------------------------- permisos de las funciones

drop function if exists public.fin_ve(text, text);   -- de una version previa de esta migracion

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'fin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function
  public.fin_ancla_id(), public.fin_tiene_en(text, text), public.fin_sucursales(text), public.fin_tiene_acceso(uuid),
  public.fin_puede_configurar(), public.fin_mis_accesos(), public.fin_linea_de(text), public.fin_sucursal_de(text),
  public.fin_eerr(date, date, boolean), public.fin_guardar_prorrateo(integer, jsonb)
  to authenticated;
-- internas: preguntar por otros usuarios, escribir desde SAP
revoke execute on function public.fin_es_admin(uuid), public.fin_usuario_tiene_en(text, uuid, text) from authenticated;
revoke all on function public.fin_sap_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.fin_sap_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

-- Adquisiciones: Evaluacion de proveedores, No Conformidades y ficha de proveedor (sobre las migraciones
-- *_adquisiciones*.sql anteriores, que van antes). Tercera entrega de lo que se trae de TP Control Tower.
--
-- Evaluacion: notas 1 a 5 en 9 criterios ponderados; puntaje = suma(nota / 5 x peso), sobre 100.
--   Calidad 20, Entrega/OTIF 20, Precio/Costo 15, Capacidad 10, Condiciones de pago 10, Respuesta/Servicio 10,
--   Riesgo/continuidad 5, Certificaciones/Cumplimiento 5, Relacion estrategica 5.
--   Clase A 90-100 preferente, B 75-89,9 aprobado, C 60-74,9 aprobado con observaciones, D bajo 60 critico.
--   C y D exigen plan de accion. Una evaluacion mal hecha se anula (quien, cuando, motivo); no se borra.
-- No conformidades: reclamos a proveedores (tipo, impacto, estado, acciones, responsables, costo), con cierre.
-- Ficha: compras de SAP de los ultimos 12 meses, pendientes, atrasos, ultima evaluacion y NC por proveedor.
-- Registra y ve: Abastecimiento (comprador o jefe de compras, de cualquier sucursal; las NC por sucursal).
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- tablas

create table if not exists public.adq_evaluaciones (
  id                bigint generated always as identity primary key,
  proveedor_codigo  text,                -- CardCode de SAP
  proveedor_nombre  text not null check (btrim(proveedor_nombre) <> ''),
  periodo_desde     date not null,
  periodo_hasta     date not null,
  calidad           smallint not null check (calidad between 1 and 5),
  entrega           smallint not null check (entrega between 1 and 5),
  precio            smallint not null check (precio between 1 and 5),
  capacidad         smallint not null check (capacidad between 1 and 5),
  pago              smallint not null check (pago between 1 and 5),
  servicio          smallint not null check (servicio between 1 and 5),
  riesgo            smallint not null check (riesgo between 1 and 5),   -- 5 = bajo riesgo
  certificaciones   smallint not null check (certificaciones between 1 and 5),
  relacion          smallint not null check (relacion between 1 and 5),
  puntaje           numeric(5, 1) not null,
  clase             text not null check (clase in ('A', 'B', 'C', 'D')),
  observaciones     text,
  plan_accion       text,
  proxima_revision  date,
  anulada           boolean not null default false,
  anulada_por       uuid references auth.users(id),
  anulada_at        timestamptz,
  motivo_anulacion  text,
  creado_por        uuid default auth.uid() references auth.users(id),
  created_at        timestamptz not null default now(),
  check (periodo_hasta >= periodo_desde),
  check (clase in ('A', 'B') or btrim(coalesce(plan_accion, '')) <> '')
);
create index if not exists adq_evaluaciones_proveedor_idx on public.adq_evaluaciones (proveedor_codigo, created_at desc);

create table if not exists public.adq_nc (
  id                     bigint generated always as identity primary key,
  sucursal               text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  proveedor_codigo       text,
  proveedor_nombre       text not null check (btrim(proveedor_nombre) <> ''),
  articulo_codigo        text,
  articulo_nombre        text,
  oc_docnum              int,
  fecha_evento           date not null,
  tipo                   text not null check (tipo in ('calidad', 'entrega', 'embalaje', 'documentacion', 'cantidad', 'otro')),
  impacto                text not null check (impacto in ('bajo', 'medio', 'alto', 'critico')),
  estado                 text not null default 'abierta' check (estado in ('abierta', 'en_analisis', 'accion_proveedor', 'cerrada')),
  fecha_compromiso       date,
  reincidencia           boolean not null default false,
  problema               text not null check (btrim(problema) <> ''),
  accion_acordada        text,
  responsable_interno    text,
  responsable_proveedor  text,
  costo                  numeric(14, 0) check (costo is null or costo >= 0),   -- CLP estimado
  cierre                 text,
  cerrado_por            uuid references auth.users(id),
  cerrado_at             timestamptz,
  creado_por             uuid default auth.uid() references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check ((estado = 'cerrada') = (cerrado_at is not null))
);
create index if not exists adq_nc_proveedor_idx on public.adq_nc (proveedor_codigo, fecha_evento desc);

-- ---------------------------------------------------------------- calculo y acciones

create or replace function public.adq_eval_puntaje(c int, e int, p int, ca int, pa int, s int, r int, ce int, re int)
returns numeric language sql immutable as $$
  select round((c * 20 + e * 20 + p * 15 + ca * 10 + pa * 10 + s * 10 + r * 5 + ce * 5 + re * 5)::numeric / 5, 1)
$$;

create or replace function public.adq_eval_clase(p numeric)
returns text language sql immutable as $$
  select case when p >= 90 then 'A' when p >= 75 then 'B' when p >= 60 then 'C' else 'D' end
$$;

-- p = {proveedor_codigo, proveedor_nombre, periodo_desde, periodo_hasta, calidad, entrega, precio, capacidad, pago,
--      servicio, riesgo, certificaciones, relacion, observaciones, plan_accion, proxima_revision}
create or replace function public.adq_guardar_evaluacion(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_puntaje numeric;
  v_clase text;
  v_id bigint;
begin
  if not adq_es_compras() then raise exception 'Solo Abastecimiento evalúa proveedores' using errcode = '42501'; end if;
  v_puntaje := adq_eval_puntaje((p ->> 'calidad')::int, (p ->> 'entrega')::int, (p ->> 'precio')::int, (p ->> 'capacidad')::int,
                                (p ->> 'pago')::int, (p ->> 'servicio')::int, (p ->> 'riesgo')::int,
                                (p ->> 'certificaciones')::int, (p ->> 'relacion')::int);
  if v_puntaje is null then raise exception 'Califica los 9 criterios de 1 a 5' using errcode = '22023'; end if;
  v_clase := adq_eval_clase(v_puntaje);
  if v_clase in ('C', 'D') and btrim(coalesce(p ->> 'plan_accion', '')) = '' then
    raise exception 'Con clase % el plan de acción es obligatorio', v_clase using errcode = 'P0001';
  end if;
  insert into adq_evaluaciones (proveedor_codigo, proveedor_nombre, periodo_desde, periodo_hasta, calidad, entrega, precio,
    capacidad, pago, servicio, riesgo, certificaciones, relacion, puntaje, clase, observaciones, plan_accion, proxima_revision, creado_por)
  values (nullif(btrim(coalesce(p ->> 'proveedor_codigo', '')), ''), btrim(p ->> 'proveedor_nombre'),
    (p ->> 'periodo_desde')::date, (p ->> 'periodo_hasta')::date,
    (p ->> 'calidad')::int, (p ->> 'entrega')::int, (p ->> 'precio')::int, (p ->> 'capacidad')::int, (p ->> 'pago')::int,
    (p ->> 'servicio')::int, (p ->> 'riesgo')::int, (p ->> 'certificaciones')::int, (p ->> 'relacion')::int,
    v_puntaje, v_clase, nullif(btrim(coalesce(p ->> 'observaciones', '')), ''), nullif(btrim(coalesce(p ->> 'plan_accion', '')), ''),
    nullif(p ->> 'proxima_revision', '')::date, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.adq_anular_evaluacion(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not adq_es_compras() then raise exception 'Solo Abastecimiento anula evaluaciones' using errcode = '42501'; end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Indica el motivo de la anulación' using errcode = 'P0001'; end if;
  update adq_evaluaciones set anulada = true, anulada_por = auth.uid(), anulada_at = now(), motivo_anulacion = btrim(p_motivo)
  where id = p_id and not anulada;
  if not found then raise exception 'La evaluación no existe o ya está anulada' using errcode = 'P0002'; end if;
end $$;

-- Crea (sin id) o actualiza (con id, mientras no este cerrada) una NC.
-- p = {id?, sucursal, proveedor_codigo, proveedor_nombre, articulo_codigo, articulo_nombre, oc_docnum, fecha_evento, tipo,
--      impacto, estado, fecha_compromiso, reincidencia, problema, accion_acordada, responsable_interno,
--      responsable_proveedor, costo}
create or replace function public.adq_guardar_nc(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_suc text := p ->> 'sucursal';
  v_estado text := coalesce(nullif(p ->> 'estado', ''), 'abierta');
  v_old adq_nc%rowtype;
begin
  if v_estado = 'cerrada' then raise exception 'Para cerrar la NC usa «Cerrar NC»' using errcode = 'P0001'; end if;
  if v_id is not null then
    select * into v_old from adq_nc where id = v_id for update;
    if not found then raise exception 'NC no encontrada' using errcode = 'P0002'; end if;
    if v_old.estado = 'cerrada' then raise exception 'La NC está cerrada' using errcode = 'P0001'; end if;
    if not adq_compras_de(v_old.sucursal) then raise exception 'Solo Abastecimiento de % edita sus NC', v_old.sucursal using errcode = '42501'; end if;
  end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Abastecimiento de % registra NC', coalesce(v_suc, '?') using errcode = '42501'; end if;

  if v_id is null then
    insert into adq_nc (sucursal, proveedor_codigo, proveedor_nombre, articulo_codigo, articulo_nombre, oc_docnum, fecha_evento, tipo,
      impacto, estado, fecha_compromiso, reincidencia, problema, accion_acordada, responsable_interno, responsable_proveedor, costo, creado_por)
    values (v_suc, nullif(btrim(coalesce(p ->> 'proveedor_codigo', '')), ''), btrim(coalesce(p ->> 'proveedor_nombre', '')),
      nullif(btrim(coalesce(p ->> 'articulo_codigo', '')), ''), nullif(btrim(coalesce(p ->> 'articulo_nombre', '')), ''),
      nullif(p ->> 'oc_docnum', '')::int, (p ->> 'fecha_evento')::date, p ->> 'tipo', p ->> 'impacto', v_estado,
      nullif(p ->> 'fecha_compromiso', '')::date, coalesce((p ->> 'reincidencia')::boolean, false), btrim(coalesce(p ->> 'problema', '')),
      nullif(btrim(coalesce(p ->> 'accion_acordada', '')), ''), nullif(btrim(coalesce(p ->> 'responsable_interno', '')), ''),
      nullif(btrim(coalesce(p ->> 'responsable_proveedor', '')), ''), nullif(p ->> 'costo', '')::numeric, auth.uid())
    returning id into v_id;
  else
    update adq_nc set
      sucursal = v_suc,
      proveedor_codigo = nullif(btrim(coalesce(p ->> 'proveedor_codigo', '')), ''),
      proveedor_nombre = btrim(coalesce(p ->> 'proveedor_nombre', '')),
      articulo_codigo = nullif(btrim(coalesce(p ->> 'articulo_codigo', '')), ''),
      articulo_nombre = nullif(btrim(coalesce(p ->> 'articulo_nombre', '')), ''),
      oc_docnum = nullif(p ->> 'oc_docnum', '')::int,
      fecha_evento = (p ->> 'fecha_evento')::date, tipo = p ->> 'tipo', impacto = p ->> 'impacto', estado = v_estado,
      fecha_compromiso = nullif(p ->> 'fecha_compromiso', '')::date,
      reincidencia = coalesce((p ->> 'reincidencia')::boolean, false),
      problema = btrim(coalesce(p ->> 'problema', '')),
      accion_acordada = nullif(btrim(coalesce(p ->> 'accion_acordada', '')), ''),
      responsable_interno = nullif(btrim(coalesce(p ->> 'responsable_interno', '')), ''),
      responsable_proveedor = nullif(btrim(coalesce(p ->> 'responsable_proveedor', '')), ''),
      costo = nullif(p ->> 'costo', '')::numeric,
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.adq_cerrar_nc(p_id bigint, p_cierre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_suc text;
begin
  select sucursal into v_suc from adq_nc where id = p_id and estado <> 'cerrada';
  if not found then raise exception 'La NC no existe o ya está cerrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Abastecimiento de % cierra sus NC', v_suc using errcode = '42501'; end if;
  if btrim(coalesce(p_cierre, '')) = '' then raise exception 'Describe la solución o el cierre' using errcode = 'P0001'; end if;
  update adq_nc set estado = 'cerrada', cierre = btrim(p_cierre), cerrado_por = auth.uid(), cerrado_at = now(), updated_at = now()
  where id = p_id;
end $$;

-- ---------------------------------------------------------------- vistas

drop view if exists public.adq_proveedores_v;
drop view if exists public.adq_evaluaciones_v;
drop view if exists public.adq_nc_v;

create view public.adq_evaluaciones_v as
select e.*, adq_nombre(e.creado_por) as creado_por_nombre, adq_nombre(e.anulada_por) as anulada_por_nombre
from adq_evaluaciones e
where adq_es_compras();

create view public.adq_nc_v as
select n.*, adq_nombre(n.creado_por) as creado_por_nombre, adq_nombre(n.cerrado_por) as cerrado_por_nombre,
  (n.estado <> 'cerrada' and n.fecha_compromiso < adq_hoy()) as vencida
from adq_nc n
where adq_compras_de(n.sucursal);

-- Una fila por proveedor con OC en SAP (desde el 01-01 del anio anterior) o con evaluaciones / NC
create view public.adq_proveedores_v as
with oc as (
  select o.proveedor_codigo as codigo, max(o.proveedor_nombre) as nombre,
    count(distinct o.doc_entry) filter (where o.fecha >= adq_hoy() - 365) as oc_12m,
    coalesce(sum(o.neto) filter (where o.fecha >= adq_hoy() - 365), 0) as comprado_12m,
    count(distinct o.doc_entry) filter (where o.abierta) as oc_abiertas,
    max(o.fecha) as ultima_oc
  from sap_oc o
  where not o.cancelada and o.proveedor_codigo is not null and adq_ve_oc_compras(o.sucursales)
  group by o.proveedor_codigo
), lin as (
  select o.proveedor_codigo as codigo,
    sum(case when l.cantidad > 0 then l.total * l.pendiente / l.cantidad else 0 end) filter (where l.abierta and l.pendiente > 0) as pendiente_neto,
    count(*) filter (where l.abierta and l.pendiente > 0) as lineas_pendientes,
    count(*) filter (where l.abierta and l.pendiente > 0 and o.fecha_entrega < adq_hoy()) as lineas_atrasadas,
    round(100 * sum(l.cantidad - l.pendiente) filter (where o.fecha >= adq_hoy() - 365)
          / nullif(sum(l.cantidad) filter (where o.fecha >= adq_hoy() - 365), 0))::int as recepcion_pct
  from sap_oc o join sap_oc_lineas l on l.doc_entry = o.doc_entry
  where not o.cancelada and o.proveedor_codigo is not null and adq_ve_oc_compras(o.sucursales)
  group by o.proveedor_codigo
), ev as (
  select distinct on (e.proveedor_codigo) e.proveedor_codigo as codigo, e.puntaje, e.clase, e.created_at, e.proxima_revision
  from adq_evaluaciones e where not e.anulada and e.proveedor_codigo is not null
  order by e.proveedor_codigo, e.created_at desc
), nc as (
  select n.proveedor_codigo as codigo, count(*) filter (where n.estado <> 'cerrada') as nc_abiertas,
    count(*) filter (where n.fecha_evento >= adq_hoy() - 365) as nc_12m
  from adq_nc n where n.proveedor_codigo is not null and adq_compras_de(n.sucursal)
  group by n.proveedor_codigo
), claves as (
  select codigo from oc union select codigo from ev union select codigo from nc
)
select k.codigo, coalesce(sp.nombre, oc.nombre, k.codigo) as nombre, sp.rut, sp.email, sp.telefono, coalesce(sp.activo, true) as activo,
  coalesce(oc.oc_12m, 0)::int as oc_12m, coalesce(oc.comprado_12m, 0) as comprado_12m, coalesce(oc.oc_abiertas, 0)::int as oc_abiertas,
  oc.ultima_oc, coalesce(lin.pendiente_neto, 0) as pendiente_neto, coalesce(lin.lineas_pendientes, 0)::int as lineas_pendientes,
  coalesce(lin.lineas_atrasadas, 0)::int as lineas_atrasadas, lin.recepcion_pct,
  ev.puntaje as ultima_puntaje, ev.clase as ultima_clase, ev.created_at as ultima_evaluacion, ev.proxima_revision,
  (ev.proxima_revision is not null and ev.proxima_revision < adq_hoy()) as revision_vencida,
  coalesce(nc.nc_abiertas, 0)::int as nc_abiertas, coalesce(nc.nc_12m, 0)::int as nc_12m
from claves k
left join sap_proveedores sp on sp.codigo = k.codigo
left join oc on oc.codigo = k.codigo
left join lin on lin.codigo = k.codigo
left join ev on ev.codigo = k.codigo
left join nc on nc.codigo = k.codigo
where adq_es_compras();

-- ---------------------------------------------------------------- RLS y privilegios

alter table public.adq_evaluaciones enable row level security;
alter table public.adq_nc           enable row level security;

drop policy if exists adq_evaluaciones_select on public.adq_evaluaciones;
create policy adq_evaluaciones_select on public.adq_evaluaciones for select to authenticated using (adq_es_compras());
drop policy if exists adq_nc_select on public.adq_nc;
create policy adq_nc_select on public.adq_nc for select to authenticated using (adq_compras_de(sucursal));

revoke all on public.adq_evaluaciones, public.adq_nc, public.adq_evaluaciones_v, public.adq_nc_v, public.adq_proveedores_v
  from anon, authenticated;
grant select on public.adq_evaluaciones, public.adq_nc, public.adq_evaluaciones_v, public.adq_nc_v, public.adq_proveedores_v
  to authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'adq\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function
  public.adq_eval_puntaje(int, int, int, int, int, int, int, int, int), public.adq_eval_clase(numeric),
  public.adq_guardar_evaluacion(jsonb), public.adq_anular_evaluacion(bigint, text),
  public.adq_guardar_nc(jsonb), public.adq_cerrar_nc(bigint, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;

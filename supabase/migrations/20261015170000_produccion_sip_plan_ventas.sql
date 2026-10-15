-- Portal Produccion de Paneles SIP: plan semanal (presupuestado vs real) y ordenes de venta de SAP.
--
-- Plan semanal (pnl_plan_semanal): por sucursal, semana (lunes), proyecto SAP y panel, cuantos
-- paneles se esperan pegar (fabricar) y cuantos cortar. Se compara en la web con lo registrado en
-- esa semana (pnl_lineas_v y pnl_lineas_corte_v, de lunes a domingo) en paneles, m2 y pesos.
-- Se guarda una semana completa con pnl_guardar_plan (reemplaza lo que esa sucursal tenia en esa semana).
--
-- Ordenes de venta (pnl_sap_ov_lineas): las lineas de las OV de SAP (ORDR/RDR1, no canceladas) de los
-- proyectos de pnl_sap_proyectos, con tipo de vivienda, estructura, cantidad, suministrada,
-- pendiente y precio. Las trae la misma tarea de SAP (stack\tareas\sincronizar-sap-sip.ps1) con
-- pnl_sap_sincronizar_ov. Montos netos en pesos (LineTotal con el descuento de cabecera).
-- es_panel marca las lineas de panel SIP (kit panel SIP, losa panel SIP, PNL...; no los paneles
-- metalicos): su monto dividido por los paneles de la estructura del proyecto es el valor de venta
-- por panel (pnl_sap_ventas_v) con que se valorizan el plan y lo real.
--
-- Accesos nuevos (permisos.modulo_key):
--   pnl:plan  ver (plan vs real y montos de venta) | editar (cargar el plan)
--
-- Va DESPUES de 20261014150000_produccion_sip_sucursal.sql (siempre la ultima de la cadena pnl).
-- Re-ejecutable. Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- plan semanal

create table if not exists public.pnl_plan_semanal (
  id uuid primary key default gen_random_uuid(),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  semana date not null check (extract(isodow from semana) = 1),   -- lunes de la semana
  proyecto_codigo text not null references public.pnl_sap_proyectos(codigo) on delete restrict,
  panel_id uuid not null references public.pnl_paneles(id) on delete restrict,
  pegado int not null default 0 check (pegado >= 0),               -- paneles a fabricar
  corte int not null default 0 check (corte >= 0),                 -- paneles a cortar
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (sucursal, semana, proyecto_codigo, panel_id),
  check (pegado + corte > 0)
);
create index if not exists pnl_plan_semanal_semana_idx on public.pnl_plan_semanal (semana, sucursal);

alter table public.pnl_plan_semanal enable row level security;

drop policy if exists pnl_plan_semanal_select on public.pnl_plan_semanal;
create policy pnl_plan_semanal_select on public.pnl_plan_semanal for select to authenticated
  using (pnl_puede_modulo('plan', 'ver') and has_sucursal(sucursal));
drop policy if exists pnl_plan_semanal_insert on public.pnl_plan_semanal;
create policy pnl_plan_semanal_insert on public.pnl_plan_semanal for insert to authenticated
  with check (pnl_puede_modulo('plan', 'editar') and has_sucursal(sucursal));
drop policy if exists pnl_plan_semanal_update on public.pnl_plan_semanal;
create policy pnl_plan_semanal_update on public.pnl_plan_semanal for update to authenticated
  using (pnl_puede_modulo('plan', 'editar') and has_sucursal(sucursal))
  with check (pnl_puede_modulo('plan', 'editar') and has_sucursal(sucursal));
drop policy if exists pnl_plan_semanal_delete on public.pnl_plan_semanal;
create policy pnl_plan_semanal_delete on public.pnl_plan_semanal for delete to authenticated
  using (pnl_puede_modulo('plan', 'editar') and has_sucursal(sucursal));

-- Guarda el plan de una semana en una sucursal: lo que no viene se borra. Corre con los permisos
-- del usuario (la RLS decide). p_filas: [{proyecto_codigo, panel_id, pegado, corte}]
create or replace function public.pnl_guardar_plan(p_sucursal text, p_semana date, p_filas jsonb)
returns int language plpgsql set search_path = public as $$
declare n int;
begin
  perform pnl_validar_sucursal(p_sucursal);
  if not pnl_puede_modulo('plan', 'editar') then
    raise exception 'No tienes permiso para cargar el plan' using errcode = '42501';
  end if;
  if p_semana is null or extract(isodow from p_semana) <> 1 then
    raise exception 'La semana debe partir un lunes' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Faltan las filas del plan' using errcode = 'P0001';
  end if;

  -- filas: jsonb_to_recordset (sin tabla temporal: corre con los permisos del usuario)
  if exists (select 1 from jsonb_to_recordset(p_filas) x(pegado int, corte int)
             where coalesce(x.pegado, 0) < 0 or coalesce(x.corte, 0) < 0) then
    raise exception 'Las cantidades del plan no pueden ser negativas' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_filas) x(proyecto_codigo text, panel_id uuid)
             group by x.proyecto_codigo, x.panel_id having count(*) > 1) then
    raise exception 'Hay un panel repetido en el mismo proyecto: júntelo en una sola fila' using errcode = 'P0001';
  end if;

  delete from pnl_plan_semanal s
  where s.sucursal = p_sucursal and s.semana = p_semana
    and not exists (select 1 from jsonb_to_recordset(p_filas) x(proyecto_codigo text, panel_id uuid, pegado int, corte int)
                    where x.proyecto_codigo = s.proyecto_codigo and x.panel_id = s.panel_id
                      and coalesce(x.pegado, 0) + coalesce(x.corte, 0) > 0);

  insert into pnl_plan_semanal (sucursal, semana, proyecto_codigo, panel_id, pegado, corte)
  select p_sucursal, p_semana, x.proyecto_codigo, x.panel_id, coalesce(x.pegado, 0), coalesce(x.corte, 0)
  from jsonb_to_recordset(p_filas) x(proyecto_codigo text, panel_id uuid, pegado int, corte int)
  where coalesce(x.pegado, 0) + coalesce(x.corte, 0) > 0
  on conflict (sucursal, semana, proyecto_codigo, panel_id) do update
    set pegado = excluded.pegado, corte = excluded.corte, updated_by = auth.uid(), updated_at = now()
  where (pnl_plan_semanal.pegado, pnl_plan_semanal.corte) is distinct from (excluded.pegado, excluded.corte);

  select count(*) into n from pnl_plan_semanal where sucursal = p_sucursal and semana = p_semana;
  return n;
end $$;
revoke execute on function public.pnl_guardar_plan(text, date, jsonb) from public, anon;
grant  execute on function public.pnl_guardar_plan(text, date, jsonb) to authenticated;

create or replace view public.pnl_plan_semanal_v with (security_invoker = true) as
select
  s.id, s.sucursal, s.semana, s.proyecto_codigo, sp.nombre as proyecto_nombre,
  s.panel_id, pa.codigo as panel_codigo, pa.descripcion as panel_descripcion,
  round(coalesce(pa.ancho_mm::numeric * pa.largo_mm / 1e6, 0), 4) as m2_panel,
  s.pegado, s.corte, s.updated_at, pnl_nombre_usuario(s.updated_by) as actualizado_por
from public.pnl_plan_semanal s
join public.pnl_sap_proyectos sp on sp.codigo = s.proyecto_codigo
join public.pnl_paneles pa on pa.id = s.panel_id;

-- ---------------------------------------------------------------- ordenes de venta de SAP

create table if not exists public.pnl_sap_ov_lineas (
  doc_entry int not null,                    -- ORDR.DocEntry
  linea int not null,                        -- RDR1.LineNum
  doc_num int not null,                      -- N de la OV
  proyecto_codigo text not null references public.pnl_sap_proyectos(codigo) on delete cascade,
  fecha date,
  estado text,                               -- O abierta | C cerrada
  cliente text,
  articulo text,
  descripcion text not null default '',
  tipo_vivienda text not null default '',    -- RDR1.U_TipoVivienda
  tipo_estructura text not null default '',  -- RDR1.U_TipoEstructura
  unidad text,
  cantidad numeric(18,4) not null default 0,
  entregada numeric(18,4) not null default 0,
  pendiente numeric(18,4) not null default 0,
  precio numeric(18,4),                      -- neto por unidad, en pesos
  total numeric(18,2) not null default 0,    -- neto de la linea, en pesos
  es_panel boolean not null default false,
  sincronizado_at timestamptz not null default now(),
  primary key (doc_entry, linea)
);
create index if not exists pnl_sap_ov_lineas_proyecto_idx on public.pnl_sap_ov_lineas (proyecto_codigo);

alter table public.pnl_sap_ov_lineas enable row level security;
drop policy if exists pnl_sap_ov_lineas_select on public.pnl_sap_ov_lineas;
create policy pnl_sap_ov_lineas_select on public.pnl_sap_ov_lineas for select to authenticated
  using (pnl_puede_modulo('plan', 'ver'));

-- Linea de panel SIP: kits de panel SIP, losa panel SIP y paneles PNL; no los paneles metalicos
create or replace function public.pnl_es_linea_panel(p_descripcion text, p_estructura text)
returns boolean language sql immutable set search_path = public as $$
  select upper(coalesce(p_descripcion, '') || ' ' || coalesce(p_estructura, '')) ~ '(PANEL ?SIP|PANELES SIP|PNL)'
     and upper(coalesce(p_descripcion, '') || ' ' || coalesce(p_estructura, '')) !~ 'MET\.'
$$;

-- p: {proyectos: [codigo...], lineas: [{doc_entry, linea, doc_num, proyecto_codigo, fecha, estado, cliente,
--     articulo, descripcion, tipo_vivienda, tipo_estructura, unidad, cantidad, entregada, pendiente, precio, total}]}
-- Reemplaza las lineas de los proyectos que vienen (los que ya no tienen OV quedan sin lineas).
create or replace function public.pnl_sap_sincronizar_ov(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_borradas int; n_lineas int;
begin
  if coalesce(jsonb_array_length(p->'proyectos'), 0) = 0 then
    raise exception 'La sincronización de OV no trae proyectos: no se cambia nada' using errcode = 'P0001';
  end if;

  delete from pnl_sap_ov_lineas
  where proyecto_codigo in (select jsonb_array_elements_text(p->'proyectos'));
  get diagnostics n_borradas = row_count;

  insert into pnl_sap_ov_lineas (doc_entry, linea, doc_num, proyecto_codigo, fecha, estado, cliente, articulo, descripcion,
                                 tipo_vivienda, tipo_estructura, unidad, cantidad, entregada, pendiente, precio, total,
                                 es_panel, sincronizado_at)
  select (e->>'doc_entry')::int, (e->>'linea')::int, (e->>'doc_num')::int, e->>'proyecto_codigo', (e->>'fecha')::date,
         e->>'estado', nullif(e->>'cliente', ''), e->>'articulo', coalesce(e->>'descripcion', ''),
         coalesce(e->>'tipo_vivienda', ''), coalesce(e->>'tipo_estructura', ''), nullif(e->>'unidad', ''),
         coalesce((e->>'cantidad')::numeric, 0), coalesce((e->>'entregada')::numeric, 0), coalesce((e->>'pendiente')::numeric, 0),
         (e->>'precio')::numeric, coalesce((e->>'total')::numeric, 0),
         pnl_es_linea_panel(e->>'descripcion', e->>'tipo_estructura'), now()
  from jsonb_array_elements(p->'lineas') e
  where e->>'proyecto_codigo' in (select codigo from pnl_sap_proyectos)
  on conflict (doc_entry, linea) do update set doc_num = excluded.doc_num, proyecto_codigo = excluded.proyecto_codigo,
    fecha = excluded.fecha, estado = excluded.estado, cliente = excluded.cliente, articulo = excluded.articulo,
    descripcion = excluded.descripcion, tipo_vivienda = excluded.tipo_vivienda, tipo_estructura = excluded.tipo_estructura,
    unidad = excluded.unidad, cantidad = excluded.cantidad, entregada = excluded.entregada, pendiente = excluded.pendiente,
    precio = excluded.precio, total = excluded.total, es_panel = excluded.es_panel, sincronizado_at = excluded.sincronizado_at;
  get diagnostics n_lineas = row_count;

  return jsonb_build_object('lineas_ov', n_lineas, 'lineas_ov_reemplazadas', n_borradas);
end $$;
revoke execute on function public.pnl_sap_sincronizar_ov(jsonb) from public, anon, authenticated;
grant  execute on function public.pnl_sap_sincronizar_ov(jsonb) to service_role;

-- Venta por proyecto: total de las OV, lo de panel SIP, lo pendiente de entregar y el valor de venta
-- por panel (monto de panel SIP / paneles de la estructura vigente). Sin acceso a 'plan' sale vacia.
create or replace view public.pnl_sap_ventas_v with (security_invoker = true) as
with ov as (
  select proyecto_codigo,
         count(distinct doc_entry) as ordenes,
         string_agg(distinct doc_num::text, ', ') as ov_numeros,
         sum(total) as monto,
         sum(total) filter (where es_panel) as monto_panel,
         sum(case when cantidad > 0 then total * pendiente / cantidad else 0 end) as monto_pendiente,
         max(sincronizado_at) as sincronizado_at
  from public.pnl_sap_ov_lineas group by proyecto_codigo
), est as (
  select proyecto_codigo, sum(paneles_por_vivienda * viviendas) as paneles
  from public.pnl_sap_items where vigente group by proyecto_codigo
)
select ov.proyecto_codigo, ov.ordenes, ov.ov_numeros,
       round(ov.monto, 0) as monto, round(coalesce(ov.monto_panel, 0), 0) as monto_panel,
       round(ov.monto_pendiente, 0) as monto_pendiente,
       round(coalesce(est.paneles, 0), 2) as paneles_estructura,
       case when coalesce(est.paneles, 0) > 0 and coalesce(ov.monto_panel, 0) > 0
            then round(ov.monto_panel / est.paneles, 0) end as valor_panel,
       ov.sincronizado_at
from ov left join est on est.proyecto_codigo = ov.proyecto_codigo;

notify pgrst, 'reload schema';

commit;

-- Portal Produccion de Paneles SIP: separacion por sucursal (Santiago / Puerto Varas).
--
-- Cada planta fabrica, corta y guarda su propio stock:
--   pnl_partes.sucursal        donde se fabrico
--   pnl_partes_corte.sucursal  donde se corto
--   pnl_stock_inicial          ahora por (panel, sucursal)
-- Stock de un panel en una sucursal = su stock inicial + fabricados buenos alli - cortados y
-- rechazados al cortar alli. El bloqueo de stock negativo se revisa sucursal por sucursal: no se
-- puede cortar en Puerto Varas un panel fabricado en Santiago.
--
-- Quien ve que: igual que proyectos, oportunidades y ventas (has_sucursal()). Un usuario con
-- profiles.sucursal asignada solo ve y registra en su sucursal; sin sucursal, o con
-- ve_todas_sucursales() (admin, gerencia), ve y registra en las dos.
-- El catalogo (paneles, materiales, recetas, proyectos) y los datos de SAP siguen siendo comunes.
--
-- Las vistas pnl_partes_v, pnl_lineas_v, pnl_consumos_v, pnl_partes_corte_v y pnl_lineas_corte_v
-- traen la columna sucursal al final. pnl_guardar_parte y pnl_guardar_parte_corte reciben
-- p_sucursal; pnl_stock_paneles recibe p_sucursal (null = todas las que ve el usuario).
--
-- Va DESPUES de 20261006120000, 20261013120000 y 20261014120000 (esas recrean funciones y vistas
-- que esta redefine; los scripts del servidor la reaplican al final). Re-ejecutable.
-- Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- columnas

alter table public.pnl_partes        add column if not exists sucursal text;
alter table public.pnl_partes_corte  add column if not exists sucursal text;
alter table public.pnl_stock_inicial add column if not exists sucursal text;

-- No se adivina la sucursal de lo ya registrado: si hay filas sin ella, se asignan a mano antes.
do $$
declare n int;
begin
  select (select count(*) from pnl_partes where sucursal is null)
       + (select count(*) from pnl_partes_corte where sucursal is null)
       + (select count(*) from pnl_stock_inicial where sucursal is null) into n;
  if n > 0 then
    raise exception 'Hay % registro(s) de produccion, cortes o stock inicial sin sucursal. Asignela con un UPDATE antes de aplicar esta migracion.', n;
  end if;
end $$;

alter table public.pnl_partes        alter column sucursal set not null;
alter table public.pnl_partes_corte  alter column sucursal set not null;
alter table public.pnl_stock_inicial alter column sucursal set not null;

do $$ begin
  alter table public.pnl_partes add constraint pnl_partes_sucursal_check check (sucursal in ('Santiago', 'Puerto Varas'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.pnl_partes_corte add constraint pnl_partes_corte_sucursal_check check (sucursal in ('Santiago', 'Puerto Varas'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.pnl_stock_inicial add constraint pnl_stock_inicial_sucursal_check check (sucursal in ('Santiago', 'Puerto Varas'));
exception when duplicate_object then null; end $$;

create index if not exists pnl_partes_sucursal_fecha_idx on public.pnl_partes (sucursal, fecha);
create index if not exists pnl_partes_corte_sucursal_fecha_idx on public.pnl_partes_corte (sucursal, fecha);

-- stock inicial: una fila por panel y sucursal
do $$
begin
  if (select array_length(conkey, 1) from pg_constraint
      where conrelid = 'public.pnl_stock_inicial'::regclass and contype = 'p') = 1 then
    alter table public.pnl_stock_inicial drop constraint pnl_stock_inicial_pkey;
    alter table public.pnl_stock_inicial add constraint pnl_stock_inicial_pkey primary key (panel_id, sucursal);
  end if;
end $$;

-- ---------------------------------------------------------------- stock por sucursal y su bloqueo

-- Disponible de un panel en una sucursal, sin RLS. Solo la usa el bloqueo (no se expone por la API)
drop function if exists public.pnl_stock_disponible(uuid);
create or replace function public.pnl_stock_disponible(p_panel_id uuid, p_sucursal text)
returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select cantidad from pnl_stock_inicial where panel_id = p_panel_id and sucursal = p_sucursal), 0)
        + coalesce((select sum(l.buenos) from pnl_lineas l join pnl_partes p on p.id = l.parte_id
                    where l.panel_id = p_panel_id and p.sucursal = p_sucursal), 0)
        - coalesce((select sum(l.cortados + l.rechazados) from pnl_lineas_corte l join pnl_partes_corte p on p.id = l.parte_id
                    where l.panel_id = p_panel_id and p.sucursal = p_sucursal), 0))::int
$$;
revoke execute on function public.pnl_stock_disponible(uuid, text) from public, anon, authenticated;

-- Revisa un panel en las dos sucursales (el cambio puede venir de cualquiera)
create or replace function public.pnl_revisar_stock_panel(p_panel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_suc text;
  v_disp int;
  v_codigo text;
begin
  foreach v_suc in array array['Santiago', 'Puerto Varas'] loop
    v_disp := pnl_stock_disponible(p_panel_id, v_suc);
    if v_disp < 0 then
      select codigo into v_codigo from pnl_paneles where id = p_panel_id;
      raise exception 'Stock insuficiente del panel % en %: faltan % panel(es). Registra primero su fabricación en esa sucursal o ajusta su stock inicial.',
        v_codigo, v_suc, -v_disp using errcode = 'P0001';
    end if;
  end loop;
end $$;
revoke execute on function public.pnl_revisar_stock_panel(uuid) from public, anon, authenticated;

create or replace function public.pnl_verificar_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_panel uuid;
begin
  foreach v_panel in array array_remove(array[
      case when tg_op <> 'INSERT' then old.panel_id end,
      case when tg_op <> 'DELETE' then new.panel_id end], null) loop
    perform pnl_revisar_stock_panel(v_panel);
  end loop;
  return null;
end $$;
revoke execute on function public.pnl_verificar_stock() from public, anon, authenticated;

-- Cambiar de sucursal un registro ya hecho mueve su stock: se revisan sus paneles. El candado se
-- toma aqui (al final de la transaccion) por cada panel, en orden, para no cruzarse con un corte.
create or replace function public.pnl_verificar_stock_cambio_sucursal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_panel uuid;
begin
  if new.sucursal is not distinct from old.sucursal then
    return null;
  end if;
  for v_panel in
    select distinct panel_id from pnl_lineas where tg_table_name = 'pnl_partes' and parte_id = new.id
    union
    select distinct panel_id from pnl_lineas_corte where tg_table_name = 'pnl_partes_corte' and parte_id = new.id
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('pnl_stock:' || v_panel::text, 0));
    perform pnl_revisar_stock_panel(v_panel);
  end loop;
  return null;
end $$;
revoke execute on function public.pnl_verificar_stock_cambio_sucursal() from public, anon, authenticated;

drop trigger if exists pnl_partes_sucursal_stock on public.pnl_partes;
create constraint trigger pnl_partes_sucursal_stock after update of sucursal on public.pnl_partes
  deferrable initially deferred for each row execute function public.pnl_verificar_stock_cambio_sucursal();
drop trigger if exists pnl_partes_corte_sucursal_stock on public.pnl_partes_corte;
create constraint trigger pnl_partes_corte_sucursal_stock after update of sucursal on public.pnl_partes_corte
  deferrable initially deferred for each row execute function public.pnl_verificar_stock_cambio_sucursal();

-- el stock inicial ahora tambien se crea por sucursal: insertar no baja stock, no necesita revision

-- Stock por panel en una sucursal (null = sumado en las que ve el usuario). Security definer a
-- proposito: el stock lo ve quien tenga Stock o Cortes aunque no vea la produccion.
drop function if exists public.pnl_stock_paneles();
create or replace function public.pnl_stock_paneles(p_sucursal text default null)
returns table (
  panel_id uuid, panel_codigo text, panel_descripcion text, activo boolean,
  inicial int, inicial_actualizado timestamptz, fabricados int, cortados int, rechazados_corte int, disponible int
) language sql stable security definer set search_path = public as $$
  with suc as (
    select s from unnest(array['Santiago', 'Puerto Varas']) s
    where (p_sucursal is null or s = p_sucursal) and has_sucursal(s)
  ),
  si as (
    select si.panel_id, sum(si.cantidad) as cantidad, max(si.updated_at) as updated_at
    from pnl_stock_inicial si where si.sucursal in (select s from suc) group by si.panel_id
  ),
  f as (
    select l.panel_id, sum(l.buenos) as buenos
    from pnl_lineas l join pnl_partes p on p.id = l.parte_id
    where p.sucursal in (select s from suc) group by l.panel_id
  ),
  c as (
    select l.panel_id, sum(l.cortados) as cortados, sum(l.rechazados) as rechazados
    from pnl_lineas_corte l join pnl_partes_corte p on p.id = l.parte_id
    where p.sucursal in (select s from suc) group by l.panel_id
  )
  select pa.id, pa.codigo, pa.descripcion, pa.activo,
    coalesce(si.cantidad, 0)::int, si.updated_at,
    coalesce(f.buenos, 0)::int, coalesce(c.cortados, 0)::int, coalesce(c.rechazados, 0)::int,
    (coalesce(si.cantidad, 0) + coalesce(f.buenos, 0) - coalesce(c.cortados, 0) - coalesce(c.rechazados, 0))::int
  from pnl_paneles pa
  left join si on si.panel_id = pa.id
  left join f on f.panel_id = pa.id
  left join c on c.panel_id = pa.id
  where (pnl_puede_modulo('stock', 'ver') or pnl_puede_modulo('cortes', 'ver'))
    and exists (select 1 from suc)
    and (si.panel_id is not null or f.panel_id is not null or c.panel_id is not null or pa.activo)
  order by pa.codigo
$$;
revoke execute on function public.pnl_stock_paneles(text) from public, anon;
grant  execute on function public.pnl_stock_paneles(text) to authenticated;

-- ---------------------------------------------------------------- vistas (sucursal al final)

create or replace view public.pnl_partes_v with (security_invoker = true) as
select
  p.id, p.numero, p.fecha, p.hora_desde, p.hora_hasta, p.observacion,
  p.created_by, pnl_nombre_usuario(p.created_by) as registrado_por, p.created_at,
  p.updated_by, pnl_nombre_usuario(p.updated_by) as corregido_por, p.updated_at,
  count(l.id)::int as lineas,
  coalesce(sum(l.buenos), 0)::int as buenos,
  coalesce(sum(l.rechazados), 0)::int as rechazados,
  round(coalesce(sum(l.buenos * pa.ancho_mm::numeric * pa.largo_mm / 1e6), 0), 2) as m2_buenos,
  p.sucursal
from public.pnl_partes p
left join public.pnl_lineas l on l.parte_id = p.id
left join public.pnl_paneles pa on pa.id = l.panel_id
group by p.id;

create or replace view public.pnl_lineas_v with (security_invoker = true) as
select
  l.id, l.parte_id, p.numero as parte_numero, p.fecha, p.hora_desde, p.hora_hasta,
  l.panel_id, pa.codigo as panel_codigo, pa.descripcion as panel_descripcion, pa.espesor_mm,
  round(coalesce(pa.ancho_mm::numeric * pa.largo_mm / 1e6, 0), 4) as m2_panel,
  l.buenos, l.rechazados, l.buenos + l.rechazados as total,
  l.proyecto_id, l.pnl_proyecto_id, coalesce(pr.nombre, pp.nombre, sp.nombre) as proyecto_nombre, l.referencia,
  p.created_by, p.created_at,
  l.sap_proyecto_codigo,
  p.sucursal
from public.pnl_lineas l
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
left join public.proyectos pr on pr.id = l.proyecto_id
left join public.pnl_proyectos pp on pp.id = l.pnl_proyecto_id
left join public.pnl_sap_proyectos sp on sp.codigo = l.sap_proyecto_codigo;

create or replace view public.pnl_consumos_v with (security_invoker = true) as
select
  c.linea_id, l.parte_id, p.fecha, p.hora_desde, p.hora_hasta,
  l.panel_id, pa.codigo as panel_codigo, l.proyecto_id, l.pnl_proyecto_id, l.referencia,
  c.material_id, m.codigo as material_codigo, m.descripcion as material_descripcion, m.unidad,
  c.cantidad_unitaria,
  c.cantidad_unitaria * l.buenos as cantidad_buenos,
  c.cantidad_unitaria * l.rechazados as cantidad_merma,
  c.cantidad_unitaria * (l.buenos + l.rechazados) as cantidad_total,
  l.sap_proyecto_codigo,
  p.sucursal
from public.pnl_consumos c
join public.pnl_lineas l on l.id = c.linea_id
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
join public.pnl_materiales m on m.id = c.material_id;

create or replace view public.pnl_partes_corte_v with (security_invoker = true) as
select
  p.id, p.numero, p.fecha, p.hora_desde, p.hora_hasta, p.observacion,
  p.created_by, pnl_nombre_usuario(p.created_by) as registrado_por, p.created_at,
  p.updated_by, pnl_nombre_usuario(p.updated_by) as corregido_por, p.updated_at,
  count(l.id)::int as lineas,
  coalesce(sum(l.cortados), 0)::int as cortados,
  coalesce(sum(l.rechazados), 0)::int as rechazados,
  round(coalesce(sum(l.cortados * pa.ancho_mm::numeric * pa.largo_mm / 1e6), 0), 2) as m2_cortados,
  p.sucursal
from public.pnl_partes_corte p
left join public.pnl_lineas_corte l on l.parte_id = p.id
left join public.pnl_paneles pa on pa.id = l.panel_id
group by p.id;

create or replace view public.pnl_lineas_corte_v with (security_invoker = true) as
select
  l.id, l.parte_id, p.numero as parte_numero, p.fecha, p.hora_desde, p.hora_hasta,
  l.item_id, i.proyecto_codigo, sp.nombre as proyecto_nombre, i.modelo_vivienda, i.tipo_panel,
  l.panel_id, pa.codigo as panel_codigo, pa.descripcion as panel_descripcion,
  round(coalesce(pa.ancho_mm::numeric * pa.largo_mm / 1e6, 0), 4) as m2_panel,
  l.corte_codigo, tc.descripcion as corte_descripcion, tc.precio_m2,
  l.cortados, l.rechazados, l.cortados + l.rechazados as total, l.referencia,
  p.created_by, p.created_at,
  p.sucursal
from public.pnl_lineas_corte l
join public.pnl_partes_corte p on p.id = l.parte_id
join public.pnl_sap_items i on i.id = l.item_id
join public.pnl_sap_proyectos sp on sp.codigo = i.proyecto_codigo
join public.pnl_paneles pa on pa.id = l.panel_id
join public.pnl_tipos_corte tc on tc.codigo = l.corte_codigo;

-- ---------------------------------------------------------------- RLS por sucursal

-- fabricacion
drop policy if exists pnl_partes_select on public.pnl_partes;
create policy pnl_partes_select on public.pnl_partes for select to authenticated
  using (pnl_ve_produccion() and has_sucursal(sucursal));
drop policy if exists pnl_partes_insert on public.pnl_partes;
create policy pnl_partes_insert on public.pnl_partes for insert to authenticated
  with check (pnl_puede_modulo('produccion', 'crear') and created_by = auth.uid() and has_sucursal(sucursal));
drop policy if exists pnl_partes_update on public.pnl_partes;
create policy pnl_partes_update on public.pnl_partes for update to authenticated
  using (has_sucursal(sucursal)
         and (pnl_puede_modulo('produccion', 'editar') or (pnl_puede_modulo('produccion', 'crear') and created_by = auth.uid())))
  with check (has_sucursal(sucursal));
drop policy if exists pnl_partes_delete on public.pnl_partes;
create policy pnl_partes_delete on public.pnl_partes for delete to authenticated
  using (pnl_puede_modulo('produccion', 'eliminar') and has_sucursal(sucursal));

-- las lineas siguen a su parte (tambien en la sucursal)
create or replace function public.pnl_puede_editar_parte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pnl_partes p
    where p.id = p_parte_id and has_sucursal(p.sucursal)
      and (pnl_puede_modulo('produccion', 'editar')
           or (pnl_puede_modulo('produccion', 'crear') and p.created_by = auth.uid()))
  )
$$;

create or replace function public.pnl_ve_parte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_ve_produccion() and exists (select 1 from pnl_partes p where p.id = p_parte_id and has_sucursal(p.sucursal))
$$;
revoke execute on function public.pnl_ve_parte(uuid) from public, anon;
grant  execute on function public.pnl_ve_parte(uuid) to authenticated;

drop policy if exists pnl_lineas_select on public.pnl_lineas;
create policy pnl_lineas_select on public.pnl_lineas for select to authenticated using (pnl_ve_parte(parte_id));

drop policy if exists pnl_consumos_select on public.pnl_consumos;
create policy pnl_consumos_select on public.pnl_consumos for select to authenticated
  using (pnl_ve_parte((select l.parte_id from public.pnl_lineas l where l.id = linea_id)));

-- cortes
drop policy if exists pnl_partes_corte_select on public.pnl_partes_corte;
create policy pnl_partes_corte_select on public.pnl_partes_corte for select to authenticated
  using (pnl_puede_modulo('cortes', 'ver') and has_sucursal(sucursal));
drop policy if exists pnl_partes_corte_insert on public.pnl_partes_corte;
create policy pnl_partes_corte_insert on public.pnl_partes_corte for insert to authenticated
  with check (pnl_puede_modulo('cortes', 'crear') and created_by = auth.uid() and has_sucursal(sucursal));
drop policy if exists pnl_partes_corte_update on public.pnl_partes_corte;
create policy pnl_partes_corte_update on public.pnl_partes_corte for update to authenticated
  using (has_sucursal(sucursal)
         and (pnl_puede_modulo('cortes', 'editar') or (pnl_puede_modulo('cortes', 'crear') and created_by = auth.uid())))
  with check (has_sucursal(sucursal));
drop policy if exists pnl_partes_corte_delete on public.pnl_partes_corte;
create policy pnl_partes_corte_delete on public.pnl_partes_corte for delete to authenticated
  using (pnl_puede_modulo('cortes', 'eliminar') and has_sucursal(sucursal));

create or replace function public.pnl_puede_editar_parte_corte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pnl_partes_corte p
    where p.id = p_parte_id and has_sucursal(p.sucursal)
      and (pnl_puede_modulo('cortes', 'editar')
           or (pnl_puede_modulo('cortes', 'crear') and p.created_by = auth.uid()))
  )
$$;

create or replace function public.pnl_ve_parte_corte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_puede_modulo('cortes', 'ver')
     and exists (select 1 from pnl_partes_corte p where p.id = p_parte_id and has_sucursal(p.sucursal))
$$;
revoke execute on function public.pnl_ve_parte_corte(uuid) from public, anon;
grant  execute on function public.pnl_ve_parte_corte(uuid) to authenticated;

drop policy if exists pnl_lineas_corte_select on public.pnl_lineas_corte;
create policy pnl_lineas_corte_select on public.pnl_lineas_corte for select to authenticated using (pnl_ve_parte_corte(parte_id));

-- stock inicial
drop policy if exists pnl_stock_inicial_select on public.pnl_stock_inicial;
create policy pnl_stock_inicial_select on public.pnl_stock_inicial for select to authenticated
  using ((pnl_puede_modulo('stock', 'ver') or pnl_puede_modulo('cortes', 'ver')) and has_sucursal(sucursal));
drop policy if exists pnl_stock_inicial_insert on public.pnl_stock_inicial;
create policy pnl_stock_inicial_insert on public.pnl_stock_inicial for insert to authenticated
  with check (pnl_puede_modulo('stock', 'editar') and has_sucursal(sucursal));
drop policy if exists pnl_stock_inicial_update on public.pnl_stock_inicial;
create policy pnl_stock_inicial_update on public.pnl_stock_inicial for update to authenticated
  using (pnl_puede_modulo('stock', 'editar') and has_sucursal(sucursal))
  with check (pnl_puede_modulo('stock', 'editar') and has_sucursal(sucursal));
drop policy if exists pnl_stock_inicial_delete on public.pnl_stock_inicial;
create policy pnl_stock_inicial_delete on public.pnl_stock_inicial for delete to authenticated
  using (pnl_puede_modulo('stock', 'editar') and has_sucursal(sucursal));

-- ---------------------------------------------------------------- guardar un parte (con sucursal)

create or replace function public.pnl_validar_sucursal(p_sucursal text)
returns void language plpgsql stable set search_path = public as $$
begin
  if p_sucursal is null or p_sucursal not in ('Santiago', 'Puerto Varas') then
    raise exception 'Elige la sucursal (Santiago o Puerto Varas)' using errcode = 'P0001';
  end if;
  if not has_sucursal(p_sucursal) then
    raise exception 'No puedes registrar en la sucursal %', p_sucursal using errcode = '42501';
  end if;
end $$;
revoke execute on function public.pnl_validar_sucursal(text) from public, anon;
grant  execute on function public.pnl_validar_sucursal(text) to authenticated;

-- Igual que en 20261014120000_produccion_sip_proyectos_sap.sql, con la sucursal del parte.
-- p_lineas: [{id?, panel_id, buenos, rechazados, proyecto_id | pnl_proyecto_id | sap_proyecto_codigo, referencia}]
drop function if exists public.pnl_guardar_parte(uuid, date, time, time, text, jsonb);
create or replace function public.pnl_guardar_parte(
  p_parte_id uuid, p_fecha date, p_hora_desde time, p_hora_hasta time, p_observacion text, p_lineas jsonb, p_sucursal text
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El parte necesita al menos un panel' using errcode = 'P0001';
  end if;
  if p_fecha > pnl_hoy() then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;
  perform pnl_validar_sucursal(p_sucursal);

  if p_parte_id is null then
    insert into pnl_partes (fecha, hora_desde, hora_hasta, observacion, sucursal)
    values (p_fecha, p_hora_desde, p_hora_hasta, nullif(btrim(p_observacion), ''), p_sucursal)
    returning id into v_id;
  else
    update pnl_partes set fecha = p_fecha, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
      observacion = nullif(btrim(p_observacion), ''), sucursal = p_sucursal
    where id = p_parte_id
    returning id into v_id;
    if v_id is null then
      raise exception 'No puede corregir este parte' using errcode = '42501';
    end if;
    delete from pnl_lineas l where l.parte_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_lineas) e where nullif(e->>'id', '')::uuid = l.id);
  end if;

  update pnl_lineas l set
    panel_id = (e->>'panel_id')::uuid,
    buenos = coalesce((e->>'buenos')::int, 0),
    rechazados = coalesce((e->>'rechazados')::int, 0),
    proyecto_id = nullif(e->>'proyecto_id', '')::uuid,
    pnl_proyecto_id = nullif(e->>'pnl_proyecto_id', '')::uuid,
    sap_proyecto_codigo = nullif(e->>'sap_proyecto_codigo', ''),
    referencia = nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where p_parte_id is not null and l.parte_id = v_id and l.id = nullif(e->>'id', '')::uuid;

  insert into pnl_lineas (parte_id, panel_id, buenos, rechazados, proyecto_id, pnl_proyecto_id, sap_proyecto_codigo, referencia)
  select v_id, (e->>'panel_id')::uuid, coalesce((e->>'buenos')::int, 0), coalesce((e->>'rechazados')::int, 0),
         nullif(e->>'proyecto_id', '')::uuid, nullif(e->>'pnl_proyecto_id', '')::uuid, nullif(e->>'sap_proyecto_codigo', ''),
         nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where nullif(e->>'id', '') is null
     or not exists (select 1 from pnl_lineas l where l.id = nullif(e->>'id', '')::uuid and l.parte_id = v_id);

  -- si se corrigio hacia abajo o cambio de sucursal, el stock se revisa aqui y no al confirmar
  set constraints pnl_lineas_stock, pnl_partes_sucursal_stock immediate;
  return v_id;
end $$;

revoke execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb, text) from public, anon;
grant  execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb, text) to authenticated;

-- Igual que en 20261013120000_produccion_sip_cortes.sql, con la sucursal del parte.
-- p_lineas: [{id?, item_id, cortados, rechazados, referencia}]
drop function if exists public.pnl_guardar_parte_corte(uuid, date, time, time, text, jsonb);
create or replace function public.pnl_guardar_parte_corte(
  p_parte_id uuid, p_fecha date, p_hora_desde time, p_hora_hasta time, p_observacion text, p_lineas jsonb, p_sucursal text
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El registro necesita al menos un corte' using errcode = 'P0001';
  end if;
  if p_fecha > pnl_hoy() then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;
  perform pnl_validar_sucursal(p_sucursal);

  if p_parte_id is null then
    insert into pnl_partes_corte (fecha, hora_desde, hora_hasta, observacion, sucursal)
    values (p_fecha, p_hora_desde, p_hora_hasta, nullif(btrim(p_observacion), ''), p_sucursal)
    returning id into v_id;
  else
    update pnl_partes_corte set fecha = p_fecha, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
      observacion = nullif(btrim(p_observacion), ''), sucursal = p_sucursal
    where id = p_parte_id
    returning id into v_id;
    if v_id is null then
      raise exception 'No puedes corregir este registro' using errcode = '42501';
    end if;
    delete from pnl_lineas_corte l where l.parte_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_lineas) e where nullif(e->>'id', '')::uuid = l.id);
  end if;

  update pnl_lineas_corte l set
    item_id = (e->>'item_id')::uuid,
    cortados = coalesce((e->>'cortados')::int, 0),
    rechazados = coalesce((e->>'rechazados')::int, 0),
    referencia = nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where p_parte_id is not null and l.parte_id = v_id and l.id = nullif(e->>'id', '')::uuid;

  insert into pnl_lineas_corte (parte_id, item_id, cortados, rechazados, referencia)
  select v_id, (e->>'item_id')::uuid, coalesce((e->>'cortados')::int, 0), coalesce((e->>'rechazados')::int, 0),
         nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where nullif(e->>'id', '') is null
     or not exists (select 1 from pnl_lineas_corte l where l.id = nullif(e->>'id', '')::uuid and l.parte_id = v_id);

  -- el stock se revisa aqui y no al confirmar, con todas las lineas ya puestas
  set constraints pnl_lineas_corte_stock, pnl_partes_corte_sucursal_stock immediate;
  return v_id;
end $$;

revoke execute on function public.pnl_guardar_parte_corte(uuid, date, time, time, text, jsonb, text) from public, anon;
grant  execute on function public.pnl_guardar_parte_corte(uuid, date, time, time, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

commit;

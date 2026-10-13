-- Portal Produccion de Paneles SIP: cortes de paneles y stock de paneles.
--
-- Fabricar un panel SIP (pegado) y cortarlo son dos etapas distintas:
--   fabricacion (pnl_partes/pnl_lineas, ya existia)  -> el panel entra al stock
--   corte       (pnl_partes_corte/pnl_lineas_corte)   -> el panel sale del stock
--
-- Que se corta lo dice SAP, en la "Estructura de proyecto" (@EST_PROY_CAB / @EST_PROY_DET): por
-- proyecto, modelo de vivienda y tipo de panel, que panel 6602xxx lleva cada vivienda y que maquila
-- de corte le corresponde (6501149 OSB, 6501150 SP, 6501157 proyecto individual, en m2 de panel).
-- Lo trae la tarea del servidor (stack\tareas\sincronizar-sap-sip.ps1) con pnl_sap_sincronizar():
--   pnl_tipos_corte    las maquilas de corte con su precio por m2 (lista de precios 1 de SAP)
--   pnl_sap_proyectos  proyectos con Cubicacion liberada o planificada en SAP (activo = viene en
--                      la ultima sincronizacion; los que dejan de venir quedan inactivos, no se borran)
--   pnl_sap_items      una fila por panel de la estructura: modelo de vivienda, N de viviendas,
--                      tipo de panel, panel, paneles por vivienda y tipo de corte
-- Los paneles de la estructura que el portal no tenia se crean (sin receta).
--
-- Stock de paneles = stock inicial (pnl_stock_inicial, se carga en la web) + fabricados buenos
--                    - cortados - rechazados en corte.
-- La base NO deja que quede negativo: ni al cortar, ni al corregir o borrar una fabricacion, ni al
-- bajar el stock inicial (pnl_verificar_stock, al final de la transaccion).
--
-- Accesos nuevos (permisos.modulo_key):
--   pnl:cortes  ver | crear (registrar y corregir los propios) | editar (cualquiera) | eliminar | exportar
--   pnl:stock   ver | editar (stock inicial)
--
-- Re-ejecutable. Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- datos de SAP

create table if not exists public.pnl_tipos_corte (
  codigo text primary key,                   -- articulo SAP de la maquila (6501149...)
  descripcion text not null,
  precio_m2 numeric(14,2),                   -- lista de precios 1 de SAP
  sincronizado_at timestamptz not null default now()
);

create table if not exists public.pnl_sap_proyectos (
  codigo text primary key,                   -- OPRJ.PrjCode (960002598)
  nombre text not null,
  cliente text,
  of_numero int,                             -- N de la orden de Cubicacion abierta mas reciente
  of_estado text,                            -- P planificada | R liberada
  creado date,                               -- fecha de la estructura de proyecto
  activo boolean not null default true,
  sincronizado_at timestamptz not null default now()
);

create table if not exists public.pnl_sap_items (
  id uuid primary key default gen_random_uuid(),
  proyecto_codigo text not null references public.pnl_sap_proyectos(codigo) on delete cascade,
  sap_linea int not null,                    -- LineId de la linea del panel en @EST_PROY_DET
  modelo_vivienda text not null default '',  -- U_TIPOVIVIENDA
  viviendas numeric(14,4) not null default 0,-- U_CANT_T_VIV
  estructura text not null default '',       -- U_ESTRUCTURA (PANEL SIP)
  tipo_panel text not null default '',       -- U_TIPO (PANEL OSB/SMP)
  panel_id uuid not null references public.pnl_paneles(id) on delete restrict,
  paneles_por_vivienda numeric(14,4) not null,
  corte_codigo text not null references public.pnl_tipos_corte(codigo) on delete restrict,
  corte_m2_por_vivienda numeric(14,4),
  vigente boolean not null default true,     -- false: ya no esta en la estructura de SAP
  sincronizado_at timestamptz not null default now(),
  unique (proyecto_codigo, sap_linea)
);
create index if not exists pnl_sap_items_panel_idx on public.pnl_sap_items (panel_id);

-- ---------------------------------------------------------------- stock inicial

create table if not exists public.pnl_stock_inicial (
  panel_id uuid primary key references public.pnl_paneles(id) on delete cascade,
  cantidad int not null check (cantidad >= 0),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.pnl_stock_inicial_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists pnl_stock_inicial_updated on public.pnl_stock_inicial;
create trigger pnl_stock_inicial_updated before insert or update on public.pnl_stock_inicial
  for each row execute function public.pnl_stock_inicial_updated();

-- ---------------------------------------------------------------- cortes

create table if not exists public.pnl_partes_corte (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,
  fecha date not null default public.pnl_hoy(),
  hora_desde time,
  hora_hasta time,
  observacion text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check ((hora_desde is null) = (hora_hasta is null)),
  check (hora_hasta is null or hora_hasta > hora_desde)
);
create index if not exists pnl_partes_corte_fecha_idx on public.pnl_partes_corte (fecha);

create table if not exists public.pnl_lineas_corte (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references public.pnl_partes_corte(id) on delete cascade,
  item_id uuid not null references public.pnl_sap_items(id) on delete restrict,
  -- copiados del item al registrar (si SAP cambia despues, lo cortado conserva lo que fue)
  panel_id uuid not null references public.pnl_paneles(id) on delete restrict,
  corte_codigo text not null references public.pnl_tipos_corte(codigo) on delete restrict,
  cortados int not null default 0 check (cortados >= 0),
  rechazados int not null default 0 check (rechazados >= 0),   -- paneles perdidos al cortar
  referencia text,                                             -- OT / pedido, texto libre
  created_at timestamptz not null default now(),
  check (cortados + rechazados > 0)
);
create index if not exists pnl_lineas_corte_parte_idx on public.pnl_lineas_corte (parte_id);
create index if not exists pnl_lineas_corte_item_idx on public.pnl_lineas_corte (item_id);
create index if not exists pnl_lineas_corte_panel_idx on public.pnl_lineas_corte (panel_id);

drop trigger if exists pnl_partes_corte_updated on public.pnl_partes_corte;
create trigger pnl_partes_corte_updated before update on public.pnl_partes_corte
  for each row execute function public.pnl_parte_updated();

-- Panel y tipo de corte salen del item de SAP (no se eligen a mano)
create or replace function public.pnl_linea_corte_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.item_id = old.item_id then
    new.panel_id := old.panel_id;
    new.corte_codigo := old.corte_codigo;
    return new;
  end if;
  select i.panel_id, i.corte_codigo into new.panel_id, new.corte_codigo from pnl_sap_items i where i.id = new.item_id;
  if new.panel_id is null then
    raise exception 'El ítem de proyecto no existe' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists pnl_lineas_corte_item on public.pnl_lineas_corte;
create trigger pnl_lineas_corte_item before insert or update on public.pnl_lineas_corte
  for each row execute function public.pnl_linea_corte_item();
revoke execute on function public.pnl_linea_corte_item() from public, anon, authenticated;

-- ---------------------------------------------------------------- stock y su bloqueo

-- Disponible de un panel, sin RLS (lo usan el bloqueo y la vista)
create or replace function public.pnl_stock_disponible(p_panel_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select cantidad from pnl_stock_inicial where panel_id = p_panel_id), 0)
        + coalesce((select sum(buenos) from pnl_lineas where panel_id = p_panel_id), 0)
        - coalesce((select sum(cortados + rechazados) from pnl_lineas_corte where panel_id = p_panel_id), 0))::int
$$;
revoke execute on function public.pnl_stock_disponible(uuid) from public, anon;
grant  execute on function public.pnl_stock_disponible(uuid) to authenticated;

-- Antes de tocar el stock de un panel se toma su candado hasta el fin de la transaccion: dos
-- cortes simultaneos del mismo panel no pueden pasar los dos con el mismo disponible.
create or replace function public.pnl_stock_candado()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform pg_advisory_xact_lock(hashtextextended('pnl_stock:' || old.panel_id::text, 0));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform pg_advisory_xact_lock(hashtextextended('pnl_stock:' || new.panel_id::text, 0));
    return new;
  end if;
  return old;
end $$;

-- Al final de la transaccion (asi un parte que reemplaza todas sus lineas se mide completo)
create or replace function public.pnl_verificar_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_panel uuid;
  v_disp int;
  v_codigo text;
begin
  foreach v_panel in array array_remove(array[
      case when tg_op <> 'INSERT' then old.panel_id end,
      case when tg_op <> 'DELETE' then new.panel_id end], null) loop
    v_disp := pnl_stock_disponible(v_panel);
    if v_disp < 0 then
      select codigo into v_codigo from pnl_paneles where id = v_panel;
      raise exception 'Stock insuficiente del panel %: faltan % panel(es). Registra primero su fabricación o ajusta el stock inicial.',
        v_codigo, -v_disp using errcode = 'P0001';
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.pnl_stock_candado(), public.pnl_verificar_stock() from public, anon, authenticated;

-- cortes: bajan el stock al insertar o al subir la cantidad / cambiar de panel
drop trigger if exists pnl_lineas_corte_candado on public.pnl_lineas_corte;
create trigger pnl_lineas_corte_candado before insert or update on public.pnl_lineas_corte
  for each row execute function public.pnl_stock_candado();
drop trigger if exists pnl_lineas_corte_stock on public.pnl_lineas_corte;
create constraint trigger pnl_lineas_corte_stock after insert or update on public.pnl_lineas_corte
  deferrable initially deferred for each row execute function public.pnl_verificar_stock();

-- fabricacion: baja el stock al corregir hacia abajo o borrar (tambien en cascada desde el parte)
drop trigger if exists pnl_lineas_candado on public.pnl_lineas;
create trigger pnl_lineas_candado before update or delete on public.pnl_lineas
  for each row execute function public.pnl_stock_candado();
drop trigger if exists pnl_lineas_stock on public.pnl_lineas;
create constraint trigger pnl_lineas_stock after update or delete on public.pnl_lineas
  deferrable initially deferred for each row execute function public.pnl_verificar_stock();

-- stock inicial: al bajarlo o borrarlo
drop trigger if exists pnl_stock_inicial_candado on public.pnl_stock_inicial;
create trigger pnl_stock_inicial_candado before update or delete on public.pnl_stock_inicial
  for each row execute function public.pnl_stock_candado();
drop trigger if exists pnl_stock_inicial_stock on public.pnl_stock_inicial;
create constraint trigger pnl_stock_inicial_stock after update or delete on public.pnl_stock_inicial
  deferrable initially deferred for each row execute function public.pnl_verificar_stock();


-- ---------------------------------------------------------------- vistas y lecturas

-- Nombre de quien registro o corrigio: ahora tambien para quien ve los cortes
create or replace function public.pnl_nombre_usuario(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email)
  from profiles p where p.id = p_user_id and (pnl_ve_produccion() or pnl_puede_modulo('cortes', 'ver'))
$$;

-- Stock por panel (activos, o con stock inicial, fabricacion o corte). Funcion security definer a
-- proposito: el stock lo ve quien tenga Stock o Cortes aunque no vea la produccion.
create or replace function public.pnl_stock_paneles()
returns table (
  panel_id uuid, panel_codigo text, panel_descripcion text, activo boolean,
  inicial int, inicial_actualizado timestamptz, fabricados int, cortados int, rechazados_corte int, disponible int
) language sql stable security definer set search_path = public as $$
  select pa.id, pa.codigo, pa.descripcion, pa.activo,
    coalesce(si.cantidad, 0), si.updated_at,
    coalesce(f.buenos, 0)::int, coalesce(c.cortados, 0)::int, coalesce(c.rechazados, 0)::int,
    (coalesce(si.cantidad, 0) + coalesce(f.buenos, 0) - coalesce(c.cortados, 0) - coalesce(c.rechazados, 0))::int
  from pnl_paneles pa
  left join pnl_stock_inicial si on si.panel_id = pa.id
  left join (select l.panel_id, sum(l.buenos) as buenos from pnl_lineas l group by l.panel_id) f on f.panel_id = pa.id
  left join (select l.panel_id, sum(l.cortados) as cortados, sum(l.rechazados) as rechazados
             from pnl_lineas_corte l group by l.panel_id) c on c.panel_id = pa.id
  where (pnl_puede_modulo('stock', 'ver') or pnl_puede_modulo('cortes', 'ver'))
    and (si.panel_id is not null or f.panel_id is not null or c.panel_id is not null or pa.activo)
  order by pa.codigo
$$;
revoke execute on function public.pnl_stock_paneles() from public, anon;
grant  execute on function public.pnl_stock_paneles() to authenticated;

-- se recrean (cambian columnas entre versiones de esta migracion)
drop view if exists public.pnl_partes_corte_v, public.pnl_lineas_corte_v, public.pnl_sap_items_v;

create or replace view public.pnl_partes_corte_v with (security_invoker = true) as
select
  p.id, p.numero, p.fecha, p.hora_desde, p.hora_hasta, p.observacion,
  p.created_by, pnl_nombre_usuario(p.created_by) as registrado_por, p.created_at,
  p.updated_by, pnl_nombre_usuario(p.updated_by) as corregido_por, p.updated_at,
  count(l.id)::int as lineas,
  coalesce(sum(l.cortados), 0)::int as cortados,
  coalesce(sum(l.rechazados), 0)::int as rechazados,
  round(coalesce(sum(l.cortados * pa.ancho_mm::numeric * pa.largo_mm / 1e6), 0), 2) as m2_cortados
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
  p.created_by, p.created_at
from public.pnl_lineas_corte l
join public.pnl_partes_corte p on p.id = l.parte_id
join public.pnl_sap_items i on i.id = l.item_id
join public.pnl_sap_proyectos sp on sp.codigo = i.proyecto_codigo
join public.pnl_paneles pa on pa.id = l.panel_id
join public.pnl_tipos_corte tc on tc.codigo = l.corte_codigo;

-- Lo planificado en SAP contra lo cortado
create or replace view public.pnl_sap_items_v with (security_invoker = true) as
select
  i.id, i.proyecto_codigo, sp.nombre as proyecto_nombre, sp.cliente, sp.of_numero, sp.activo as proyecto_activo,
  i.sap_linea, i.modelo_vivienda, i.viviendas, i.estructura, i.tipo_panel,
  i.panel_id, pa.codigo as panel_codigo, pa.descripcion as panel_descripcion,
  round(coalesce(pa.ancho_mm::numeric * pa.largo_mm / 1e6, 0), 4) as m2_panel,
  i.paneles_por_vivienda,
  round(i.paneles_por_vivienda * i.viviendas, 2) as paneles_plan,
  i.corte_codigo, tc.descripcion as corte_descripcion, tc.precio_m2,
  round(i.corte_m2_por_vivienda * i.viviendas, 2) as corte_m2_plan,
  coalesce(c.cortados, 0)::int as cortados,
  coalesce(c.rechazados, 0)::int as rechazados,
  i.vigente
from public.pnl_sap_items i
join public.pnl_sap_proyectos sp on sp.codigo = i.proyecto_codigo
join public.pnl_paneles pa on pa.id = i.panel_id
join public.pnl_tipos_corte tc on tc.codigo = i.corte_codigo
left join (select item_id, sum(cortados) as cortados, sum(rechazados) as rechazados
           from public.pnl_lineas_corte group by item_id) c on c.item_id = i.id;

-- ---------------------------------------------------------------- RLS

alter table public.pnl_tipos_corte    enable row level security;
alter table public.pnl_sap_proyectos  enable row level security;
alter table public.pnl_sap_items      enable row level security;
alter table public.pnl_stock_inicial  enable row level security;
alter table public.pnl_partes_corte   enable row level security;
alter table public.pnl_lineas_corte   enable row level security;

-- datos de SAP: los lee cualquiera del portal; solo los escribe la sincronizacion
do $$
declare t text;
begin
  foreach t in array array['pnl_tipos_corte','pnl_sap_proyectos','pnl_sap_items'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (pnl_tiene_acceso())', t);
  end loop;
end $$;

drop policy if exists pnl_stock_inicial_select on public.pnl_stock_inicial;
create policy pnl_stock_inicial_select on public.pnl_stock_inicial for select to authenticated
  using (pnl_puede_modulo('stock', 'ver') or pnl_puede_modulo('cortes', 'ver'));
drop policy if exists pnl_stock_inicial_insert on public.pnl_stock_inicial;
create policy pnl_stock_inicial_insert on public.pnl_stock_inicial for insert to authenticated
  with check (pnl_puede_modulo('stock', 'editar'));
drop policy if exists pnl_stock_inicial_update on public.pnl_stock_inicial;
create policy pnl_stock_inicial_update on public.pnl_stock_inicial for update to authenticated
  using (pnl_puede_modulo('stock', 'editar')) with check (pnl_puede_modulo('stock', 'editar'));
drop policy if exists pnl_stock_inicial_delete on public.pnl_stock_inicial;
create policy pnl_stock_inicial_delete on public.pnl_stock_inicial for delete to authenticated
  using (pnl_puede_modulo('stock', 'editar'));

-- partes de corte: 'crear' registra y corrige los propios; 'editar' corrige cualquiera
drop policy if exists pnl_partes_corte_select on public.pnl_partes_corte;
create policy pnl_partes_corte_select on public.pnl_partes_corte for select to authenticated using (pnl_puede_modulo('cortes', 'ver'));
drop policy if exists pnl_partes_corte_insert on public.pnl_partes_corte;
create policy pnl_partes_corte_insert on public.pnl_partes_corte for insert to authenticated
  with check (pnl_puede_modulo('cortes', 'crear') and created_by = auth.uid());
drop policy if exists pnl_partes_corte_update on public.pnl_partes_corte;
create policy pnl_partes_corte_update on public.pnl_partes_corte for update to authenticated
  using (pnl_puede_modulo('cortes', 'editar') or (pnl_puede_modulo('cortes', 'crear') and created_by = auth.uid()))
  with check (true);
drop policy if exists pnl_partes_corte_delete on public.pnl_partes_corte;
create policy pnl_partes_corte_delete on public.pnl_partes_corte for delete to authenticated
  using (pnl_puede_modulo('cortes', 'eliminar'));

create or replace function public.pnl_puede_editar_parte_corte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_puede_modulo('cortes', 'editar')
      or (pnl_puede_modulo('cortes', 'crear')
          and exists (select 1 from pnl_partes_corte where id = p_parte_id and created_by = auth.uid()))
$$;
revoke execute on function public.pnl_puede_editar_parte_corte(uuid) from public, anon;
grant  execute on function public.pnl_puede_editar_parte_corte(uuid) to authenticated;

drop policy if exists pnl_lineas_corte_select on public.pnl_lineas_corte;
create policy pnl_lineas_corte_select on public.pnl_lineas_corte for select to authenticated using (pnl_puede_modulo('cortes', 'ver'));
drop policy if exists pnl_lineas_corte_insert on public.pnl_lineas_corte;
create policy pnl_lineas_corte_insert on public.pnl_lineas_corte for insert to authenticated with check (pnl_puede_editar_parte_corte(parte_id));
drop policy if exists pnl_lineas_corte_update on public.pnl_lineas_corte;
create policy pnl_lineas_corte_update on public.pnl_lineas_corte for update to authenticated
  using (pnl_puede_editar_parte_corte(parte_id)) with check (pnl_puede_editar_parte_corte(parte_id));
drop policy if exists pnl_lineas_corte_delete on public.pnl_lineas_corte;
create policy pnl_lineas_corte_delete on public.pnl_lineas_corte for delete to authenticated using (pnl_puede_editar_parte_corte(parte_id));

grant select on public.pnl_tipos_corte, public.pnl_sap_proyectos, public.pnl_sap_items to authenticated;
grant select, insert, update, delete on public.pnl_stock_inicial, public.pnl_partes_corte, public.pnl_lineas_corte to authenticated;
grant select on public.pnl_partes_corte_v, public.pnl_lineas_corte_v, public.pnl_sap_items_v to authenticated;
revoke all on public.pnl_tipos_corte, public.pnl_sap_proyectos, public.pnl_sap_items, public.pnl_stock_inicial,
  public.pnl_partes_corte, public.pnl_lineas_corte, public.pnl_partes_corte_v, public.pnl_lineas_corte_v,
  public.pnl_sap_items_v from anon;

-- ---------------------------------------------------------------- guardar un parte de corte

-- Crea o reemplaza un parte de corte con todas sus lineas en una transaccion. Si alguna deja un
-- panel sin stock, no se guarda nada. p_lineas: [{id?, item_id, cortados, rechazados, referencia}].
-- Security invoker: la RLS decide si puede crear o corregir.
create or replace function public.pnl_guardar_parte_corte(
  p_parte_id uuid, p_fecha date, p_hora_desde time, p_hora_hasta time, p_observacion text, p_lineas jsonb
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El registro necesita al menos un corte' using errcode = 'P0001';
  end if;
  if p_fecha > pnl_hoy() then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;

  if p_parte_id is null then
    insert into pnl_partes_corte (fecha, hora_desde, hora_hasta, observacion)
    values (p_fecha, p_hora_desde, p_hora_hasta, nullif(btrim(p_observacion), ''))
    returning id into v_id;
  else
    update pnl_partes_corte set fecha = p_fecha, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
      observacion = nullif(btrim(p_observacion), '')
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
  set constraints pnl_lineas_corte_stock immediate;
  return v_id;
end $$;

revoke execute on function public.pnl_guardar_parte_corte(uuid, date, time, time, text, jsonb) from public, anon;
grant  execute on function public.pnl_guardar_parte_corte(uuid, date, time, time, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- sincronizacion desde SAP

-- La llama solo la tarea del servidor (service_role o postgres). p:
--   {tipos_corte: [{codigo, descripcion, precio_m2}],
--    paneles:     [{codigo, descripcion}],
--    proyectos:   [{codigo, nombre, cliente, of_numero, of_estado, creado}],
--    items:       [{proyecto_codigo, sap_linea, modelo_vivienda, viviendas, estructura, tipo_panel,
--                   panel_codigo, paneles_por_vivienda, corte_codigo, corte_m2_por_vivienda}]}
-- Los proyectos que no vienen quedan inactivos. Los items que dejan de venir se borran si no tienen
-- cortes registrados; si tienen, quedan con vigente = false.
create or replace function public.pnl_sap_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_paneles_nuevos int; n_proyectos int; n_inactivos int; n_items int; n_borrados int; n_no_vigentes int;
begin
  if coalesce(jsonb_array_length(p->'proyectos'), 0) = 0 then
    raise exception 'La sincronización no trae proyectos: no se cambia nada' using errcode = 'P0001';
  end if;

  insert into pnl_tipos_corte (codigo, descripcion, precio_m2, sincronizado_at)
  select e->>'codigo', e->>'descripcion', (e->>'precio_m2')::numeric, now()
  from jsonb_array_elements(p->'tipos_corte') e
  on conflict (codigo) do update set descripcion = excluded.descripcion, precio_m2 = excluded.precio_m2,
    sincronizado_at = excluded.sincronizado_at;

  -- paneles que el portal no tenia (sin receta: no se pueden fabricar hasta cargarla)
  insert into pnl_paneles (codigo, descripcion)
  select e->>'codigo', e->>'descripcion' from jsonb_array_elements(p->'paneles') e
  on conflict (codigo) do nothing;
  get diagnostics n_paneles_nuevos = row_count;

  insert into pnl_sap_proyectos (codigo, nombre, cliente, of_numero, of_estado, creado, activo, sincronizado_at)
  select e->>'codigo', e->>'nombre', nullif(e->>'cliente', ''), (e->>'of_numero')::int, e->>'of_estado',
         (e->>'creado')::date, true, now()
  from jsonb_array_elements(p->'proyectos') e
  on conflict (codigo) do update set nombre = excluded.nombre, cliente = excluded.cliente, of_numero = excluded.of_numero,
    of_estado = excluded.of_estado, creado = excluded.creado, activo = true, sincronizado_at = excluded.sincronizado_at;
  get diagnostics n_proyectos = row_count;

  update pnl_sap_proyectos set activo = false
  where activo and codigo not in (select e->>'codigo' from jsonb_array_elements(p->'proyectos') e);
  get diagnostics n_inactivos = row_count;

  drop table if exists _items;
  create temp table _items on commit drop as
  select e->>'proyecto_codigo' as proyecto_codigo, (e->>'sap_linea')::int as sap_linea,
         coalesce(e->>'modelo_vivienda', '') as modelo_vivienda, coalesce((e->>'viviendas')::numeric, 0) as viviendas,
         coalesce(e->>'estructura', '') as estructura, coalesce(e->>'tipo_panel', '') as tipo_panel,
         pa.id as panel_id, e->>'panel_codigo' as panel_codigo,
         (e->>'paneles_por_vivienda')::numeric as paneles_por_vivienda, e->>'corte_codigo' as corte_codigo,
         (e->>'corte_m2_por_vivienda')::numeric as corte_m2_por_vivienda
  from jsonb_array_elements(p->'items') e
  left join pnl_paneles pa on pa.codigo = e->>'panel_codigo';

  if exists (select 1 from _items where panel_id is null) then
    raise exception 'Hay ítems con un panel que no existe: %',
      (select string_agg(distinct panel_codigo, ', ') from _items where panel_id is null) using errcode = 'P0001';
  end if;

  insert into pnl_sap_items (proyecto_codigo, sap_linea, modelo_vivienda, viviendas, estructura, tipo_panel, panel_id,
                             paneles_por_vivienda, corte_codigo, corte_m2_por_vivienda, vigente, sincronizado_at)
  select proyecto_codigo, sap_linea, modelo_vivienda, viviendas, estructura, tipo_panel, panel_id,
         paneles_por_vivienda, corte_codigo, corte_m2_por_vivienda, true, now()
  from _items
  on conflict (proyecto_codigo, sap_linea) do update set modelo_vivienda = excluded.modelo_vivienda,
    viviendas = excluded.viviendas, estructura = excluded.estructura, tipo_panel = excluded.tipo_panel,
    panel_id = excluded.panel_id, paneles_por_vivienda = excluded.paneles_por_vivienda,
    corte_codigo = excluded.corte_codigo, corte_m2_por_vivienda = excluded.corte_m2_por_vivienda,
    vigente = true, sincronizado_at = excluded.sincronizado_at;
  get diagnostics n_items = row_count;

  -- items de los proyectos sincronizados que ya no estan en SAP
  delete from pnl_sap_items i
  where i.proyecto_codigo in (select e->>'codigo' from jsonb_array_elements(p->'proyectos') e)
    and not exists (select 1 from _items x where x.proyecto_codigo = i.proyecto_codigo and x.sap_linea = i.sap_linea)
    and not exists (select 1 from pnl_lineas_corte l where l.item_id = i.id);
  get diagnostics n_borrados = row_count;
  update pnl_sap_items i set vigente = false
  where i.vigente and i.proyecto_codigo in (select e->>'codigo' from jsonb_array_elements(p->'proyectos') e)
    and not exists (select 1 from _items x where x.proyecto_codigo = i.proyecto_codigo and x.sap_linea = i.sap_linea);
  get diagnostics n_no_vigentes = row_count;

  return jsonb_build_object('proyectos', n_proyectos, 'proyectos_inactivados', n_inactivos, 'items', n_items,
    'items_borrados', n_borrados, 'items_no_vigentes', n_no_vigentes, 'paneles_nuevos', n_paneles_nuevos);
end $$;

revoke execute on function public.pnl_sap_sincronizar(jsonb) from public, anon, authenticated;
grant  execute on function public.pnl_sap_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

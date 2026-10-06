-- Portal de Produccion de Paneles SIP (/produccion): web propia como el CRM y Prevencion.
--
-- Que guarda:
--   pnl_materiales  insumos con su codigo SAP (OSB, adhesivo, EPS, maquila...)
--   pnl_paneles     cada tipo de panel (codigo SAP 6602xxx) con sus medidas
--   pnl_recetas     cantidad base de cada material por 1 panel (lo que trae PNL_SIP.xlsx)
--   pnl_partes      un ingreso de produccion: un dia, o un tramo de horas de ese dia
--   pnl_proyectos   listado propio de proyectos/clientes del portal, editable en la web (ademas de
--                   las obras del hub, como La Chacra, que se pueden elegir igual)
--   pnl_lineas      paneles de un parte: tipo, buenos, rechazados, proyecto y OT/pedido
--   pnl_consumos    la receta COPIADA al registrar la linea: si despues cambia la receta, lo ya
--                   producido conserva lo que consumio. Es tambien la base del futuro descuento
--                   de stock (hoy solo se informa).
-- Los rechazados consumen material igual que los buenos (la merma se informa aparte).
--
-- Accesos: permisos.proyecto_id es NOT NULL, asi que se cuelgan de un pseudo-proyecto propio
-- (slug 'produccion-sip', tipo 'sistema', invisible en las listas de obras), igual que Prevencion.
-- Un permiso por modulo: permisos.modulo_key = 'pnl:<modulo>':
--   pnl:produccion  ver | crear (registrar y corregir los propios) | editar (cualquiera) | eliminar | exportar
--   pnl:consumo     ver | exportar
--   pnl:recetas     ver | editar (paneles, materiales, recetas, proyectos, importar Excel)
-- Los admin del portal (rol admin, super admin, root) pueden todo.
--
-- Re-ejecutable. Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla de accesos

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('043e6b57-8c97-4eef-8bf2-53d117afc5df', 'Producción Paneles SIP (sistema)', 'produccion-sip', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del portal de Produccion de Paneles SIP. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.pnl_ancla_id()
returns uuid language sql immutable set search_path = public as $$
  select '043e6b57-8c97-4eef-8bf2-53d117afc5df'::uuid
$$;

create or replace function public.pnl_usuario_puede_modulo(p_modulo text, p_accion text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe
    where pe.user_id = p_user_id and pe.proyecto_id = pnl_ancla_id()
      and pe.modulo_key = 'pnl:' || p_modulo and pe.accion = p_accion
  )
$$;

create or replace function public.pnl_puede_modulo(p_modulo text, p_accion text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_usuario_puede_modulo(p_modulo, p_accion, auth.uid())
$$;

create or replace function public.pnl_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe where pe.user_id = p_user_id and pe.proyecto_id = pnl_ancla_id() and pe.modulo_key like 'pnl:%'
  )
$$;

-- Ver la produccion registrada: la necesitan Registro y Consumo
create or replace function public.pnl_ve_produccion()
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_puede_modulo('produccion', 'ver') or pnl_puede_modulo('consumo', 'ver')
$$;

revoke execute on function public.pnl_usuario_puede_modulo(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.pnl_puede_modulo(text, text), public.pnl_tiene_acceso(uuid), public.pnl_ve_produccion() from public, anon;
grant  execute on function public.pnl_puede_modulo(text, text), public.pnl_tiene_acceso(uuid), public.pnl_ve_produccion() to authenticated;

-- "Hoy" en Chile, independiente de la zona horaria del servidor
create or replace function public.pnl_hoy()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santiago')::date
$$;

-- ---------------------------------------------------------------- catalogo

create table if not exists public.pnl_materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,               -- codigo de articulo SAP
  descripcion text not null,
  unidad text not null,                      -- UNIDAD, KG, M3, PZA...
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pnl_paneles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,               -- codigo de articulo SAP del panel (6602xxx)
  descripcion text not null,
  -- medidas: se sacan de la descripcion ("...; 1220x2440x78mm") si no se indican
  ancho_mm int check (ancho_mm > 0),
  largo_mm int check (largo_mm > 0),
  espesor_mm int check (espesor_mm > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pnl_recetas (
  panel_id uuid not null references public.pnl_paneles(id) on delete cascade,
  material_id uuid not null references public.pnl_materiales(id) on delete restrict,
  cantidad numeric(14,6) not null check (cantidad > 0),   -- cantidad base por 1 panel
  primary key (panel_id, material_id)
);
create index if not exists pnl_recetas_material_idx on public.pnl_recetas (material_id);

-- Proyectos propios del portal. El destino de una linea es una obra del hub (proyectos) o uno de
-- estos, nunca los dos.
create table if not exists public.pnl_proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- produccion

create table if not exists public.pnl_partes (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,
  fecha date not null default public.pnl_hoy(),
  -- ingreso por hora: tramo dentro del dia. Sin horas = ingreso del dia completo
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
create index if not exists pnl_partes_fecha_idx on public.pnl_partes (fecha);

create table if not exists public.pnl_lineas (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references public.pnl_partes(id) on delete cascade,
  panel_id uuid not null references public.pnl_paneles(id) on delete restrict,
  buenos int not null default 0 check (buenos >= 0),
  rechazados int not null default 0 check (rechazados >= 0),
  proyecto_id uuid references public.proyectos(id) on delete set null,      -- obra del hub
  pnl_proyecto_id uuid references public.pnl_proyectos(id) on delete restrict, -- proyecto propio
  referencia text,                           -- OT / pedido / cliente, texto libre
  created_at timestamptz not null default now(),
  check (buenos + rechazados > 0),
  constraint pnl_lineas_un_proyecto check (proyecto_id is null or pnl_proyecto_id is null)
);
-- bases que ya tenian la tabla sin proyectos propios
alter table public.pnl_lineas add column if not exists pnl_proyecto_id uuid references public.pnl_proyectos(id) on delete restrict;
do $$ begin
  alter table public.pnl_lineas add constraint pnl_lineas_un_proyecto check (proyecto_id is null or pnl_proyecto_id is null);
exception when duplicate_object then null; end $$;
create index if not exists pnl_lineas_pnl_proyecto_idx on public.pnl_lineas (pnl_proyecto_id);
create index if not exists pnl_lineas_parte_idx on public.pnl_lineas (parte_id);
create index if not exists pnl_lineas_panel_idx on public.pnl_lineas (panel_id);

create table if not exists public.pnl_consumos (
  linea_id uuid not null references public.pnl_lineas(id) on delete cascade,
  material_id uuid not null references public.pnl_materiales(id) on delete restrict,
  cantidad_unitaria numeric(14,6) not null,  -- copia de la receta al registrar
  primary key (linea_id, material_id)
);
create index if not exists pnl_consumos_material_idx on public.pnl_consumos (material_id);

-- ---------------------------------------------------------------- triggers

create or replace function public.pnl_tocar_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Medidas desde la descripcion: "...; 1220x2440x78mm" (ancho x largo x espesor)
create or replace function public.pnl_panel_medidas()
returns trigger language plpgsql set search_path = public as $$
declare m text[];
begin
  m := regexp_match(new.descripcion, '(\d{3,5})\s*[xX]\s*(\d{3,5})\s*[xX]\s*(\d{2,4})\s*mm');
  if m is not null then
    new.ancho_mm   := coalesce(new.ancho_mm, m[1]::int);
    new.largo_mm   := coalesce(new.largo_mm, m[2]::int);
    new.espesor_mm := coalesce(new.espesor_mm, m[3]::int);
  end if;
  new.codigo := btrim(new.codigo);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pnl_paneles_medidas on public.pnl_paneles;
create trigger pnl_paneles_medidas before insert or update on public.pnl_paneles
  for each row execute function public.pnl_panel_medidas();
drop trigger if exists pnl_materiales_updated on public.pnl_materiales;
create trigger pnl_materiales_updated before update on public.pnl_materiales
  for each row execute function public.pnl_tocar_updated();

-- Quien corrige un parte queda registrado
create or replace function public.pnl_parte_updated()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.created_by := old.created_by;          -- el autor no se cambia
  return new;
end $$;
drop trigger if exists pnl_partes_updated on public.pnl_partes;
create trigger pnl_partes_updated before update on public.pnl_partes
  for each row execute function public.pnl_parte_updated();

-- Copia la receta vigente al crear la linea o al cambiarle el panel. Security definer: la copia
-- la hace la base, nadie escribe pnl_consumos directo.
create or replace function public.pnl_linea_consumos()
returns trigger language plpgsql security definer set search_path = public as $$
declare codigo_panel text;
begin
  if tg_op = 'UPDATE' and new.panel_id = old.panel_id then
    return new;
  end if;
  delete from pnl_consumos where linea_id = new.id;
  insert into pnl_consumos (linea_id, material_id, cantidad_unitaria)
  select new.id, r.material_id, r.cantidad from pnl_recetas r where r.panel_id = new.panel_id;
  if not found then
    select codigo into codigo_panel from pnl_paneles where id = new.panel_id;
    raise exception 'El panel % no tiene receta: cárguela en Paneles y recetas antes de registrar su producción', codigo_panel
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pnl_lineas_consumos on public.pnl_lineas;
create trigger pnl_lineas_consumos after insert or update of panel_id on public.pnl_lineas
  for each row execute function public.pnl_linea_consumos();
-- funcion de trigger: no se llama por RPC (el trigger se dispara igual)
revoke execute on function public.pnl_linea_consumos() from public, anon, authenticated;


-- ---------------------------------------------------------------- vistas (con la RLS de quien consulta)

-- Nombre de quien registro o corrigio: profiles solo deja ver otros usuarios a algunos roles.
-- Solo responde a quien ve la produccion.
create or replace function public.pnl_nombre_usuario(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email)
  from profiles p where p.id = p_user_id and pnl_ve_produccion()
$$;
revoke execute on function public.pnl_nombre_usuario(uuid) from public, anon;
grant  execute on function public.pnl_nombre_usuario(uuid) to authenticated;

-- se recrean (cambian columnas entre versiones de esta migracion)
drop view if exists public.pnl_partes_v, public.pnl_lineas_v, public.pnl_consumos_v;

create or replace view public.pnl_partes_v with (security_invoker = true) as
select
  p.id, p.numero, p.fecha, p.hora_desde, p.hora_hasta, p.observacion,
  p.created_by, pnl_nombre_usuario(p.created_by) as registrado_por, p.created_at,
  p.updated_by, pnl_nombre_usuario(p.updated_by) as corregido_por, p.updated_at,
  count(l.id)::int as lineas,
  coalesce(sum(l.buenos), 0)::int as buenos,
  coalesce(sum(l.rechazados), 0)::int as rechazados,
  round(coalesce(sum(l.buenos * pa.ancho_mm::numeric * pa.largo_mm / 1e6), 0), 2) as m2_buenos
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
  l.proyecto_id, l.pnl_proyecto_id, coalesce(pr.nombre, pp.nombre) as proyecto_nombre, l.referencia,
  p.created_by, p.created_at
from public.pnl_lineas l
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
left join public.proyectos pr on pr.id = l.proyecto_id
left join public.pnl_proyectos pp on pp.id = l.pnl_proyecto_id;

create or replace view public.pnl_consumos_v with (security_invoker = true) as
select
  c.linea_id, l.parte_id, p.fecha, p.hora_desde, p.hora_hasta,
  l.panel_id, pa.codigo as panel_codigo, l.proyecto_id, l.pnl_proyecto_id, l.referencia,
  c.material_id, m.codigo as material_codigo, m.descripcion as material_descripcion, m.unidad,
  c.cantidad_unitaria,
  c.cantidad_unitaria * l.buenos as cantidad_buenos,
  c.cantidad_unitaria * l.rechazados as cantidad_merma,
  c.cantidad_unitaria * (l.buenos + l.rechazados) as cantidad_total
from public.pnl_consumos c
join public.pnl_lineas l on l.id = c.linea_id
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
join public.pnl_materiales m on m.id = c.material_id;

-- ---------------------------------------------------------------- RLS

alter table public.pnl_materiales enable row level security;
alter table public.pnl_paneles    enable row level security;
alter table public.pnl_recetas    enable row level security;
alter table public.pnl_partes     enable row level security;
alter table public.pnl_lineas     enable row level security;
alter table public.pnl_consumos   enable row level security;
alter table public.pnl_proyectos  enable row level security;

do $$
declare t text;
begin
  -- catalogo: lo ve cualquiera del portal, lo edita quien tiene Recetas
  foreach t in array array['pnl_materiales','pnl_paneles','pnl_recetas','pnl_proyectos'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (pnl_tiene_acceso())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (pnl_puede_modulo(''recetas'', ''editar''))', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (pnl_puede_modulo(''recetas'', ''editar'')) with check (pnl_puede_modulo(''recetas'', ''editar''))', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (pnl_puede_modulo(''recetas'', ''editar''))', t);
  end loop;
end $$;

-- partes: 'crear' registra y corrige los propios; 'editar' corrige cualquiera
drop policy if exists pnl_partes_select on public.pnl_partes;
create policy pnl_partes_select on public.pnl_partes for select to authenticated using (pnl_ve_produccion());
drop policy if exists pnl_partes_insert on public.pnl_partes;
create policy pnl_partes_insert on public.pnl_partes for insert to authenticated
  with check (pnl_puede_modulo('produccion', 'crear') and created_by = auth.uid());
drop policy if exists pnl_partes_update on public.pnl_partes;
create policy pnl_partes_update on public.pnl_partes for update to authenticated
  using (pnl_puede_modulo('produccion', 'editar') or (pnl_puede_modulo('produccion', 'crear') and created_by = auth.uid()))
  with check (true);
drop policy if exists pnl_partes_delete on public.pnl_partes;
create policy pnl_partes_delete on public.pnl_partes for delete to authenticated
  using (pnl_puede_modulo('produccion', 'eliminar'));

-- lineas: mismas reglas que su parte
create or replace function public.pnl_puede_editar_parte(p_parte_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select pnl_puede_modulo('produccion', 'editar')
      or (pnl_puede_modulo('produccion', 'crear')
          and exists (select 1 from pnl_partes where id = p_parte_id and created_by = auth.uid()))
$$;
revoke execute on function public.pnl_puede_editar_parte(uuid) from public, anon;
grant  execute on function public.pnl_puede_editar_parte(uuid) to authenticated;

drop policy if exists pnl_lineas_select on public.pnl_lineas;
create policy pnl_lineas_select on public.pnl_lineas for select to authenticated using (pnl_ve_produccion());
drop policy if exists pnl_lineas_insert on public.pnl_lineas;
create policy pnl_lineas_insert on public.pnl_lineas for insert to authenticated with check (pnl_puede_editar_parte(parte_id));
drop policy if exists pnl_lineas_update on public.pnl_lineas;
create policy pnl_lineas_update on public.pnl_lineas for update to authenticated
  using (pnl_puede_editar_parte(parte_id)) with check (pnl_puede_editar_parte(parte_id));
drop policy if exists pnl_lineas_delete on public.pnl_lineas;
create policy pnl_lineas_delete on public.pnl_lineas for delete to authenticated using (pnl_puede_editar_parte(parte_id));

-- consumos: solo lectura (los escribe el trigger)
drop policy if exists pnl_consumos_select on public.pnl_consumos;
create policy pnl_consumos_select on public.pnl_consumos for select to authenticated using (pnl_ve_produccion());

grant select, insert, update, delete on public.pnl_materiales, public.pnl_paneles, public.pnl_recetas,
  public.pnl_proyectos, public.pnl_partes, public.pnl_lineas to authenticated;
grant select on public.pnl_consumos, public.pnl_partes_v, public.pnl_lineas_v, public.pnl_consumos_v to authenticated;
revoke all on public.pnl_materiales, public.pnl_paneles, public.pnl_recetas, public.pnl_proyectos, public.pnl_partes,
  public.pnl_lineas, public.pnl_consumos, public.pnl_partes_v, public.pnl_lineas_v, public.pnl_consumos_v from anon;

-- ---------------------------------------------------------------- guardar un parte completo

-- Crea o reemplaza un parte con todas sus lineas en una sola transaccion (si una linea falla, no
-- queda nada a medias). p_lineas: [{id?, panel_id, buenos, rechazados, proyecto_id | pnl_proyecto_id, referencia}].
-- Security invoker: la RLS decide si puede crear o corregir.
create or replace function public.pnl_guardar_parte(
  p_parte_id uuid, p_fecha date, p_hora_desde time, p_hora_hasta time, p_observacion text, p_lineas jsonb
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El parte necesita al menos un panel' using errcode = 'P0001';
  end if;
  if p_fecha > pnl_hoy() then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;

  if p_parte_id is null then
    insert into pnl_partes (fecha, hora_desde, hora_hasta, observacion)
    values (p_fecha, p_hora_desde, p_hora_hasta, nullif(btrim(p_observacion), ''))
    returning id into v_id;
  else
    update pnl_partes set fecha = p_fecha, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
      observacion = nullif(btrim(p_observacion), '')
    where id = p_parte_id
    returning id into v_id;
    if v_id is null then
      raise exception 'No puede corregir este parte' using errcode = '42501';
    end if;
    -- las lineas que ya no vienen se borran; las que vienen con id se actualizan y conservan su
    -- consumo copiado (el trigger solo lo vuelve a copiar si les cambia el panel)
    delete from pnl_lineas l where l.parte_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_lineas) e where nullif(e->>'id', '')::uuid = l.id);
  end if;

  -- lineas existentes (traen id): se actualizan y conservan su consumo copiado
  update pnl_lineas l set
    panel_id = (e->>'panel_id')::uuid,
    buenos = coalesce((e->>'buenos')::int, 0),
    rechazados = coalesce((e->>'rechazados')::int, 0),
    proyecto_id = nullif(e->>'proyecto_id', '')::uuid,
    pnl_proyecto_id = nullif(e->>'pnl_proyecto_id', '')::uuid,
    referencia = nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where p_parte_id is not null and l.parte_id = v_id and l.id = nullif(e->>'id', '')::uuid;

  -- lineas nuevas
  insert into pnl_lineas (parte_id, panel_id, buenos, rechazados, proyecto_id, pnl_proyecto_id, referencia)
  select v_id, (e->>'panel_id')::uuid, coalesce((e->>'buenos')::int, 0), coalesce((e->>'rechazados')::int, 0),
         nullif(e->>'proyecto_id', '')::uuid, nullif(e->>'pnl_proyecto_id', '')::uuid, nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where nullif(e->>'id', '') is null
     or not exists (select 1 from pnl_lineas l where l.id = nullif(e->>'id', '')::uuid and l.parte_id = v_id);

  return v_id;
end $$;

revoke execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb) from public, anon;
grant  execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- editar la receta de un panel

-- Reemplaza la receta completa de un panel. p_filas: [{material_id, cantidad}]. Security invoker:
-- la RLS de pnl_recetas exige Recetas:editar.
create or replace function public.pnl_guardar_receta(p_panel_id uuid, p_filas jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'La receta necesita al menos un material' using errcode = 'P0001';
  end if;
  if not pnl_puede_modulo('recetas', 'editar') then
    raise exception 'Sin permiso para editar recetas' using errcode = '42501';
  end if;
  delete from pnl_recetas where panel_id = p_panel_id;
  insert into pnl_recetas (panel_id, material_id, cantidad)
  select p_panel_id, (e->>'material_id')::uuid, (e->>'cantidad')::numeric from jsonb_array_elements(p_filas) e;
end $$;

revoke execute on function public.pnl_guardar_receta(uuid, jsonb) from public, anon;
grant  execute on function public.pnl_guardar_receta(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- importar recetas (Excel SAP)

-- p_filas: [{panel_codigo, panel_descripcion, material_codigo, material_descripcion, cantidad, unidad}]
-- (columnas de PNL_SIP.xlsx: Numero de articulo, Descripcion del articulo, N, Descripcion,
-- Cantidad base, Nombre de unidad de medida). Crea o actualiza paneles y materiales, y REEMPLAZA
-- la receta de cada panel que viene en el archivo; los paneles que no vienen no se tocan.
-- Lo ya producido no cambia: guarda su propia copia de la receta.
create or replace function public.pnl_importar_recetas(p_filas jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  n_paneles int; n_materiales_nuevos int; n_lineas int;
begin
  if not pnl_puede_modulo('recetas', 'editar') then
    raise exception 'Sin permiso para editar recetas' using errcode = '42501';
  end if;

  drop table if exists _f;
  create temp table _f on commit drop as
  select btrim(e->>'panel_codigo') as panel_codigo, btrim(e->>'panel_descripcion') as panel_descripcion,
         btrim(e->>'material_codigo') as material_codigo, btrim(e->>'material_descripcion') as material_descripcion,
         (e->>'cantidad')::numeric as cantidad, upper(btrim(coalesce(e->>'unidad', ''))) as unidad
  from jsonb_array_elements(p_filas) e;

  if exists (select 1 from _f where coalesce(panel_codigo, '') = '' or coalesce(material_codigo, '') = ''
                                  or cantidad is null or cantidad <= 0) then
    raise exception 'Hay filas sin código de panel, sin código de material o con cantidad no positiva' using errcode = 'P0001';
  end if;
  if exists (select 1 from _f group by panel_codigo, material_codigo having count(*) > 1) then
    raise exception 'Un mismo material aparece dos veces en la receta de un panel' using errcode = 'P0001';
  end if;

  select count(*) into n_materiales_nuevos from (select distinct material_codigo from _f) x
  where not exists (select 1 from pnl_materiales m where m.codigo = x.material_codigo);

  insert into pnl_materiales (codigo, descripcion, unidad)
  select distinct on (material_codigo) material_codigo, material_descripcion, coalesce(nullif(unidad, ''), 'UNIDAD')
  from _f order by material_codigo
  on conflict (codigo) do update set descripcion = excluded.descripcion, unidad = excluded.unidad, activo = true;

  insert into pnl_paneles (codigo, descripcion)
  select distinct on (panel_codigo) panel_codigo, panel_descripcion from _f order by panel_codigo
  on conflict (codigo) do update set descripcion = excluded.descripcion, activo = true;

  delete from pnl_recetas r using pnl_paneles p
  where r.panel_id = p.id and p.codigo in (select panel_codigo from _f);

  insert into pnl_recetas (panel_id, material_id, cantidad)
  select p.id, m.id, f.cantidad
  from _f f join pnl_paneles p on p.codigo = f.panel_codigo join pnl_materiales m on m.codigo = f.material_codigo;
  get diagnostics n_lineas = row_count;

  select count(distinct panel_codigo) into n_paneles from _f;
  return jsonb_build_object('paneles', n_paneles, 'materiales_nuevos', n_materiales_nuevos, 'lineas', n_lineas);
end $$;

revoke execute on function public.pnl_importar_recetas(jsonb) from public, anon;
grant  execute on function public.pnl_importar_recetas(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

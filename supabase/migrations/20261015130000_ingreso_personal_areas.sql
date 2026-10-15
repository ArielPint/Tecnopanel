-- Portal Ingreso de Personal: areas que pueden solicitar personal, configurables desde el portal
-- (Configuracion > Areas). Antes eran sugerencias fijas en el codigo.
--
-- La solicitud sigue guardando el nombre del area (ing_ingresos.area, texto): si despues se renombra
-- o se desactiva un area, las solicitudes ya hechas conservan el nombre con que se pidieron.
-- Al crear una solicitud desde la web el area tiene que existir y estar activa.
--
-- Las ve cualquiera con acceso al portal; las administra RRHH (y los admin del hub).
-- Va despues de 20261015120000_ingreso_personal.sql. Re-ejecutable.
set client_encoding = 'UTF8';

begin;

create table if not exists public.ing_areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ing_areas_nombre_uq on public.ing_areas (lower(btrim(nombre)));

create or replace function public.ing_area_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  return new;
end $$;
drop trigger if exists ing_area_antes on public.ing_areas;
create trigger ing_area_antes before insert or update on public.ing_areas
  for each row execute function public.ing_area_antes();

-- El area de una solicitud nueva (o cambiada) tiene que estar configurada y activa
create or replace function public.ing_area_valida(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ing_areas a where a.activa and lower(a.nombre) = lower(btrim(p_nombre)))
$$;

create or replace function public.ing_area_nombre(p_nombre text)
returns text language sql stable security definer set search_path = public as $$
  select a.nombre from ing_areas a where lower(a.nombre) = lower(btrim(p_nombre))
$$;

create or replace function public.ing_ingreso_area()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or new.area is distinct from old.area)
     and not ing_area_valida(new.area) then
    raise exception 'El área "%" no está configurada o está inactiva', new.area using errcode = '22023';
  end if;
  -- se guarda con el nombre tal como esta configurado (mayusculas y tildes)
  if tg_op = 'INSERT' or new.area is distinct from old.area then
    new.area := coalesce(ing_area_nombre(new.area), new.area);
  end if;
  return new;
end $$;
drop trigger if exists ing_ingreso_area on public.ing_ingresos;
create trigger ing_ingreso_area before insert or update of area on public.ing_ingresos
  for each row execute function public.ing_ingreso_area();

alter table public.ing_areas enable row level security;

drop policy if exists ing_areas_select on public.ing_areas;
create policy ing_areas_select on public.ing_areas for select to authenticated
  using (ing_tiene_acceso());
drop policy if exists ing_areas_insert on public.ing_areas;
create policy ing_areas_insert on public.ing_areas for insert to authenticated
  with check (ing_tiene('rrhh'));
drop policy if exists ing_areas_update on public.ing_areas;
create policy ing_areas_update on public.ing_areas for update to authenticated
  using (ing_tiene('rrhh')) with check (ing_tiene('rrhh'));
drop policy if exists ing_areas_delete on public.ing_areas;
create policy ing_areas_delete on public.ing_areas for delete to authenticated
  using (ing_tiene('rrhh'));

revoke all on public.ing_areas from anon;
revoke truncate on public.ing_areas from authenticated;

revoke execute on function public.ing_area_antes(), public.ing_area_valida(text), public.ing_area_nombre(text), public.ing_ingreso_area()
  from public, anon;
-- el trigger BEFORE corre como el usuario: necesita poder llamar a estas dos
grant execute on function public.ing_area_valida(text), public.ing_area_nombre(text) to authenticated;

notify pgrst, 'reload schema';

commit;

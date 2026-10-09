-- Portal de Prevencion, fase 3 (PLAN_SSO_PORTAL.md): Capacitaciones y charlas.
--
-- Una capacitacion (charla de 5 minutos, induccion, ODI, curso, simulacro...) con sus asistentes
-- (trabajadores) y la evidencia: foto o PDF de la lista de asistencia firmada. Los tipos con vigencia
-- (ej. trabajo en altura cada 24 meses) dan la situacion de cada trabajador: vigente / por vencer / vencida.
--
-- Permisos (modulo 'capacitaciones'): ver, crear (registrar), editar, eliminar, exportar.
-- Catalogo de tipos: Configuracion > editar.
--
-- Storage: el bucket 'sso' pasa a tener una carpeta por modulo. Los hallazgos siguen en
-- <hallazgo_id>/..., las capacitaciones en capacitaciones/<capacitacion_id>/..., y las fases que
-- vienen agregan la suya. sso_modulo_de_objeto() dice a que modulo pertenece cada objeto.
--
-- Re-ejecutable. Va despues de 20261005130000_sso_trabajadores.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- catalogo

create table if not exists public.sso_tipos_capacitacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  vigencia_meses int check (vigencia_meses is null or vigencia_meses > 0),   -- null: no vence (charla, induccion)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.sso_tipos_capacitacion (nombre, vigencia_meses) values
  ('Charla de 5 minutos', null),
  ('Inducción de ingreso', null),
  ('ODI / Derecho a saber', null),
  ('Trabajo en altura', 24),
  ('Uso y manejo de extintores', 12),
  ('Primeros auxilios', 24),
  ('Espacios confinados', 12),
  ('Manejo defensivo', 36),
  ('Simulacro de emergencia', null),
  ('Curso externo', null)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------- capacitaciones

create table if not exists public.sso_capacitaciones (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.sso_tipos_capacitacion(id),
  tema text not null,
  fecha date not null,
  duracion_min int not null check (duracion_min between 1 and 2400),
  relator text not null,                          -- persona u organismo (OTEC, mutual)
  area_id uuid references public.sso_areas(id) on delete set null,
  lugar text,
  contenido text,
  evidencia_path text,                            -- lista de asistencia firmada, en el bucket 'sso'
  evidencia_nombre text,
  registrado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sso_capacitaciones_fecha_idx on public.sso_capacitaciones (fecha desc);
create index if not exists sso_capacitaciones_tipo_idx on public.sso_capacitaciones (tipo_id);

create table if not exists public.sso_capacitacion_asistentes (
  capacitacion_id uuid not null references public.sso_capacitaciones(id) on delete cascade,
  trabajador_id uuid not null references public.sso_trabajadores(id) on delete cascade,
  asistio boolean not null default true,          -- citado pero ausente = false (queda registro)
  created_at timestamptz not null default now(),
  primary key (capacitacion_id, trabajador_id)
);
create index if not exists sso_cap_asistentes_trabajador_idx on public.sso_capacitacion_asistentes (trabajador_id);

create or replace function public.sso_capacitacion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.fecha > sso_hoy() then
    raise exception 'La fecha de la capacitación no puede ser futura' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sso_capacitacion_antes on public.sso_capacitaciones;
create trigger sso_capacitacion_antes before insert or update on public.sso_capacitaciones
  for each row execute function public.sso_capacitacion_antes();

-- Listado con conteos (asistentes y horas-hombre = duracion x asistentes que asistieron)
create or replace view public.sso_capacitaciones_v with (security_invoker = true) as
select c.*,
  tc.nombre as tipo,
  tc.vigencia_meses,
  (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and a.asistio) as asistentes,
  (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and not a.asistio) as ausentes,
  round(c.duracion_min / 60.0 * (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and a.asistio), 1) as horas_hombre
from public.sso_capacitaciones c
join public.sso_tipos_capacitacion tc on tc.id = c.tipo_id;

-- Vigencia de cada trabajador por tipo de capacitacion: la ultima vez que asistio.
create or replace view public.sso_capacitaciones_vigentes with (security_invoker = true) as
select distinct on (a.trabajador_id, c.tipo_id)
  a.trabajador_id, c.tipo_id, c.id as capacitacion_id, c.fecha,
  case when tc.vigencia_meses is not null then (c.fecha + make_interval(months => tc.vigencia_meses))::date end as vencimiento,
  case
    when tc.vigencia_meses is null then 'vigente'
    when (c.fecha + make_interval(months => tc.vigencia_meses))::date < public.sso_hoy() then 'vencido'
    when (c.fecha + make_interval(months => tc.vigencia_meses))::date <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion
from public.sso_capacitacion_asistentes a
join public.sso_capacitaciones c on c.id = a.capacitacion_id
join public.sso_tipos_capacitacion tc on tc.id = c.tipo_id
where a.asistio
order by a.trabajador_id, c.tipo_id, c.fecha desc;

-- ---------------------------------------------------------------- RLS

alter table public.sso_tipos_capacitacion      enable row level security;
alter table public.sso_capacitaciones          enable row level security;
alter table public.sso_capacitacion_asistentes enable row level security;

drop policy if exists sso_tipos_cap_select on public.sso_tipos_capacitacion;
create policy sso_tipos_cap_select on public.sso_tipos_capacitacion for select to authenticated using (sso_tiene_acceso());
drop policy if exists sso_tipos_cap_write on public.sso_tipos_capacitacion;
create policy sso_tipos_cap_write on public.sso_tipos_capacitacion for all to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));

drop policy if exists sso_cap_select on public.sso_capacitaciones;
create policy sso_cap_select on public.sso_capacitaciones for select to authenticated using (sso_puede_modulo('capacitaciones', 'ver'));
drop policy if exists sso_cap_insert on public.sso_capacitaciones;
create policy sso_cap_insert on public.sso_capacitaciones for insert to authenticated with check (sso_puede_modulo('capacitaciones', 'crear'));
drop policy if exists sso_cap_update on public.sso_capacitaciones;
create policy sso_cap_update on public.sso_capacitaciones for update to authenticated
  using (sso_puede_modulo('capacitaciones', 'editar') or (registrado_por = (select auth.uid()) and sso_puede_modulo('capacitaciones', 'crear')))
  with check (sso_puede_modulo('capacitaciones', 'editar') or (registrado_por = (select auth.uid()) and sso_puede_modulo('capacitaciones', 'crear')));
drop policy if exists sso_cap_delete on public.sso_capacitaciones;
create policy sso_cap_delete on public.sso_capacitaciones for delete to authenticated using (sso_puede_modulo('capacitaciones', 'eliminar'));

-- asistentes: se ven con el modulo; se escriben si se puede editar esa capacitacion
drop policy if exists sso_cap_asis_select on public.sso_capacitacion_asistentes;
create policy sso_cap_asis_select on public.sso_capacitacion_asistentes for select to authenticated using (sso_puede_modulo('capacitaciones', 'ver'));
drop policy if exists sso_cap_asis_write on public.sso_capacitacion_asistentes;
create policy sso_cap_asis_write on public.sso_capacitacion_asistentes for all to authenticated
  using (exists (select 1 from public.sso_capacitaciones c where c.id = capacitacion_id
                 and (sso_puede_modulo('capacitaciones', 'editar') or (c.registrado_por = (select auth.uid()) and sso_puede_modulo('capacitaciones', 'crear')))))
  with check (exists (select 1 from public.sso_capacitaciones c where c.id = capacitacion_id
                 and (sso_puede_modulo('capacitaciones', 'editar') or (c.registrado_por = (select auth.uid()) and sso_puede_modulo('capacitaciones', 'crear')))));

revoke all on public.sso_tipos_capacitacion, public.sso_capacitaciones, public.sso_capacitacion_asistentes,
              public.sso_capacitaciones_v, public.sso_capacitaciones_vigentes from anon;
revoke truncate on public.sso_tipos_capacitacion, public.sso_capacitaciones, public.sso_capacitacion_asistentes from authenticated;
revoke insert, update, delete, truncate on public.sso_capacitaciones_v, public.sso_capacitaciones_vigentes from authenticated;
revoke execute on function public.sso_capacitacion_antes() from public, anon, authenticated;

-- ---------------------------------------------------------------- personas del portal
-- sso_usuarios() nacio cuando el portal era solo Hallazgos. Ahora:
--   'ver'    -> cualquiera con acceso al portal (para mostrar nombres en todos los modulos)
--   otra     -> esa accion en Hallazgos (ej. 'editar' = puede ser responsable de un hallazgo)
create or replace function public.sso_usuarios(p_accion text default 'ver')
returns table (id uuid, nombre text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), p.email
  from profiles p
  where sso_tiene_acceso() and coalesce(p.activo, true) and not coalesce(p.is_root, false)
    and case when p_accion = 'ver' then sso_tiene_acceso(p.id) else sso_usuario_puede(p_accion, p.id) end
  order by 2
$$;

-- ---------------------------------------------------------------- Storage: una carpeta por modulo

-- Modulo al que pertenece un objeto del bucket 'sso' segun su primera carpeta. Los hallazgos usan
-- su propio id como carpeta (fase 1), el resto el nombre del modulo.
create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones') then split_part(p_name, '/', 1)
  end
$$;

-- lectura: el 'ver' del modulo dueño (antes: cualquiera con Hallazgos veia todo el bucket)
drop policy if exists sso_objects_select on storage.objects;
create policy sso_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'sso' and public.sso_puede_modulo(coalesce(public.sso_modulo_de_objeto(name), '-'), 'ver'));

-- capacitaciones/<capacitacion_id>/<archivo>: sube quien puede editar esa capacitacion
drop policy if exists sso_objects_cap_insert on storage.objects;
create policy sso_objects_cap_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'capacitaciones' and exists (
    select 1 from public.sso_capacitaciones c
    where c.id::text = (storage.foldername(name))[2]
      and (public.sso_puede_modulo('capacitaciones', 'editar')
           or (c.registrado_por = (select auth.uid()) and public.sso_puede_modulo('capacitaciones', 'crear')))));
drop policy if exists sso_objects_cap_delete on storage.objects;
create policy sso_objects_cap_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'capacitaciones' and (
    public.sso_puede_modulo('capacitaciones', 'editar') or public.sso_puede_modulo('capacitaciones', 'eliminar')
    or exists (select 1 from public.sso_capacitaciones c where c.id::text = (storage.foldername(name))[2]
               and c.registrado_por = (select auth.uid()) and public.sso_puede_modulo('capacitaciones', 'crear'))));

-- la evidencia es PDF o foto (antes el bucket solo aceptaba imagenes)
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] where id = 'sso';

notify pgrst, 'reload schema';

commit;

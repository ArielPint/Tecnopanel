-- Portal de Prevencion, fase 2 (PLAN_SSO_PORTAL.md): Trabajadores y examenes ocupacionales.
--
-- Trabajadores propios y de contratistas (empresa). Son la base de Capacitaciones, EPP, Accidentes
-- y Comite: no son cuentas del hub (un operario no entra al portal); se cargan a mano o por Excel.
--
-- Permisos (modulo 'trabajadores' sobre el ancla):
--   ver      -> ficha basica (sin datos de salud)
--   crear    -> alta e importacion desde Excel
--   editar   -> editar fichas, dar de baja
--   aprobar  -> VER Y REGISTRAR EXAMENES OCUPACIONALES: son datos de salud (Ley 19.628), por eso
--               van con un permiso propio y en un bucket aparte ('sso-salud')
--   exportar -> exportar a Excel
--   eliminar -> borrar fichas (lo normal es dar de baja)
-- Los catalogos (empresas, tipos de examen) los edita quien tiene Configuracion.
--
-- Re-ejecutable. Va despues de 20261005120000_sso_portal.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- RUT

-- '12.345.678-k' -> '12345678-K'. null si no tiene forma de RUT.
create or replace function public.sso_rut_normalizar(p_rut text)
returns text language sql immutable as $$
  select case
    when regexp_replace(upper(coalesce(p_rut, '')), '[^0-9K]', '', 'g') ~ '^[0-9]{6,8}[0-9K]$'
    then regexp_replace(regexp_replace(upper(p_rut), '[^0-9K]', '', 'g'), '^([0-9]+)([0-9K])$', '\1-\2')
  end
$$;

-- digito verificador (modulo 11) de un RUT ya normalizado
create or replace function public.sso_rut_valido(p_rut text)
returns boolean language plpgsql immutable as $$
declare
  v_cuerpo text := split_part(p_rut, '-', 1);
  v_dv text := split_part(p_rut, '-', 2);
  v_suma int := 0;
  v_mult int := 2;
  v_resto int;
  v_esperado text;
begin
  if p_rut is null or p_rut !~ '^[0-9]{5,8}-[0-9K]$' then return false; end if;
  for i in reverse length(v_cuerpo)..1 loop
    v_suma := v_suma + substr(v_cuerpo, i, 1)::int * v_mult;
    v_mult := case when v_mult = 7 then 2 else v_mult + 1 end;
  end loop;
  v_resto := 11 - (v_suma % 11);
  v_esperado := case v_resto when 11 then '0' when 10 then 'K' else v_resto::text end;
  return v_dv = v_esperado;
end $$;

-- ---------------------------------------------------------------- catalogos

create table if not exists public.sso_empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  rut text,
  propia boolean not null default false,   -- Tecnopanel; el resto son contratistas
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.sso_empresas (nombre, propia) values ('Tecnopanel', true) on conflict (nombre) do nothing;

create table if not exists public.sso_tipos_examen (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  vigencia_meses int check (vigencia_meses is null or vigencia_meses > 0),   -- null: no vence
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
-- Valores de partida habituales en Chile; se ajustan en Configuracion segun lo que indique la mutual.
insert into public.sso_tipos_examen (nombre, vigencia_meses) values
  ('Preocupacional', null),
  ('Ocupacional periódico', 12),
  ('Altura física', 12),
  ('Espacios confinados', 12),
  ('Ruido (PREXOR)', 24),
  ('Sílice (PLANESI)', 12),
  ('Psicosensotécnico (conducción)', 48)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------- trabajadores

create table if not exists public.sso_trabajadores (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique,                       -- normalizado: 12345678-9
  nombres text not null,
  apellidos text not null,
  empresa_id uuid not null references public.sso_empresas(id),
  cargo text,
  area_id uuid references public.sso_areas(id) on delete set null,
  fecha_ingreso date,
  telefono text,
  email text,
  contacto_emergencia text,                       -- nombre y telefono, texto libre
  user_id uuid references auth.users(id) on delete set null,   -- si ademas tiene cuenta en el hub
  activo boolean not null default true,
  fecha_baja date,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (activo or fecha_baja is not null)
);
create index if not exists sso_trabajadores_empresa_idx on public.sso_trabajadores (empresa_id);
create index if not exists sso_trabajadores_area_idx on public.sso_trabajadores (area_id);

create or replace function public.sso_trabajador_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.rut := sso_rut_normalizar(new.rut);
  if new.rut is null or not sso_rut_valido(new.rut) then
    raise exception 'RUT inválido' using errcode = '22023';
  end if;
  new.nombres := btrim(new.nombres);
  new.apellidos := btrim(new.apellidos);
  if new.activo then new.fecha_baja := null;
  elsif new.fecha_baja is null then new.fecha_baja := sso_hoy(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sso_trabajador_antes on public.sso_trabajadores;
create trigger sso_trabajador_antes before insert or update on public.sso_trabajadores
  for each row execute function public.sso_trabajador_antes();

-- ---------------------------------------------------------------- examenes (datos de salud)

create table if not exists public.sso_examenes (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references public.sso_trabajadores(id) on delete cascade,
  tipo_id uuid not null references public.sso_tipos_examen(id),
  fecha date not null,
  vencimiento date,                               -- por defecto: fecha + vigencia del tipo
  resultado text not null check (resultado in ('apto', 'apto_con_restricciones', 'no_apto')),
  observaciones text,
  archivo_path text,                              -- objeto en el bucket 'sso-salud'
  archivo_nombre text,
  registrado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (vencimiento is null or vencimiento >= fecha)
);
create index if not exists sso_examenes_trabajador_idx on public.sso_examenes (trabajador_id, tipo_id, fecha desc);

create or replace function public.sso_examen_antes()
returns trigger language plpgsql set search_path = public as $$
declare v_meses int;
begin
  if new.vencimiento is null then
    select vigencia_meses into v_meses from sso_tipos_examen where id = new.tipo_id;
    if v_meses is not null then new.vencimiento := new.fecha + make_interval(months => v_meses); end if;
  end if;
  return new;
end $$;
drop trigger if exists sso_examen_antes on public.sso_examenes;
create trigger sso_examen_antes before insert or update of fecha, tipo_id, vencimiento on public.sso_examenes
  for each row execute function public.sso_examen_antes();

-- Ultimo examen de cada tipo por trabajador, con su situacion (lo que importa para la vigencia).
create or replace view public.sso_examenes_vigentes with (security_invoker = true) as
select distinct on (e.trabajador_id, e.tipo_id)
  e.*,
  case
    when e.vencimiento is null then 'vigente'
    when e.vencimiento < public.sso_hoy() then 'vencido'
    when e.vencimiento <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion
from public.sso_examenes e
order by e.trabajador_id, e.tipo_id, e.fecha desc, e.created_at desc;

-- Ficha con el resumen de examenes. Los conteos de examenes salen en 0 para quien no tiene
-- 'aprobar': la vista es security_invoker y la RLS de sso_examenes no le deja ver filas.
create or replace view public.sso_trabajadores_v with (security_invoker = true) as
select t.*,
  em.nombre as empresa,
  em.propia as empresa_propia,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.situacion = 'vencido') as examenes_vencidos,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.situacion = 'por_vencer') as examenes_por_vencer,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.resultado <> 'apto') as examenes_con_restriccion
from public.sso_trabajadores t
join public.sso_empresas em on em.id = t.empresa_id;

-- ---------------------------------------------------------------- RLS

alter table public.sso_empresas      enable row level security;
alter table public.sso_tipos_examen  enable row level security;
alter table public.sso_trabajadores  enable row level security;
alter table public.sso_examenes      enable row level security;

drop policy if exists sso_empresas_select on public.sso_empresas;
create policy sso_empresas_select on public.sso_empresas for select to authenticated using (sso_tiene_acceso());
drop policy if exists sso_empresas_write on public.sso_empresas;
create policy sso_empresas_write on public.sso_empresas for all to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));

drop policy if exists sso_tipos_examen_select on public.sso_tipos_examen;
create policy sso_tipos_examen_select on public.sso_tipos_examen for select to authenticated using (sso_tiene_acceso());
drop policy if exists sso_tipos_examen_write on public.sso_tipos_examen;
create policy sso_tipos_examen_write on public.sso_tipos_examen for all to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));

-- Los trabajadores los ven todos los del portal: los modulos de las fases 3 a 6 los eligen en sus
-- formularios (asistentes, entregas de EPP, afectados). Escribir exige el modulo Trabajadores.
drop policy if exists sso_trabajadores_select on public.sso_trabajadores;
create policy sso_trabajadores_select on public.sso_trabajadores for select to authenticated using (sso_tiene_acceso());
drop policy if exists sso_trabajadores_insert on public.sso_trabajadores;
create policy sso_trabajadores_insert on public.sso_trabajadores for insert to authenticated
  with check (sso_puede_modulo('trabajadores', 'crear'));
drop policy if exists sso_trabajadores_update on public.sso_trabajadores;
create policy sso_trabajadores_update on public.sso_trabajadores for update to authenticated
  using (sso_puede_modulo('trabajadores', 'editar') or sso_puede_modulo('trabajadores', 'crear'))
  with check (sso_puede_modulo('trabajadores', 'editar') or sso_puede_modulo('trabajadores', 'crear'));
drop policy if exists sso_trabajadores_delete on public.sso_trabajadores;
create policy sso_trabajadores_delete on public.sso_trabajadores for delete to authenticated
  using (sso_puede_modulo('trabajadores', 'eliminar'));

drop policy if exists sso_examenes_rw on public.sso_examenes;
create policy sso_examenes_rw on public.sso_examenes for all to authenticated
  using (sso_puede_modulo('trabajadores', 'aprobar')) with check (sso_puede_modulo('trabajadores', 'aprobar'));

revoke all on public.sso_empresas, public.sso_tipos_examen, public.sso_trabajadores, public.sso_examenes,
              public.sso_trabajadores_v, public.sso_examenes_vigentes from anon;
revoke truncate on public.sso_empresas, public.sso_tipos_examen, public.sso_trabajadores, public.sso_examenes from authenticated;
revoke insert, update, delete, truncate on public.sso_trabajadores_v, public.sso_examenes_vigentes from authenticated;
revoke execute on function public.sso_trabajador_antes(), public.sso_examen_antes() from public, anon, authenticated;

-- ---------------------------------------------------------------- Storage: bucket aparte para salud

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sso-salud', 'sso-salud', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: examenes/<trabajador_id>/<timestamp>-<nombre>
drop policy if exists sso_salud_select on storage.objects;
create policy sso_salud_select on storage.objects for select to authenticated
  using (bucket_id = 'sso-salud' and public.sso_puede_modulo('trabajadores', 'aprobar'));
drop policy if exists sso_salud_insert on storage.objects;
create policy sso_salud_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso-salud' and (storage.foldername(name))[1] = 'examenes'
              and public.sso_puede_modulo('trabajadores', 'aprobar'));
drop policy if exists sso_salud_delete on storage.objects;
create policy sso_salud_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso-salud' and public.sso_puede_modulo('trabajadores', 'aprobar'));

notify pgrst, 'reload schema';

commit;

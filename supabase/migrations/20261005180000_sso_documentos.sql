-- Portal de Prevencion, fase 7 (PLAN_SSO_PORTAL.md): Documentos (listado maestro).
--
-- Cada documento (procedimiento, matriz IPER, reglamento, HDS, plan de emergencia...) tiene codigo,
-- responsable y periodicidad de revision; sus versiones guardan archivo, emision, vigencia, cambios y
-- quien aprobo. La version vigente es la de emision mas reciente; el historial se conserva.
--
-- Permisos (modulo 'documentos'): ver (consultar y descargar), crear (crear documentos y subir
-- versiones), editar (editar fichas y versiones), eliminar, exportar.
-- Storage: bucket 'sso', carpeta documentos/<documento_id>/... (acepta PDF, Word, Excel e imagenes).
--
-- Re-ejecutable. Va despues de 20261005170000_sso_accidentes.sql.
set client_encoding = 'UTF8';

begin;

create table if not exists public.sso_documentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  tipo text not null check (tipo in ('procedimiento', 'instructivo', 'matriz_iper', 'reglamento', 'hds', 'plan_emergencia', 'programa', 'registro', 'otro')),
  area_id uuid references public.sso_areas(id) on delete set null,     -- null: toda la empresa
  responsable_user_id uuid references auth.users(id) on delete set null,
  revision_meses int check (revision_meses is null or revision_meses > 0),   -- null: sin vencimiento
  descripcion text,
  activo boolean not null default true,
  creado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sso_documento_versiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.sso_documentos(id) on delete cascade,
  version text not null,
  fecha_emision date not null,
  vigente_hasta date,                             -- por defecto: emision + revision_meses del documento
  archivo_path text not null,                     -- bucket 'sso', carpeta documentos/
  archivo_nombre text not null,
  cambios text,
  aprobado_por text,                              -- nombre y cargo de quien aprobo (puede no tener cuenta)
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (documento_id, version),
  check (vigente_hasta is null or vigente_hasta >= fecha_emision)
);
create index if not exists sso_doc_versiones_idx on public.sso_documento_versiones (documento_id, fecha_emision desc);

create or replace function public.sso_documento_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.codigo := upper(btrim(new.codigo));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sso_documento_antes on public.sso_documentos;
create trigger sso_documento_antes before insert or update on public.sso_documentos
  for each row execute function public.sso_documento_antes();

create or replace function public.sso_documento_version_antes()
returns trigger language plpgsql set search_path = public as $$
declare v_meses int;
begin
  if new.fecha_emision > sso_hoy() then
    raise exception 'La fecha de emisión no puede ser futura' using errcode = '22023';
  end if;
  if new.vigente_hasta is null then
    select revision_meses into v_meses from sso_documentos where id = new.documento_id;
    if v_meses is not null then new.vigente_hasta := (new.fecha_emision + make_interval(months => v_meses))::date; end if;
  end if;
  return new;
end $$;
drop trigger if exists sso_documento_version_antes on public.sso_documento_versiones;
create trigger sso_documento_version_antes before insert or update on public.sso_documento_versiones
  for each row execute function public.sso_documento_version_antes();

-- Listado maestro: el documento con su version vigente y su situacion
create or replace view public.sso_documentos_v with (security_invoker = true) as
select d.*,
  v.id as version_id, v.version, v.fecha_emision, v.vigente_hasta, v.archivo_path, v.archivo_nombre,
  (select count(*) from public.sso_documento_versiones x where x.documento_id = d.id) as versiones,
  case
    when v.id is null then 'sin_version'
    when v.vigente_hasta is null then 'vigente'
    when v.vigente_hasta < public.sso_hoy() then 'vencido'
    when v.vigente_hasta <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion
from public.sso_documentos d
left join lateral (
  select * from public.sso_documento_versiones x where x.documento_id = d.id
  order by x.fecha_emision desc, x.created_at desc limit 1
) v on true;

-- ---------------------------------------------------------------- RLS

alter table public.sso_documentos          enable row level security;
alter table public.sso_documento_versiones enable row level security;

drop policy if exists sso_doc_select on public.sso_documentos;
create policy sso_doc_select on public.sso_documentos for select to authenticated using (sso_puede_modulo('documentos', 'ver'));
drop policy if exists sso_doc_insert on public.sso_documentos;
create policy sso_doc_insert on public.sso_documentos for insert to authenticated with check (sso_puede_modulo('documentos', 'crear'));
drop policy if exists sso_doc_update on public.sso_documentos;
create policy sso_doc_update on public.sso_documentos for update to authenticated
  using (sso_puede_modulo('documentos', 'editar') or (creado_por = (select auth.uid()) and sso_puede_modulo('documentos', 'crear')))
  with check (sso_puede_modulo('documentos', 'editar') or (creado_por = (select auth.uid()) and sso_puede_modulo('documentos', 'crear')));
drop policy if exists sso_doc_delete on public.sso_documentos;
create policy sso_doc_delete on public.sso_documentos for delete to authenticated using (sso_puede_modulo('documentos', 'eliminar'));

-- versiones: subir es 'crear' (cualquier documento: el responsable sube la revision); corregir o borrar, 'editar'/'eliminar'
drop policy if exists sso_docv_select on public.sso_documento_versiones;
create policy sso_docv_select on public.sso_documento_versiones for select to authenticated using (sso_puede_modulo('documentos', 'ver'));
drop policy if exists sso_docv_insert on public.sso_documento_versiones;
create policy sso_docv_insert on public.sso_documento_versiones for insert to authenticated with check (sso_puede_modulo('documentos', 'crear'));
drop policy if exists sso_docv_update on public.sso_documento_versiones;
create policy sso_docv_update on public.sso_documento_versiones for update to authenticated
  using (sso_puede_modulo('documentos', 'editar')) with check (sso_puede_modulo('documentos', 'editar'));
drop policy if exists sso_docv_delete on public.sso_documento_versiones;
create policy sso_docv_delete on public.sso_documento_versiones for delete to authenticated
  using (sso_puede_modulo('documentos', 'eliminar') or sso_puede_modulo('documentos', 'editar'));

revoke all on public.sso_documentos, public.sso_documento_versiones, public.sso_documentos_v from anon;
revoke truncate on public.sso_documentos, public.sso_documento_versiones from authenticated;
revoke insert, update, delete, truncate on public.sso_documentos_v from authenticated;
revoke execute on function public.sso_documento_antes(), public.sso_documento_version_antes() from public, anon, authenticated;

-- ---------------------------------------------------------------- Storage: carpeta documentos/

create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp', 'inspecciones', 'documentos') then split_part(p_name, '/', 1)
    when split_part(p_name, '/', 1) = 'eventos' then 'accidentes'
  end
$$;

drop policy if exists sso_objects_doc_insert on storage.objects;
create policy sso_objects_doc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'documentos'
              and exists (select 1 from public.sso_documentos d where d.id::text = (storage.foldername(name))[2])
              and public.sso_puede_modulo('documentos', 'crear'));
drop policy if exists sso_objects_doc_delete on storage.objects;
create policy sso_objects_doc_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'documentos'
         and (public.sso_puede_modulo('documentos', 'editar') or public.sso_puede_modulo('documentos', 'eliminar')));

-- documentos de oficina y PDFs pesados (planes de emergencia escaneados)
update storage.buckets set
  file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'sso';

notify pgrst, 'reload schema';

commit;

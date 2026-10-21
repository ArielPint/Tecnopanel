-- Portal Ingreso de Personal: contratistas.
--
-- 1) Empresas contratistas (ing_empresas). Un ingreso de tipo contratista indica su empresa.
-- 2) Documentos del trabajador contratista al ingresar: cédula, contrato con su empleador y
--    recepción del reglamento interno (más la licencia si conduce). No se le piden AFP, salud ni
--    antecedentes, y no lleva la tarea de contrato de RRHH (su contrato es con la contratista).
-- 3) Control mensual por empresa (ing_empresa_docs): cada mes la contratista envía certificado de
--    adhesión al organismo administrador, listado de trabajadores, contratos, recepción del
--    reglamento interno y F30. Los carga RRHH, Prevención o el coordinador; el plazo del mes
--    (día límite) lo marca el front.
--
-- Archivos de las empresas en el bucket 'ingreso-personal': empresas/<empresa_id>/<YYYY-MM>/<archivo>
--
-- Va después de 20261101120000_ingreso_personal_irl.sql. Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- empresas

create table if not exists public.ing_empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  rut text,                                   -- normalizado: 76123456-7
  contacto text,                              -- persona y teléfono o correo de quien envía los documentos
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ing_empresas_nombre_uq on public.ing_empresas (lower(btrim(nombre)));

create or replace function public.ing_empresa_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  new.contacto := nullif(btrim(coalesce(new.contacto, '')), '');
  new.rut := nullif(btrim(coalesce(new.rut, '')), '');
  if new.rut is not null then
    new.rut := coalesce(ing_rut_normalizar(new.rut), new.rut);
    if not ing_rut_valido(new.rut) then
      raise exception 'El RUT % no es válido', new.rut using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ing_empresa_antes on public.ing_empresas;
create trigger ing_empresa_antes before insert or update on public.ing_empresas
  for each row execute function public.ing_empresa_antes();

alter table public.ing_ingresos add column if not exists empresa_id uuid references public.ing_empresas(id);
create index if not exists ing_ingresos_empresa_idx on public.ing_ingresos (empresa_id);

-- ---------------------------------------------------------------- documentos mensuales

create table if not exists public.ing_empresa_docs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.ing_empresas(id) on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),     -- primer día del mes
  tipo text not null check (tipo in ('adhesion', 'listado', 'contratos', 'reglamento', 'f30')),
  path text not null unique,
  nombre text not null,
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ing_empresa_docs_idx on public.ing_empresa_docs (empresa_id, periodo);

create or replace function public.ing_empresa_doc_tipos()
returns text[] language sql immutable as $$
  select array['adhesion', 'listado', 'contratos', 'reglamento', 'f30']
$$;

-- Documentos del mes que le faltan a la empresa
create or replace function public.ing_empresa_faltan(p_empresa_id uuid, p_periodo date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from unnest(ing_empresa_doc_tipos()) t(tipo)
  where not exists (select 1 from ing_empresa_docs d
                    where d.empresa_id = p_empresa_id and d.periodo = p_periodo and d.tipo = t.tipo)
$$;

-- Quién lleva el control de contratistas: RRHH, Prevención y coordinadores
create or replace function public.ing_gestiona_contratistas()
returns boolean language sql stable security definer set search_path = public as $$
  select ing_tiene('rrhh') or ing_tiene('prevencion') or ing_tiene('coordinador')
$$;

create or replace function public.ing_empresa_activa(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ing_empresas e where e.id = p_empresa_id and e.activa)
$$;

-- ---------------------------------------------------------------- documentos del trabajador

alter table public.ing_archivos drop constraint if exists ing_archivos_tipo_doc_check;
alter table public.ing_archivos add constraint ing_archivos_tipo_doc_check
  check (tipo_doc in ('cedula', 'antecedentes', 'afp', 'salud', 'estudios', 'residencia', 'licencia',
                      'contrato_empleador', 'reglamento', 'otro'));

create or replace function public.ing_docs_req(p_tipo_trabajador text, p_vehiculo boolean)
returns text[] language sql immutable as $$
  select case when p_tipo_trabajador = 'contratista'
              then array['cedula', 'contrato_empleador', 'reglamento']
              else array['cedula', 'antecedentes', 'afp', 'salud'] end
    || case when p_vehiculo then array['licencia'] else '{}'::text[] end
$$;

create or replace function public.ing_doc_label(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo
    when 'cedula' then 'Cédula de identidad'
    when 'antecedentes' then 'Certificado de antecedentes'
    when 'afp' then 'Certificado de afiliación AFP'
    when 'salud' then 'Certificado Fonasa o Isapre'
    when 'estudios' then 'Certificado de estudios o título'
    when 'residencia' then 'Certificado de residencia'
    when 'licencia' then 'Licencia de conducir y hoja de vida del conductor'
    when 'contrato_empleador' then 'Contrato de trabajo con la empresa contratista'
    when 'reglamento' then 'Recepción del reglamento interno'
    else 'Otro documento' end
$$;

create or replace function public.ing_completo(p_ingreso_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from ing_tareas t where t.ingreso_id = i.id and not t.hecha)
     and not exists (
       select 1 from unnest(ing_docs_req(i.tipo_trabajador, i.req_vehiculo)) d(tipo)
       where not exists (select 1 from ing_archivos a where a.ingreso_id = i.id and a.tipo_doc = d.tipo))
  from ing_ingresos i where i.id = p_ingreso_id
$$;

-- El contrato de RRHH, solo para planta (el contratista tiene contrato con su empleador)
create or replace function public.ing_tipos_ingreso(p_ingreso_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array['induccion']
    || case when i.tipo_trabajador = 'planta' then array['contrato', 'bienvenida'] else '{}'::text[] end
    || case when i.req_ti then array['ti'] else '{}'::text[] end
    || case when i.req_epp then array['epp'] else '{}'::text[] end
    || case when i.req_uniforme then array['uniforme'] else '{}'::text[] end
    || case when i.req_vehiculo then array['vehiculo'] else '{}'::text[] end
  from ing_ingresos i where i.id = p_ingreso_id
$$;

create or replace function public.ing_resumen_html(p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select '<b>' || ing_html(i.nombre) || '</b> · ' || ing_html(i.cargo)
    || case when i.tipo_trabajador = 'contratista'
            then ' (contratista' || coalesce(' de ' || ing_html(e.nombre), '') || ')' else '' end || '<br>'
    || 'Sucursal ' || ing_html(i.sucursal) || ' · ingresa el ' || to_char(i.fecha_ingreso, 'DD-MM-YYYY')
    || coalesce(' · ' || ing_html(i.jornada) || coalesce(' (' || ing_html(i.horario) || ')', ''), '') || '<br>'
    || coalesce('Motivo: ' || ing_motivo_label(i.motivo) || coalesce(' de ' || ing_html(i.reemplaza_a), '') || '<br>', '')
    || coalesce('Jefatura directa: ' || ing_html(i.jefatura_directa) || '<br>', '')
    || 'Pedido por ' || ing_html(coalesce(ing_nombre(i.creado_por), '')) || ' (' || ing_html(i.area) || ')'
  from ing_ingresos i left join ing_empresas e on e.id = i.empresa_id
  where i.id = p_ingreso_id
$$;

-- BEFORE, SECURITY INVOKER: planta no lleva empresa; contratista la exige al crearlo o al cambiarla
create or replace function public.ing_ingreso_empresa()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo_trabajador <> 'contratista' then
    new.empresa_id := null;
    return new;
  end if;
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id or old.tipo_trabajador <> 'contratista') then
    if new.empresa_id is null then
      raise exception 'Indica la empresa contratista' using errcode = '22023';
    end if;
    if not ing_empresa_activa(new.empresa_id) then
      raise exception 'La empresa contratista no existe o está inactiva' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ing_ingreso_empresa on public.ing_ingresos;
create trigger ing_ingreso_empresa before insert or update on public.ing_ingresos
  for each row execute function public.ing_ingreso_empresa();

-- Los contratistas abiertos pierden la tarea de contrato (si no tiene avance)
do $$ begin perform public.ing_sincronizar_tareas(id) from public.ing_ingresos where estado = 'en_proceso'; end $$;

-- ---------------------------------------------------------------- storage (agrega la carpeta empresas/)

create or replace function public.ing_ve_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) = 'empresas' then ing_gestiona_contratistas()
    else case split_part(p_name, '/', 2)
      when 'docs' then ing_ve_archivo(ing_uuid(split_part(p_name, '/', 1)), null)
      when 'tareas' then coalesce(ing_uuid(split_part(p_name, '/', 3)) is not null
                                  and ing_ve_archivo(ing_uuid(split_part(p_name, '/', 1)), ing_uuid(split_part(p_name, '/', 3))), false)
      else false end
  end
$$;

create or replace function public.ing_puede_subir_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) = 'empresas' then
      ing_gestiona_contratistas() and coalesce(ing_empresa_activa(ing_uuid(split_part(p_name, '/', 2))), false)
    else case split_part(p_name, '/', 2)
      when 'docs' then coalesce(ing_gestiona_docs(ing_uuid(split_part(p_name, '/', 1))), false)
      when 'tareas' then coalesce(ing_puede_subir_evidencia(ing_uuid(split_part(p_name, '/', 1)), ing_uuid(split_part(p_name, '/', 3))), false)
      else false end
  end
$$;

create or replace function public.ing_puede_borrar_objeto(p_name text, p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) = 'empresas' then
      ing_gestiona_contratistas() and (ing_tiene('rrhh') or p_owner = auth.uid()::text)
    else exists (
      select 1 from ing_ingresos i
      where i.id = ing_uuid(split_part(p_name, '/', 1)) and i.estado = 'en_proceso'
        and (ing_tiene('rrhh') or p_owner = auth.uid()::text))
  end
$$;

-- ---------------------------------------------------------------- vista

drop view if exists public.ing_ingresos_v;
create view public.ing_ingresos_v as
select i.*,
  ing_nombre(i.creado_por) as creado_por_nombre,
  ing_nombre(i.cerrado_por) as cerrado_por_nombre,
  e.nombre as empresa_nombre,
  case when i.empresa_id is not null
       then ing_empresa_faltan(i.empresa_id, date_trunc('month', ing_hoy())::date) end as empresa_docs_faltan,
  coalesce(t.total, 0)::int as tareas_total,
  coalesce(t.hechas, 0)::int as tareas_hechas,
  coalesce(t.mias, 0)::int as tareas_mias,
  cardinality(ing_docs_req(i.tipo_trabajador, i.req_vehiculo)) as docs_requeridos,
  (select count(distinct a.tipo_doc)::int from ing_archivos a
   where a.ingreso_id = i.id and a.tipo_doc = any (ing_docs_req(i.tipo_trabajador, i.req_vehiculo))) as docs_ok,
  case when i.estado = 'en_proceso' and ing_completo(i.id) then 'listo' else i.estado end as situacion
from ing_ingresos i
left join ing_empresas e on e.id = i.empresa_id
left join lateral (
  select count(*) as total,
         count(*) filter (where x.hecha) as hechas,
         count(*) filter (where not x.hecha and ing_puede_tarea(x.id)) as mias
  from ing_tareas x where x.ingreso_id = i.id
) t on true
where ing_ve(i.id);

revoke all on public.ing_ingresos_v from anon;
revoke insert, update, delete, truncate on public.ing_ingresos_v from authenticated;
grant select on public.ing_ingresos_v to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.ing_empresas enable row level security;
alter table public.ing_empresa_docs enable row level security;

-- Las empresas las ve cualquiera con acceso (el solicitante elige la empresa); las administran RRHH y Prevención
drop policy if exists ing_empresas_select on public.ing_empresas;
create policy ing_empresas_select on public.ing_empresas for select to authenticated
  using (ing_tiene_acceso());
drop policy if exists ing_empresas_insert on public.ing_empresas;
create policy ing_empresas_insert on public.ing_empresas for insert to authenticated
  with check (ing_tiene('rrhh') or ing_tiene('prevencion'));
drop policy if exists ing_empresas_update on public.ing_empresas;
create policy ing_empresas_update on public.ing_empresas for update to authenticated
  using (ing_tiene('rrhh') or ing_tiene('prevencion')) with check (ing_tiene('rrhh') or ing_tiene('prevencion'));
drop policy if exists ing_empresas_delete on public.ing_empresas;
create policy ing_empresas_delete on public.ing_empresas for delete to authenticated
  using (ing_tiene('rrhh') or ing_tiene('prevencion'));

drop policy if exists ing_empresa_docs_select on public.ing_empresa_docs;
create policy ing_empresa_docs_select on public.ing_empresa_docs for select to authenticated
  using (ing_gestiona_contratistas());
drop policy if exists ing_empresa_docs_insert on public.ing_empresa_docs;
create policy ing_empresa_docs_insert on public.ing_empresa_docs for insert to authenticated
  with check (
    subido_por = (select auth.uid()) and ing_gestiona_contratistas() and ing_empresa_activa(empresa_id)
    and path like 'empresas/' || empresa_id::text || '/' || to_char(periodo, 'YYYY-MM') || '/%');
drop policy if exists ing_empresa_docs_delete on public.ing_empresa_docs;
create policy ing_empresa_docs_delete on public.ing_empresa_docs for delete to authenticated
  using (ing_gestiona_contratistas() and (ing_tiene('rrhh') or subido_por = (select auth.uid())));

revoke all on public.ing_empresas, public.ing_empresa_docs from anon;
revoke truncate on public.ing_empresas from authenticated;
revoke update, truncate on public.ing_empresa_docs from authenticated;

-- ---------------------------------------------------------------- privilegios de las funciones

revoke execute on function
  public.ing_empresa_antes(), public.ing_ingreso_empresa(), public.ing_empresa_doc_tipos(),
  public.ing_empresa_faltan(uuid, date), public.ing_gestiona_contratistas(), public.ing_empresa_activa(uuid),
  public.ing_docs_req(text, boolean)
  from public, anon;
-- las usan las políticas, la vista y los triggers que corren como el usuario (las funciones de una
-- vista se ejecutan con los permisos de quien consulta)
grant execute on function
  public.ing_gestiona_contratistas(), public.ing_empresa_activa(uuid), public.ing_docs_req(text, boolean),
  public.ing_empresa_faltan(uuid, date), public.ing_empresa_doc_tipos(),
  public.ing_rut_normalizar(text), public.ing_rut_valido(text)
  to authenticated;
revoke execute on function public.ing_tipos_ingreso(uuid), public.ing_resumen_html(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

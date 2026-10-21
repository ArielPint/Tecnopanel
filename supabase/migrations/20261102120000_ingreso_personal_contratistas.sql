-- Portal Ingreso de Personal: contratistas, sin duplicar datos.
--
-- Empresas: la lista única es la de Estados de Pago (public.subcontratistas, tabla de prod). Ahí
-- ya están las cuentas de cada empresa (subcontratista_usuarios / subcontratista_actual()).
-- Prevención tiene su catálogo sso_empresas: cada contratista queda enlazado a una fila de ahí
-- (sso_empresas.subcontratista_id), que se crea y renombra sola desde subcontratistas.
-- Trabajadores: los de Prevención (sso_trabajadores). Cada empresa contratista mantiene los suyos
-- desde el portal /contratistas (mismo formulario y misma plantilla Excel) y solo ve los suyos.
--
-- 1) Un ingreso de tipo contratista indica su empresa (ing_ingresos.empresa_id -> subcontratistas).
-- 2) Documentos del trabajador contratista: cédula, contrato con su empleador y recepción del
--    reglamento interno (más la licencia si conduce). Sin AFP, salud, antecedentes ni la tarea de
--    contrato de RRHH (su contrato es con la contratista).
-- 3) Control mensual por empresa:
--      ing_empresa_docs   adhesión al organismo administrador, contratos, recepción del reglamento
--                         interno y F30 (archivos que sube la empresa, o RRHH/Prevención/coordinador)
--      ing_listados       el listado de trabajadores del mes: la empresa lo confirma y queda la foto
--                         de sus trabajadores activos en Prevención (no se sube archivo)
--    El plazo del mes (día límite) lo marca el front.
--
-- Cada empresa ve solo lo suyo: su fila, sus documentos, su listado y sus trabajadores.
-- Archivos de las empresas en el bucket 'ingreso-personal': empresas/<subcontratista_id>/<YYYY-MM>/<archivo>
--
-- Versión anterior de este archivo: catálogo propio ing_empresas. Si existe, sus filas pasan a
-- subcontratistas (por RUT o nombre; las que no están, se crean) y la tabla se elimina.
--
-- Depende de subcontratistas y de 20261008120000_subcontratista_varios_usuarios.sql (las aplica el 10
-- antes que el 21) y de las migraciones sso_* (Prevención).
-- Va después de 20261101120000_ingreso_personal_irl.sql. Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- tablas

alter table public.ing_ingresos add column if not exists empresa_id uuid;
create index if not exists ing_ingresos_empresa_idx on public.ing_ingresos (empresa_id);

create table if not exists public.ing_empresa_docs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,                                         -- subcontratistas.id
  periodo date not null check (extract(day from periodo) = 1),     -- primer día del mes
  tipo text not null,
  path text not null unique,
  nombre text not null,
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ing_empresa_docs_idx on public.ing_empresa_docs (empresa_id, periodo);
-- 'listado' quedó de la versión anterior (se subía como archivo); ya no se pide
alter table public.ing_empresa_docs drop constraint if exists ing_empresa_docs_tipo_check;
alter table public.ing_empresa_docs add constraint ing_empresa_docs_tipo_check
  check (tipo in ('adhesion', 'contratos', 'reglamento', 'f30', 'listado'));

create table if not exists public.ing_listados (
  empresa_id uuid not null,                                         -- subcontratistas.id
  periodo date not null check (extract(day from periodo) = 1),
  total int not null,
  trabajadores jsonb not null,                                      -- [{rut, nombre, cargo, sucursal}]
  confirmado_por uuid references auth.users(id),
  confirmado_at timestamptz not null default now(),
  primary key (empresa_id, periodo)
);

alter table public.sso_empresas add column if not exists subcontratista_id uuid;
create unique index if not exists sso_empresas_subcontratista_uq on public.sso_empresas (subcontratista_id);

-- ---------------------------------------------------------------- desde la versión con ing_empresas

do $$
declare
  r record;
  v_id uuid;
begin
  if to_regclass('public.ing_empresas') is null then return; end if;
  alter table public.ing_ingresos drop constraint if exists ing_ingresos_empresa_id_fkey;
  alter table public.ing_empresa_docs drop constraint if exists ing_empresa_docs_empresa_id_fkey;
  for r in execute 'select id, nombre, rut, activa from public.ing_empresas' loop
    select s.id into v_id from public.subcontratistas s
    where (r.rut is not null and public.ing_rut_normalizar(s.rut) = public.ing_rut_normalizar(r.rut))
       or lower(btrim(s.nombre)) = lower(btrim(r.nombre))
    order by (r.rut is not null and public.ing_rut_normalizar(s.rut) = public.ing_rut_normalizar(r.rut)) desc
    limit 1;
    if v_id is null then
      insert into public.subcontratistas (nombre, rut, activo) values (r.nombre, r.rut, r.activa) returning id into v_id;
    end if;
    update public.ing_ingresos set empresa_id = v_id where empresa_id = r.id;
    update public.ing_empresa_docs set empresa_id = v_id where empresa_id = r.id;
  end loop;
  drop table public.ing_empresas cascade;
  drop function if exists public.ing_empresa_antes();
end $$;

-- llaves hacia subcontratistas (re-ejecutable: se agregan si no están)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ing_ingresos_empresa_fk') then
    alter table public.ing_ingresos add constraint ing_ingresos_empresa_fk
      foreign key (empresa_id) references public.subcontratistas(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ing_empresa_docs_empresa_fk') then
    alter table public.ing_empresa_docs add constraint ing_empresa_docs_empresa_fk
      foreign key (empresa_id) references public.subcontratistas(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ing_listados_empresa_fk') then
    alter table public.ing_listados add constraint ing_listados_empresa_fk
      foreign key (empresa_id) references public.subcontratistas(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sso_empresas_subcontratista_fk') then
    alter table public.sso_empresas add constraint sso_empresas_subcontratista_fk
      foreign key (subcontratista_id) references public.subcontratistas(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------- enlace con Prevención

-- Fila de sso_empresas de un contratista: la enlazada; si no hay, una contratista con el mismo RUT
-- o nombre sin enlazar; si tampoco, se crea. Mantiene nombre, RUT y estado al día.
create or replace function public.ing_sso_empresa_de(p_subcontratista_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s subcontratistas%rowtype;
  v_id uuid;
  v_nombre text;
begin
  select * into s from subcontratistas where id = p_subcontratista_id;
  if not found then return null; end if;
  select id into v_id from sso_empresas where subcontratista_id = s.id;
  if v_id is null then
    select id into v_id from sso_empresas e
    where e.subcontratista_id is null and not e.propia
      and ((s.rut is not null and sso_rut_normalizar(e.rut) = sso_rut_normalizar(s.rut)) or lower(btrim(e.nombre)) = lower(btrim(s.nombre)))
    order by (s.rut is not null and sso_rut_normalizar(e.rut) = sso_rut_normalizar(s.rut)) desc
    limit 1;
    if v_id is not null then
      update sso_empresas set subcontratista_id = s.id where id = v_id;
    end if;
  end if;
  -- el nombre es único en sso_empresas: si lo usa otra, se le agrega el RUT
  v_nombre := btrim(s.nombre);
  if exists (select 1 from sso_empresas where lower(nombre) = lower(v_nombre) and id is distinct from v_id) then
    v_nombre := v_nombre || ' (' || coalesce(s.rut, left(s.id::text, 8)) || ')';
  end if;
  if v_id is null then
    insert into sso_empresas (nombre, rut, propia, activa, subcontratista_id)
    values (v_nombre, sso_rut_normalizar(s.rut), false, coalesce(s.activo, true), s.id)
    returning id into v_id;
  else
    update sso_empresas
    set nombre = v_nombre, rut = coalesce(sso_rut_normalizar(s.rut), rut), activa = coalesce(s.activo, true)
    where id = v_id and (nombre, rut, activa) is distinct from (v_nombre, coalesce(sso_rut_normalizar(s.rut), rut), coalesce(s.activo, true));
  end if;
  return v_id;
end $$;

create or replace function public.ing_subcontratista_despues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ing_sso_empresa_de(new.id);
  return new;
end $$;
drop trigger if exists ing_subcontratista_despues on public.subcontratistas;
create trigger ing_subcontratista_despues after insert or update of nombre, rut, activo on public.subcontratistas
  for each row execute function public.ing_subcontratista_despues();

do $$ begin perform public.ing_sso_empresa_de(id) from public.subcontratistas; end $$;

-- ---------------------------------------------------------------- quién ve qué

-- La empresa de quien está conectado si es usuario de un contratista (null si no)
create or replace function public.ing_mi_empresa()
returns uuid language sql stable security definer set search_path = public as $$
  select subcontratista_actual()
$$;

-- Quién lleva el control de contratistas: RRHH, Prevención y coordinadores
create or replace function public.ing_gestiona_contratistas()
returns boolean language sql stable security definer set search_path = public as $$
  select ing_tiene('rrhh') or ing_tiene('prevencion') or ing_tiene('coordinador')
$$;

-- El control de contratistas, o la propia empresa
create or replace function public.ing_ve_empresa(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_empresa_id is not null and (ing_gestiona_contratistas() or p_empresa_id = ing_mi_empresa())
$$;

create or replace function public.ing_empresa_activa(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subcontratistas s where s.id = p_empresa_id and coalesce(s.activo, true))
$$;

-- La fila de Prevención de la empresa de quien está conectado (para la RLS de sus trabajadores)
create or replace function public.ing_mi_sso_empresa()
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from sso_empresas e where e.subcontratista_id = subcontratista_actual()
$$;

create or replace function public.ing_empresa_doc_tipos()
returns text[] language sql immutable as $$
  select array['adhesion', 'contratos', 'reglamento', 'f30']
$$;

-- Lo que le falta a la empresa en el mes: documentos y la confirmación del listado
create or replace function public.ing_empresa_faltan(p_empresa_id uuid, p_periodo date)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*)::int from unnest(ing_empresa_doc_tipos()) t(tipo)
          where not exists (select 1 from ing_empresa_docs d
                            where d.empresa_id = p_empresa_id and d.periodo = p_periodo and d.tipo = t.tipo))
       + case when exists (select 1 from ing_listados l where l.empresa_id = p_empresa_id and l.periodo = p_periodo) then 0 else 1 end
$$;

-- Empresas para el portal: solo nombre, RUT y estado. Sin security_invoker a propósito (la RLS de
-- subcontratistas es de Estados de Pago): el filtro lo hace esta vista. El control de contratistas y
-- quien pide ingresos las ven todas; la empresa, solo la suya.
drop view if exists public.ing_empresas_v;
create view public.ing_empresas_v as
select s.id, s.nombre, s.rut, s.email, s.telefono, coalesce(s.activo, true) as activa
from subcontratistas s
where ing_tiene_acceso() or s.id = ing_mi_empresa();

-- RRHH y Prevención agregan o corrigen empresas sin entrar a Estados de Pago
create or replace function public.ing_guardar_empresa(p_id uuid, p_nombre text, p_rut text, p_email text, p_telefono text, p_activa boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rut text := nullif(btrim(coalesce(p_rut, '')), '');
  v_id uuid;
begin
  if not (ing_tiene('rrhh') or ing_tiene('prevencion')) then
    raise exception 'Solo RRHH o Prevención pueden registrar empresas contratistas' using errcode = '42501';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'Indica el nombre de la empresa' using errcode = '22023'; end if;
  if v_rut is not null then
    if not ing_rut_valido(v_rut) then raise exception 'El RUT % no es válido', v_rut using errcode = '22023'; end if;
    v_rut := ing_rut_normalizar(v_rut);
  end if;
  if exists (select 1 from subcontratistas s where s.id is distinct from p_id
             and (lower(btrim(s.nombre)) = lower(btrim(p_nombre)) or (v_rut is not null and ing_rut_normalizar(s.rut) = v_rut))) then
    raise exception 'Ya existe una empresa con ese nombre o RUT' using errcode = '23505';
  end if;
  if p_id is null then
    insert into subcontratistas (nombre, rut, email, telefono, activo)
    values (btrim(p_nombre), v_rut, nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''), coalesce(p_activa, true))
    returning id into v_id;
  else
    update subcontratistas set nombre = btrim(p_nombre), rut = v_rut,
      email = nullif(btrim(coalesce(p_email, '')), ''), telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
      activo = coalesce(p_activa, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Empresa no encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- La empresa confirma su listado del mes: queda la foto de sus trabajadores activos en Prevención.
-- RRHH y Prevención también pueden confirmarlo por ella (p_empresa_id).
create or replace function public.ing_confirmar_listado(p_periodo date, p_empresa_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := coalesce(p_empresa_id, ing_mi_empresa());
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_sso uuid;
  v_lista jsonb;
  v_total int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if v_empresa is null or not (v_empresa = ing_mi_empresa() or ing_tiene('rrhh') or ing_tiene('prevencion')) then
    raise exception 'No puedes confirmar el listado de esta empresa' using errcode = '42501';
  end if;
  if v_periodo > date_trunc('month', ing_hoy())::date then
    raise exception 'No se puede confirmar el listado de un mes que no ha empezado' using errcode = 'P0001';
  end if;
  v_sso := ing_sso_empresa_de(v_empresa);
  select coalesce(jsonb_agg(jsonb_build_object('rut', t.rut, 'nombre', t.nombres || ' ' || t.apellidos,
                                               'cargo', t.cargo, 'sucursal', t.sucursal)
                            order by t.apellidos, t.nombres), '[]'::jsonb),
         count(*)::int
  into v_lista, v_total
  from sso_trabajadores t where t.empresa_id = v_sso and t.activo;
  insert into ing_listados (empresa_id, periodo, total, trabajadores, confirmado_por, confirmado_at)
  values (v_empresa, v_periodo, v_total, v_lista, auth.uid(), now())
  on conflict (empresa_id, periodo) do update
    set total = excluded.total, trabajadores = excluded.trabajadores,
        confirmado_por = excluded.confirmado_por, confirmado_at = excluded.confirmado_at;
  return v_total;
end $$;

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
            then ' (contratista' || coalesce(' de ' || ing_html(s.nombre), '') || ')' else '' end || '<br>'
    || 'Sucursal ' || ing_html(i.sucursal) || ' · ingresa el ' || to_char(i.fecha_ingreso, 'DD-MM-YYYY')
    || coalesce(' · ' || ing_html(i.jornada) || coalesce(' (' || ing_html(i.horario) || ')', ''), '') || '<br>'
    || coalesce('Motivo: ' || ing_motivo_label(i.motivo) || coalesce(' de ' || ing_html(i.reemplaza_a), '') || '<br>', '')
    || coalesce('Jefatura directa: ' || ing_html(i.jefatura_directa) || '<br>', '')
    || 'Pedido por ' || ing_html(coalesce(ing_nombre(i.creado_por), '')) || ' (' || ing_html(i.area) || ')'
  from ing_ingresos i left join subcontratistas s on s.id = i.empresa_id
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

-- ---------------------------------------------------------------- storage (carpeta empresas/)

create or replace function public.ing_ve_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) = 'empresas' then coalesce(ing_ve_empresa(ing_uuid(split_part(p_name, '/', 2))), false)
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
      coalesce(ing_ve_empresa(ing_uuid(split_part(p_name, '/', 2))) and ing_empresa_activa(ing_uuid(split_part(p_name, '/', 2))), false)
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
      coalesce(ing_ve_empresa(ing_uuid(split_part(p_name, '/', 2))), false) and (ing_tiene('rrhh') or p_owner = auth.uid()::text)
    else exists (
      select 1 from ing_ingresos i
      where i.id = ing_uuid(split_part(p_name, '/', 1)) and i.estado = 'en_proceso'
        and (ing_tiene('rrhh') or p_owner = auth.uid()::text))
  end
$$;

-- ---------------------------------------------------------------- vista de ingresos

drop view if exists public.ing_ingresos_v;
create view public.ing_ingresos_v as
select i.*,
  ing_nombre(i.creado_por) as creado_por_nombre,
  ing_nombre(i.cerrado_por) as cerrado_por_nombre,
  s.nombre as empresa_nombre,
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
left join subcontratistas s on s.id = i.empresa_id
left join lateral (
  select count(*) as total,
         count(*) filter (where x.hecha) as hechas,
         count(*) filter (where not x.hecha and ing_puede_tarea(x.id)) as mias
  from ing_tareas x where x.ingreso_id = i.id
) t on true
where ing_ve(i.id);

-- ---------------------------------------------------------------- RLS

alter table public.ing_empresa_docs enable row level security;
alter table public.ing_listados enable row level security;

drop policy if exists ing_empresa_docs_select on public.ing_empresa_docs;
create policy ing_empresa_docs_select on public.ing_empresa_docs for select to authenticated
  using (ing_ve_empresa(empresa_id));
drop policy if exists ing_empresa_docs_insert on public.ing_empresa_docs;
create policy ing_empresa_docs_insert on public.ing_empresa_docs for insert to authenticated
  with check (
    subido_por = (select auth.uid()) and ing_ve_empresa(empresa_id) and ing_empresa_activa(empresa_id)
    and tipo = any (ing_empresa_doc_tipos())
    and path like 'empresas/' || empresa_id::text || '/' || to_char(periodo, 'YYYY-MM') || '/%');
drop policy if exists ing_empresa_docs_delete on public.ing_empresa_docs;
create policy ing_empresa_docs_delete on public.ing_empresa_docs for delete to authenticated
  using (ing_ve_empresa(empresa_id) and (ing_tiene('rrhh') or subido_por = (select auth.uid())));

drop policy if exists ing_listados_select on public.ing_listados;
create policy ing_listados_select on public.ing_listados for select to authenticated
  using (ing_ve_empresa(empresa_id));
-- se escriben con ing_confirmar_listado()

-- Prevención: la empresa ve su fila y mantiene sus trabajadores (no los borra: los da de baja).
-- Se suman a las políticas de Prevención, que no cambian; la de sucursal (restrictiva) sigue aplicando.
drop policy if exists sso_empresas_select_contratista on public.sso_empresas;
create policy sso_empresas_select_contratista on public.sso_empresas for select to authenticated
  using (subcontratista_id is not null and subcontratista_id = ing_mi_empresa());
drop policy if exists sso_trabajadores_select_contratista on public.sso_trabajadores;
create policy sso_trabajadores_select_contratista on public.sso_trabajadores for select to authenticated
  using (empresa_id = ing_mi_sso_empresa());
drop policy if exists sso_trabajadores_insert_contratista on public.sso_trabajadores;
create policy sso_trabajadores_insert_contratista on public.sso_trabajadores for insert to authenticated
  with check (empresa_id = ing_mi_sso_empresa() and user_id is null);
drop policy if exists sso_trabajadores_update_contratista on public.sso_trabajadores;
create policy sso_trabajadores_update_contratista on public.sso_trabajadores for update to authenticated
  using (empresa_id = ing_mi_sso_empresa())
  with check (empresa_id = ing_mi_sso_empresa());

revoke all on public.ing_empresa_docs, public.ing_listados, public.ing_empresas_v from anon;
revoke update, truncate on public.ing_empresa_docs from authenticated;
revoke insert, update, delete, truncate on public.ing_listados from authenticated;
revoke insert, update, delete, truncate on public.ing_empresas_v, public.ing_ingresos_v from authenticated;
grant select on public.ing_empresas_v, public.ing_ingresos_v to authenticated;

-- ---------------------------------------------------------------- privilegios de las funciones

revoke execute on function
  public.ing_sso_empresa_de(uuid), public.ing_subcontratista_despues(), public.ing_mi_empresa(),
  public.ing_gestiona_contratistas(), public.ing_ve_empresa(uuid), public.ing_empresa_activa(uuid),
  public.ing_mi_sso_empresa(), public.ing_empresa_doc_tipos(), public.ing_empresa_faltan(uuid, date),
  public.ing_guardar_empresa(uuid, text, text, text, text, boolean), public.ing_confirmar_listado(date, uuid),
  public.ing_ingreso_empresa(), public.ing_docs_req(text, boolean)
  from public, anon;
-- las usan las políticas, las vistas y los triggers que corren como el usuario (las funciones de
-- una vista se ejecutan con los permisos de quien consulta), y las acciones del portal
grant execute on function
  public.ing_mi_empresa(), public.ing_gestiona_contratistas(), public.ing_ve_empresa(uuid),
  public.ing_empresa_activa(uuid), public.ing_mi_sso_empresa(), public.ing_empresa_doc_tipos(),
  public.ing_empresa_faltan(uuid, date), public.ing_docs_req(text, boolean),
  public.ing_guardar_empresa(uuid, text, text, text, text, boolean), public.ing_confirmar_listado(date, uuid),
  public.ing_rut_normalizar(text), public.ing_rut_valido(text), public.ing_tiene_acceso(uuid)
  to authenticated;
revoke execute on function public.ing_sso_empresa_de(uuid), public.ing_subcontratista_despues(),
  public.ing_tipos_ingreso(uuid), public.ing_resumen_html(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

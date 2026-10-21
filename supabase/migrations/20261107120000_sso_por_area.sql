-- Prevención: cada usuario ve solo lo de sus áreas.
--
-- Áreas del usuario (sso_area_usuarios): se eligen en Usuarios > Prevención. Con áreas elegidas el
-- usuario queda restringido a ellas; sin áreas (Prevención, gerencia) ve todo, igual que con la
-- sucursal. Los admin del hub nunca quedan restringidos.
--
-- Un usuario restringido:
--   ve las áreas, trabajadores, hallazgos, accidentes, capacitaciones, inspecciones y documentos
--   de sus áreas, y lo que cuelga de ellos (exámenes y EPP del trabajador, evidencias y bitácora
--   del hallazgo, asistentes, respuestas, versiones, archivos);
--   de lo que no tiene área, solo los documentos generales (documento sin área = toda la empresa);
--   no ve el Comité Paritario ni la dotación (indicadores de la empresa);
--   sigue viendo los hallazgos que tiene asignados o que reportó, aunque sean de otra área;
--   no recibe los resúmenes diarios por sucursal (traen información de todas las áreas).
--
-- Mismo patrón que la sucursal (20261028120000_sso_sucursal.sql): políticas RESTRICTIVE que se
-- suman a las de permisos de cada módulo, que no cambian. Las vistas son security_invoker.
--
-- Re-ejecutable. Va después de 20261028120000_sso_sucursal.sql. Lo aplica 06-sso.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- áreas de cada usuario

create table if not exists public.sso_area_usuarios (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references public.sso_areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, area_id)
);
create index if not exists sso_area_usuarios_area_idx on public.sso_area_usuarios (area_id);

create or replace function public.sso_mis_areas()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(au.area_id), '{}') from sso_area_usuarios au where au.user_id = auth.uid()
$$;

-- Con áreas asignadas y sin ser admin del hub
create or replace function public.sso_restringido_area()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sso_area_usuarios au where au.user_id = auth.uid())
     and not exists (select 1 from profiles p where p.id = auth.uid()
                     and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin'))
$$;

-- Un registro de esa área se ve (sin área: no, salvo que el usuario no esté restringido)
create or replace function public.sso_en_area(p_area_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not sso_restringido_area() or (p_area_id is not null and p_area_id = any (sso_mis_areas()))
$$;

-- Documentos: sin área es de toda la empresa y lo ven todos
create or replace function public.sso_en_area_doc(p_area_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_area_id is null or sso_en_area(p_area_id)
$$;

-- Hijos: se ven si se ve el área del padre (definer: no depende de los permisos del módulo padre)
create or replace function public.sso_area_ve_trabajador(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_area((select area_id from sso_trabajadores where id = p_id))
$$;

create or replace function public.sso_area_ve_hallazgo(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sso_hallazgos h where h.id = p_id
                 and (sso_en_area(h.area_id) or h.responsable_user_id = auth.uid() or h.reportado_por = auth.uid()))
$$;

create or replace function public.sso_area_ve_capacitacion(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_area((select area_id from sso_capacitaciones where id = p_id))
$$;

create or replace function public.sso_area_ve_entrega(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_area_ve_trabajador((select trabajador_id from sso_epp_entregas where id = p_id))
$$;

create or replace function public.sso_area_ve_inspeccion(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_area((select area_id from sso_inspecciones where id = p_id))
$$;

create or replace function public.sso_area_ve_evento(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_area((select area_id from sso_eventos where id = p_id))
$$;

create or replace function public.sso_area_ve_documento(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_area_doc((select area_id from sso_documentos where id = p_id))
$$;

-- Archivos del bucket 'sso' y 'sso-salud', según la carpeta (ver sso_modulo_de_objeto)
create or replace function public.sso_area_ve_objeto(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not sso_restringido_area() then true
    when p_bucket = 'sso-salud' then
      case when split_part(p_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then coalesce(sso_area_ve_trabajador(split_part(p_name, '/', 2)::uuid), false) else false end
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then coalesce(sso_area_ve_hallazgo(split_part(p_name, '/', 1)::uuid), false)
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp', 'inspecciones', 'eventos', 'documentos')
         and split_part(p_name, '/', 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when split_part(p_name, '/', 1) = 'capacitaciones' then sso_area_ve_capacitacion(split_part(p_name, '/', 2)::uuid)
    when split_part(p_name, '/', 1) = 'epp' then coalesce(sso_area_ve_entrega(split_part(p_name, '/', 2)::uuid), false)
    when split_part(p_name, '/', 1) = 'inspecciones' then sso_area_ve_inspeccion(split_part(p_name, '/', 2)::uuid)
    when split_part(p_name, '/', 1) = 'eventos' then sso_area_ve_evento(split_part(p_name, '/', 2)::uuid)
    when split_part(p_name, '/', 1) = 'documentos' then sso_area_ve_documento(split_part(p_name, '/', 2)::uuid)
    else false   -- comite/ y lo demás: no lo ve quien está restringido
  end
$$;

-- ---------------------------------------------------------------- RLS de las áreas del usuario

alter table public.sso_area_usuarios enable row level security;

-- Cada uno ve las suyas; quien administra Prevención (o Usuarios) las ve y las asigna
drop policy if exists sso_area_usuarios_select on public.sso_area_usuarios;
create policy sso_area_usuarios_select on public.sso_area_usuarios for select to authenticated
  using (user_id = (select auth.uid()) or sso_puede_modulo('configuracion', 'editar'));
drop policy if exists sso_area_usuarios_write on public.sso_area_usuarios;
create policy sso_area_usuarios_write on public.sso_area_usuarios for all to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));

revoke all on public.sso_area_usuarios from anon;
revoke truncate on public.sso_area_usuarios from authenticated;
grant select, insert, update, delete on public.sso_area_usuarios to authenticated;

-- ---------------------------------------------------------------- RLS por área (restrictivas)

do $$
declare
  r record;
begin
  for r in select * from (values
    ('sso_areas',                  'sso_en_area(id)'),
    ('sso_trabajadores',           'sso_en_area(area_id)'),
    ('sso_examenes',               'sso_area_ve_trabajador(trabajador_id)'),
    ('sso_evidencias',             'sso_area_ve_hallazgo(hallazgo_id)'),
    ('sso_bitacora',               'sso_area_ve_hallazgo(hallazgo_id)'),
    ('sso_capacitaciones',         'sso_en_area(area_id)'),
    ('sso_capacitacion_asistentes','sso_area_ve_capacitacion(capacitacion_id)'),
    ('sso_epp_entregas',           'sso_area_ve_trabajador(trabajador_id)'),
    ('sso_epp_entrega_items',      'sso_area_ve_entrega(entrega_id)'),
    ('sso_inspecciones',           'sso_en_area(area_id)'),
    ('sso_inspeccion_respuestas',  'sso_area_ve_inspeccion(inspeccion_id)'),
    ('sso_eventos',                'sso_en_area(area_id)'),
    ('sso_documentos',             'sso_en_area_doc(area_id)'),
    ('sso_documento_versiones',    'sso_area_ve_documento(documento_id)'),
    ('sso_dotacion_mensual',       'not sso_restringido_area()'),
    ('sso_comites',                'not sso_restringido_area()'),
    ('sso_comite_miembros',        'not sso_restringido_area()'),
    ('sso_comite_reuniones',       'not sso_restringido_area()'),
    ('sso_comite_acuerdos',        'not sso_restringido_area()'),
    ('sso_comite_asistencia',      'not sso_restringido_area()')
  ) x(tabla, expr) loop
    execute format('drop policy if exists %I on public.%I', r.tabla || '_area', r.tabla);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
                   r.tabla || '_area', r.tabla, r.expr, r.expr);
  end loop;
end $$;

-- Hallazgos: el responsable y quien lo reportó lo siguen viendo y respondiendo aunque sea de otra
-- área; crear y borrar, solo en las propias.
drop policy if exists sso_hallazgos_area on public.sso_hallazgos;
create policy sso_hallazgos_area on public.sso_hallazgos as restrictive for select to authenticated
  using (sso_en_area(area_id) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()));
drop policy if exists sso_hallazgos_area_ins on public.sso_hallazgos;
create policy sso_hallazgos_area_ins on public.sso_hallazgos as restrictive for insert to authenticated
  with check (sso_en_area(area_id));
drop policy if exists sso_hallazgos_area_upd on public.sso_hallazgos;
create policy sso_hallazgos_area_upd on public.sso_hallazgos as restrictive for update to authenticated
  using (sso_en_area(area_id) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()))
  with check (sso_en_area(area_id) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()));
drop policy if exists sso_hallazgos_area_del on public.sso_hallazgos;
create policy sso_hallazgos_area_del on public.sso_hallazgos as restrictive for delete to authenticated
  using (sso_en_area(area_id));

-- Archivos: restrictiva solo para los buckets de Prevención (no toca los demás)
drop policy if exists sso_objects_area on storage.objects;
create policy sso_objects_area on storage.objects as restrictive for select to authenticated
  using (bucket_id not in ('sso', 'sso-salud') or public.sso_area_ve_objeto(bucket_id, name));

-- ---------------------------------------------------------------- avisos

-- Los resúmenes por sucursal no van a quien está restringido a sus áreas (traen todas las áreas)
create or replace function public.sso_destinatarios_en(p_modulo text, p_acciones text[], p_sucursal text)
returns uuid[] language sql stable security definer set search_path = public as $$
  with dest as (
    select d from unnest(sso_destinatarios(p_modulo, p_acciones)) d
    where sso_usuario_en_sucursal(d, p_sucursal)
      and not exists (select 1 from sso_area_usuarios au where au.user_id = d)
  )
  select array(
    select d from dest
    union all
    select p.id from profiles p
    where not exists (select 1 from dest)
      and coalesce(p.activo, true) and not coalesce(p.is_root, false)
      and (coalesce(p.is_super_admin, false) or p.rol = 'admin'))
$$;

-- ---------------------------------------------------------------- privilegios

revoke execute on function
  public.sso_mis_areas(), public.sso_restringido_area(), public.sso_en_area(uuid), public.sso_en_area_doc(uuid),
  public.sso_area_ve_trabajador(uuid), public.sso_area_ve_hallazgo(uuid), public.sso_area_ve_capacitacion(uuid),
  public.sso_area_ve_entrega(uuid), public.sso_area_ve_inspeccion(uuid), public.sso_area_ve_evento(uuid),
  public.sso_area_ve_documento(uuid), public.sso_area_ve_objeto(text, text)
  from public, anon;
-- las usan las políticas (corren como el usuario) y el portal (saber si está restringido)
grant execute on function
  public.sso_mis_areas(), public.sso_restringido_area(), public.sso_en_area(uuid), public.sso_en_area_doc(uuid),
  public.sso_area_ve_trabajador(uuid), public.sso_area_ve_hallazgo(uuid), public.sso_area_ve_capacitacion(uuid),
  public.sso_area_ve_entrega(uuid), public.sso_area_ve_inspeccion(uuid), public.sso_area_ve_evento(uuid),
  public.sso_area_ve_documento(uuid), public.sso_area_ve_objeto(text, text)
  to authenticated;
revoke execute on function public.sso_destinatarios_en(text, text[], text) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Portal de Prevencion (PLAN_SSO_PORTAL.md, fase 1): permisos por modulo.
--
-- Antes: una sola clave, permisos.modulo_key = 'sso'. Ahora una por modulo, igual que el CRM:
-- 'sso:hallazgos', 'sso:configuracion', y las que agreguen las fases siguientes
-- ('sso:trabajadores', 'sso:capacitaciones', ...). Todas sobre el mismo ancla (sso_ancla_id()).
--
-- Va DESPUES de 20260930120000_sso_prevencion.sql (06-sso.ps1 las corre en orden) y redefine
-- algunas funciones de esa migracion. Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- permisos por modulo

-- El usuario indicado puede hacer p_accion en el modulo p_modulo. Los admin del portal pueden todo.
create or replace function public.sso_usuario_puede_modulo(p_modulo text, p_accion text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe
    where pe.user_id = p_user_id and pe.proyecto_id = sso_ancla_id()
      and pe.modulo_key = 'sso:' || p_modulo and pe.accion = p_accion
  )
$$;

create or replace function public.sso_puede_modulo(p_modulo text, p_accion text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select sso_usuario_puede_modulo(p_modulo, p_accion, auth.uid())
$$;

-- Tiene el portal: cualquier modulo (es lo que muestra el portal y su menu)
create or replace function public.sso_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe where pe.user_id = p_user_id and pe.proyecto_id = sso_ancla_id() and pe.modulo_key like 'sso:%'
  )
$$;

-- Las funciones de la fase anterior siguen existiendo (las usan la RLS, los triggers y
-- sso_cambiar_estado de los hallazgos) y ahora significan "en el modulo Hallazgos".
create or replace function public.sso_usuario_puede(p_accion text default 'ver', p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select sso_usuario_puede_modulo('hallazgos', p_accion, p_user_id)
$$;

create or replace function public.sso_puede(p_accion text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select sso_usuario_puede_modulo('hallazgos', p_accion, auth.uid())
$$;

-- Supervisores de hallazgos: 'aprobar' explicito en Hallazgos; si no hay nadie, los admin.
create or replace function public.sso_supervisores()
returns setof uuid language sql stable security definer set search_path = public as $$
  with explicitos as (
    select distinct pe.user_id
    from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.proyecto_id = sso_ancla_id() and pe.modulo_key = 'sso:hallazgos' and pe.accion = 'aprobar'
  )
  select user_id from explicitos
  union all
  select p.id from profiles p
  where not exists (select 1 from explicitos)
    and coalesce(p.activo, true) and not coalesce(p.is_root, false)
    and (coalesce(p.is_super_admin, false) or p.rol = 'admin')
$$;

revoke execute on function public.sso_usuario_puede_modulo(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.sso_puede_modulo(text, text), public.sso_tiene_acceso(uuid) from public, anon;
grant  execute on function public.sso_puede_modulo(text, text), public.sso_tiene_acceso(uuid) to authenticated;

-- ---------------------------------------------------------------- datos: 'sso' -> 'sso:hallazgos'
-- Quien validaba hallazgos (aprobar) configuraba tambien las areas: recibe Configuracion.
insert into permisos (user_id, proyecto_id, modulo_key, accion)
select user_id, proyecto_id, 'sso:configuracion', a.accion
from permisos, (values ('ver'), ('editar')) a(accion)
where proyecto_id = sso_ancla_id() and modulo_key = 'sso' and permisos.accion = 'aprobar'
on conflict do nothing;

insert into permisos (user_id, proyecto_id, modulo_key, accion)
select user_id, proyecto_id, 'sso:hallazgos', accion
from permisos where proyecto_id = sso_ancla_id() and modulo_key = 'sso'
on conflict do nothing;
delete from permisos where proyecto_id = sso_ancla_id() and modulo_key = 'sso';

-- ---------------------------------------------------------------- areas: pasan a Configuracion
-- Las ven todos los del portal (las usan Hallazgos, y luego Trabajadores, Inspecciones, Accidentes);
-- las edita quien tiene Configuracion.
drop policy if exists sso_areas_select on public.sso_areas;
create policy sso_areas_select on public.sso_areas for select to authenticated
  using (sso_tiene_acceso());
drop policy if exists sso_areas_insert on public.sso_areas;
create policy sso_areas_insert on public.sso_areas for insert to authenticated
  with check (sso_puede_modulo('configuracion', 'editar'));
drop policy if exists sso_areas_update on public.sso_areas;
create policy sso_areas_update on public.sso_areas for update to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));
drop policy if exists sso_areas_delete on public.sso_areas;
create policy sso_areas_delete on public.sso_areas for delete to authenticated
  using (sso_puede_modulo('configuracion', 'editar'));

notify pgrst, 'reload schema';

commit;

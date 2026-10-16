-- Prevencion: los encargados de area (p. ej. subcontratistas) ven solo los hallazgos de su area.
-- Re-ejecutable (06-sso.ps1 corre todas las *_sso_*.sql en cada despliegue).
--
-- Regla: quien es encargado de al menos un area activa y NO tiene hallazgos:aprobar queda
-- restringido a los hallazgos de sus areas, los que tiene asignados y los que el mismo reporto.
-- Validadores, lectores sin area (gerencia) y admins del portal siguen viendo todo.
-- Evidencias, bitacora y fotos del bucket heredan la regla (miran el hallazgo con RLS).

set client_encoding = 'UTF8';

create or replace function public.sso_hallazgo_visible(p_area uuid, p_responsable uuid, p_reportado uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_puede('ver') and (
    p_responsable = auth.uid()
    or p_reportado = auth.uid()
    or sso_puede('aprobar')
    or not exists (select 1 from sso_areas a where a.encargado_user_id = auth.uid() and a.activa)
    or exists (select 1 from sso_areas a where a.id = p_area and a.encargado_user_id = auth.uid())
  )
$$;
revoke execute on function public.sso_hallazgo_visible(uuid, uuid, uuid) from public, anon;
grant  execute on function public.sso_hallazgo_visible(uuid, uuid, uuid) to authenticated;

drop policy if exists sso_hallazgos_select on public.sso_hallazgos;
create policy sso_hallazgos_select on public.sso_hallazgos for select to authenticated
  using (sso_hallazgo_visible(area_id, responsable_user_id, reportado_por));

-- el exists corre con la RLS de sso_hallazgos del usuario
drop policy if exists sso_evidencias_select on public.sso_evidencias;
create policy sso_evidencias_select on public.sso_evidencias for select to authenticated
  using (exists (select 1 from public.sso_hallazgos h where h.id = hallazgo_id));

drop policy if exists sso_bitacora_select on public.sso_bitacora;
create policy sso_bitacora_select on public.sso_bitacora for select to authenticated
  using (exists (select 1 from public.sso_hallazgos h where h.id = hallazgo_id));

-- fotos de hallazgos: carpeta <hallazgo_id>/...; el resto de los modulos no cambia
drop policy if exists sso_objects_select on storage.objects;
create policy sso_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sso'
    and sso_puede_modulo(coalesce(sso_modulo_de_objeto(name), '-'), 'ver')
    and (sso_modulo_de_objeto(name) is distinct from 'hallazgos'
         or exists (select 1 from public.sso_hallazgos h where h.id::text = split_part(name, '/', 1))));

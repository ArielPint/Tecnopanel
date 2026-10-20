-- CRM: el chat de una oportunidad es de todo usuario con acceso al CRM que pueda ver la
-- oportunidad, y muestra los mensajes de todas las etapas.
--
-- Antes leer y escribir exigía permiso 'ver' en el módulo Oportunidades, o ser vendedor o
-- asignado de la oportunidad: un usuario de Ingeniería (permiso solo en ese módulo) no podía
-- enviar mensajes ni veía los existentes; los admins sí. Misma regla que los documentos
-- (20261001_crm_documentos_visibles_para_usuarios_crm, has_crm_acceso()).
-- El EXISTS sobre oportunidades pasa por la RLS de esa tabla: respeta las reglas de sucursal.

begin;

drop policy if exists mensajes_select_crm_permiso on public.mensajes_oportunidad;
drop policy if exists mensajes_insert_crm_permiso on public.mensajes_oportunidad;

create policy mensajes_select_crm_permiso
  on public.mensajes_oportunidad
  for select
  to authenticated
  using (
    exists (select 1 from public.oportunidades o where o.id = mensajes_oportunidad.oportunidad_id)
    and (
      (select public.has_crm_acceso())
      or exists (select 1 from public.oportunidad_asignaciones oa
                 where oa.oportunidad_id = mensajes_oportunidad.oportunidad_id and oa.usuario_id = auth.uid())
      or exists (select 1 from public.oportunidades o
                 where o.id = mensajes_oportunidad.oportunidad_id and o.vendedor_id = auth.uid())
    )
  );

create policy mensajes_insert_crm_permiso
  on public.mensajes_oportunidad
  for insert
  to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.oportunidades o where o.id = mensajes_oportunidad.oportunidad_id)
    and (
      (select public.has_crm_acceso())
      or exists (select 1 from public.oportunidad_asignaciones oa
                 where oa.oportunidad_id = mensajes_oportunidad.oportunidad_id and oa.usuario_id = auth.uid())
      or exists (select 1 from public.oportunidades o
                 where o.id = mensajes_oportunidad.oportunidad_id and o.vendedor_id = auth.uid())
    )
  );

commit;

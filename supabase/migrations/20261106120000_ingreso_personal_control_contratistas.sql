-- Control de Contratistas (/control-contratistas): portal propio, fuera de Ingreso de Personal, para
-- definir por separado quién valida la documentación y quién aprueba los estados de pago.
--
-- Accesos: pseudo-proyecto ancla propio (slug 'control-contratistas', tipo 'sistema'). Un rol por fila
-- de permisos: modulo_key 'ctr:<rol>', accion 'ver' (pestaña Contratistas de Usuarios). Roles:
--   consulta       ve las empresas, su documentación, listados, trabajadores e ingresos
--   revisor_docs   aprueba o rechaza documentación y listado; carga documentos y confirma el listado por la empresa
--   revisor_ep     pasa los estados de pago a revisión o los rechaza
--   aprobador_ep   aprueba los estados de pago y registra el pago
--   administrador  agrega y corrige empresas (la lista es la de Estados de Pago)
-- Cualquier rol da acceso al portal y deja ver todo lo de los contratistas; los estados de pago
-- solo los ven revisor_ep y aprobador_ep. Los admin del hub tienen todos los roles.
--
-- Las tablas y el portal de cada empresa (/contratistas) no cambian; solo cambia quién es "Tecnopanel"
-- en las funciones que deciden (antes, roles de Ingreso de Personal). Los roles de Ingreso
-- revisor_contratistas y aprobador_ep pasan a ctr:revisor_docs + ctr:revisor_ep y ctr:aprobador_ep.
-- RRHH, Prevención y coordinadores de Ingreso ya no entran a Contratistas: se les da un rol aquí.
--
-- El nombre lleva _ingreso_personal_ para que lo aplique 21-ingreso-personal.ps1 después de las
-- migraciones de contratistas. Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla y roles

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('c7a14e52-3b8d-4f61-9e2a-6d05b8f3c91e', 'Control de Contratistas (sistema)', 'control-contratistas', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del portal Control de Contratistas. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.ctr_ancla_id()
returns uuid language sql immutable as $$
  select 'c7a14e52-3b8d-4f61-9e2a-6d05b8f3c91e'::uuid
$$;

create or replace function public.ctr_usuario_tiene(p_rol text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = ctr_ancla_id() and pe.modulo_key = 'ctr:' || p_rol
  )
$$;

create or replace function public.ctr_tiene(p_rol text)
returns boolean language sql stable security definer set search_path = public as $$
  select ctr_usuario_tiene(p_rol, auth.uid())
$$;

create or replace function public.ctr_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = ctr_ancla_id() and pe.modulo_key like 'ctr:%'
  )
$$;

-- Personas con un rol explícito (sin los admin implícitos), para los avisos
create or replace function public.ctr_usuarios_con(p_rol text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct pe.user_id
  from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
  where pe.proyecto_id = ctr_ancla_id() and pe.modulo_key = 'ctr:' || p_rol
$$;

-- Los roles de contratistas que estaban en Ingreso de Personal pasan aquí
insert into public.permisos (user_id, proyecto_id, modulo_key, accion)
select pe.user_id, ctr_ancla_id(), m.nuevo, 'ver'
from public.permisos pe
join (values ('ing:revisor_contratistas', 'ctr:revisor_docs'), ('ing:revisor_contratistas', 'ctr:revisor_ep'),
             ('ing:aprobador_ep', 'ctr:aprobador_ep')) m(viejo, nuevo) on m.viejo = pe.modulo_key
where pe.proyecto_id = ing_ancla_id()
on conflict do nothing;
delete from public.permisos
where proyecto_id = ing_ancla_id() and modulo_key in ('ing:revisor_contratistas', 'ing:aprobador_ep');

-- ---------------------------------------------------------------- quién es "Tecnopanel" en contratistas

create or replace function public.ing_gestiona_contratistas()
returns boolean language sql stable security definer set search_path = public as $$
  select ctr_tiene_acceso()
$$;

create or replace function public.ing_revisa_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select ctr_tiene('revisor_docs')
$$;

create or replace function public.ing_valida_ep()
returns boolean language sql stable security definer set search_path = public as $$
  select ctr_tiene('revisor_ep') or ctr_tiene('aprobador_ep')
$$;

-- La propia empresa o quien revisa documentación: los que cargan documentos de una empresa
create or replace function public.ing_carga_empresa(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_empresa_id is not null and (p_empresa_id = ing_mi_empresa() or ctr_tiene('revisor_docs'))
$$;

-- Empresas para los portales: Control de Contratistas, quien pide ingresos, y la propia empresa
drop view if exists public.ing_empresas_v;
create view public.ing_empresas_v as
select s.id, s.nombre, s.rut, s.email, s.telefono, coalesce(s.activo, true) as activa
from subcontratistas s
where ing_tiene_acceso() or ctr_tiene_acceso() or s.id = ing_mi_empresa();

create or replace function public.ing_guardar_empresa(p_id uuid, p_nombre text, p_rut text, p_email text, p_telefono text, p_activa boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rut text := nullif(btrim(coalesce(p_rut, '')), '');
  v_id uuid;
begin
  if not ctr_tiene('administrador') then
    raise exception 'Solo el administrador de Control de Contratistas puede registrar empresas' using errcode = '42501';
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
  if v_empresa is null or not (v_empresa = ing_mi_empresa() or ctr_tiene('revisor_docs')) then
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
  insert into ing_listados (empresa_id, periodo, total, trabajadores, confirmado_por, confirmado_at, estado)
  values (v_empresa, v_periodo, v_total, v_lista, auth.uid(), now(), 'por_revisar')
  on conflict (empresa_id, periodo) do update
    set total = excluded.total, trabajadores = excluded.trabajadores,
        confirmado_por = excluded.confirmado_por, confirmado_at = excluded.confirmado_at,
        estado = 'por_revisar', motivo_rechazo = null, revisado_por = null, revisado_at = null;
  return v_total;
end $$;

create or replace function public.ing_cambiar_estado_ep(p_id uuid, p_estado text, p_comentario text default null, p_monto_pagado numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  ep estados_pago%rowtype;
  v_com text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_proyecto text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_estado in ('en_revision', 'rechazado') and not (ctr_tiene('revisor_ep') or ctr_tiene('aprobador_ep')) then
    raise exception 'Solo el revisor de estados de pago puede revisar o rechazar' using errcode = '42501';
  end if;
  if p_estado in ('aprobado', 'pagado') and not ctr_tiene('aprobador_ep') then
    raise exception 'Solo el aprobador de estados de pago puede aprobar o registrar el pago' using errcode = '42501';
  end if;
  if p_estado not in ('en_revision', 'rechazado', 'aprobado', 'pagado') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;
  if p_estado = 'rechazado' and v_com is null then raise exception 'Indica el motivo del rechazo' using errcode = 'P0001'; end if;
  select * into ep from estados_pago where id = p_id for update;
  if not found then raise exception 'Estado de pago no encontrado' using errcode = 'P0002'; end if;

  update estados_pago
  set estado = p_estado, actualizado_por = auth.uid(),
      monto_pagado = case when p_estado = 'pagado' then coalesce(p_monto_pagado, ep.monto_neto) else monto_pagado end
  where id = p_id;
  if v_com is not null then
    update estados_pago_historial set comentario = v_com
    where id = (select h.id from estados_pago_historial h where h.estado_pago_id = p_id order by h.created_at desc limit 1);
  end if;

  if p_estado in ('rechazado', 'aprobado', 'pagado') then
    select p.nombre into v_proyecto from proyectos p where p.id = ep.proyecto_id;
    perform ing_avisar_empresa(
      (select sc.subcontratista_id from subcontratos sc where sc.id = ep.subcontrato_id),
      'Estado de pago N° ' || ep.numero_ep || ' ' || case p_estado when 'rechazado' then 'rechazado' when 'aprobado' then 'aprobado' else 'pagado' end
        || ' · ' || coalesce(v_proyecto, ''),
      'Estado de pago N° ' || ep.numero_ep || ': ' || case p_estado when 'rechazado' then 'rechazado' when 'aprobado' then 'aprobado' else 'pagado' end,
      '<p style="margin:0 0 12px">Proyecto ' || ing_html(coalesce(v_proyecto, '')) || coalesce(' · período ' || ing_html(ep.periodo), '') || '</p>'
      || case when v_com is not null then '<p style="margin:0">' || case when p_estado = 'rechazado' then 'Motivo: ' else 'Comentario: ' end
                                          || ing_html(v_com) || '</p>' else '' end);
  end if;
end $$;

-- Al emitirse un EP, aviso a quienes lo revisan
create or replace function public.ing_ep_emitido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_empresa text; v_proyecto text;
begin
  select s.nombre, p.nombre into v_empresa, v_proyecto
  from subcontratos sc join subcontratistas s on s.id = sc.subcontratista_id join proyectos p on p.id = sc.proyecto_id
  where sc.id = new.subcontrato_id;
  perform ing_encolar(
    array(select ctr_usuarios_con('revisor_ep')),
    'Nuevo estado de pago N° ' || new.numero_ep || ': ' || coalesce(v_empresa, '') || ' · ' || coalesce(v_proyecto, ''),
    '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">'
    || '<h2 style="margin:0 0 16px;font-size:19px">Estado de pago por revisar</h2>'
    || '<p style="margin:0 0 20px;line-height:1.55"><b>' || ing_html(coalesce(v_empresa, '')) || '</b> emitió el EP N° ' || ing_html(new.numero_ep)
    || ' del proyecto ' || ing_html(coalesce(v_proyecto, '')) || '.</p>'
    || '<p style="margin:0 0 20px"><a href="' || ing_url_base() || '/control-contratistas'
    || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Abrir Control de Contratistas</a></p>'
    || '<p style="margin:0;font-size:12px;color:#6b7280">Aviso automático de Control de Contratistas · Tecnopanel</p>'
    || '</div></body></html>');
  return new;
end $$;

-- ---------------------------------------------------------------- documentos: quién carga y borra

drop policy if exists ing_empresa_docs_insert on public.ing_empresa_docs;
create policy ing_empresa_docs_insert on public.ing_empresa_docs for insert to authenticated
  with check (
    subido_por = (select auth.uid()) and ing_carga_empresa(empresa_id) and ing_empresa_activa(empresa_id)
    and tipo = any (ing_empresa_doc_tipos())
    and path like 'empresas/' || empresa_id::text || '/' || to_char(periodo, 'YYYY-MM') || '/%');
drop policy if exists ing_empresa_docs_delete on public.ing_empresa_docs;
create policy ing_empresa_docs_delete on public.ing_empresa_docs for delete to authenticated
  using (ing_carga_empresa(empresa_id) and (ctr_tiene('revisor_docs') or (subido_por = (select auth.uid()) and estado <> 'aprobado')));

create or replace function public.ing_puede_subir_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) = 'empresas' then
      coalesce(ing_carga_empresa(ing_uuid(split_part(p_name, '/', 2))) and ing_empresa_activa(ing_uuid(split_part(p_name, '/', 2))), false)
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
      coalesce(ing_carga_empresa(ing_uuid(split_part(p_name, '/', 2))), false) and (ctr_tiene('revisor_docs') or p_owner = auth.uid()::text)
    else exists (
      select 1 from ing_ingresos i
      where i.id = ing_uuid(split_part(p_name, '/', 1)) and i.estado = 'en_proceso'
        and (ing_tiene('rrhh') or p_owner = auth.uid()::text))
  end
$$;

-- ---------------------------------------------------------------- privilegios

revoke all on public.ing_empresas_v from anon;
revoke insert, update, delete, truncate on public.ing_empresas_v from authenticated;
grant select on public.ing_empresas_v to authenticated;

revoke execute on function
  public.ctr_usuario_tiene(text, uuid), public.ctr_tiene(text), public.ctr_tiene_acceso(uuid), public.ctr_usuarios_con(text),
  public.ing_carga_empresa(uuid)
  from public, anon;
grant execute on function public.ctr_tiene(text), public.ctr_tiene_acceso(uuid), public.ing_carga_empresa(uuid) to authenticated;
revoke execute on function public.ctr_usuario_tiene(text, uuid), public.ctr_usuarios_con(text), public.ing_ep_emitido() from authenticated;

notify pgrst, 'reload schema';

commit;

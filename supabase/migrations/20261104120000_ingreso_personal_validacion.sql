-- Portal Ingreso de Personal > Contratistas: validación por Tecnopanel de lo que sube cada empresa.
--
-- Roles nuevos (pestaña Ingreso personal de Usuarios, modulo_key 'ing:<rol>'):
--   revisor_contratistas   revisa la documentación mensual y el listado (aprueba o rechaza con motivo)
--                          y los estados de pago: los pasa a revisión o los rechaza
--   aprobador_ep           aprueba los estados de pago en revisión y registra el pago
-- Los dos ven los estados de pago de todos los proyectos desde Contratistas, sin permisos de
-- proyecto. RRHH y Prevención también pueden validar la documentación (no los estados de pago).
--
-- Documentación del mes (ing_empresa_docs) y listado (ing_listados): quedan 'por_revisar' al
-- subirse o confirmarse; el mes queda al día solo con todo 'aprobado'. Un rechazo lleva motivo,
-- se avisa por correo a las cuentas de la empresa y la empresa vuelve a subir o a confirmar.
--
-- Estados de pago (tablas de prod): el cambio de estado va por ing_cambiar_estado_ep(); la
-- transición la sigue validando el trigger trg_estados_pago_transicion (que deja el historial).
-- Al emitirse un EP se avisa a los revisores; al rechazarse, aprobarse o pagarse, a la empresa.
--
-- Va después de 20261103120000_ingreso_personal_estados_pago.sql. Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- quién valida

create or replace function public.ing_valida_ep()
returns boolean language sql stable security definer set search_path = public as $$
  select ing_tiene('revisor_contratistas') or ing_tiene('aprobador_ep')
$$;

create or replace function public.ing_revisa_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select ing_tiene('revisor_contratistas') or ing_tiene('rrhh') or ing_tiene('prevencion')
$$;

-- El control de contratistas incluye ahora a quienes validan
create or replace function public.ing_gestiona_contratistas()
returns boolean language sql stable security definer set search_path = public as $$
  select ing_tiene('rrhh') or ing_tiene('prevencion') or ing_tiene('coordinador')
      or ing_tiene('revisor_contratistas') or ing_tiene('aprobador_ep')
$$;

-- ---------------------------------------------------------------- revisión de documentos y listado

alter table public.ing_empresa_docs
  add column if not exists estado text not null default 'por_revisar',
  add column if not exists motivo_rechazo text,
  add column if not exists revisado_por uuid references auth.users(id),
  add column if not exists revisado_at timestamptz;
alter table public.ing_empresa_docs drop constraint if exists ing_empresa_docs_estado_check;
alter table public.ing_empresa_docs add constraint ing_empresa_docs_estado_check
  check (estado in ('por_revisar', 'aprobado', 'rechazado'));

alter table public.ing_listados
  add column if not exists estado text not null default 'por_revisar',
  add column if not exists motivo_rechazo text,
  add column if not exists revisado_por uuid references auth.users(id),
  add column if not exists revisado_at timestamptz;
alter table public.ing_listados drop constraint if exists ing_listados_estado_check;
alter table public.ing_listados add constraint ing_listados_estado_check
  check (estado in ('por_revisar', 'aprobado', 'rechazado'));

-- Al subir siempre queda por revisar (no se puede subir ya aprobado)
create or replace function public.ing_empresa_doc_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.estado := 'por_revisar';
    new.motivo_rechazo := null;
    new.revisado_por := null;
    new.revisado_at := null;
  end if;
  return new;
end $$;
drop trigger if exists ing_empresa_doc_antes on public.ing_empresa_docs;
create trigger ing_empresa_doc_antes before insert on public.ing_empresa_docs
  for each row execute function public.ing_empresa_doc_antes();

-- Lo que le falta a la empresa para tener el mes al día: documentos y listado aprobados
create or replace function public.ing_empresa_faltan(p_empresa_id uuid, p_periodo date)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*)::int from unnest(ing_empresa_doc_tipos()) t(tipo)
          where not exists (select 1 from ing_empresa_docs d
                            where d.empresa_id = p_empresa_id and d.periodo = p_periodo and d.tipo = t.tipo and d.estado = 'aprobado'))
       + case when exists (select 1 from ing_listados l
                           where l.empresa_id = p_empresa_id and l.periodo = p_periodo and l.estado = 'aprobado') then 0 else 1 end
$$;

-- La empresa no borra lo ya aprobado
drop policy if exists ing_empresa_docs_delete on public.ing_empresa_docs;
create policy ing_empresa_docs_delete on public.ing_empresa_docs for delete to authenticated
  using (ing_ve_empresa(empresa_id) and (ing_tiene('rrhh') or (subido_por = (select auth.uid()) and estado <> 'aprobado')));

-- Correo a las cuentas de la empresa, con enlace a su portal
create or replace function public.ing_avisar_empresa(p_empresa_id uuid, p_asunto text, p_titulo text, p_cuerpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform ing_encolar(
    array(select su.user_id from subcontratista_usuarios su where su.subcontratista_id = p_empresa_id),
    p_asunto,
    '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">'
    || '<h2 style="margin:0 0 16px;font-size:19px">' || ing_html(p_titulo) || '</h2>'
    || '<div style="margin:0 0 20px;line-height:1.55">' || p_cuerpo || '</div>'
    || '<p style="margin:0 0 20px"><a href="' || ing_url_base() || '/contratistas'
    || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Abrir el portal</a></p>'
    || '<p style="margin:0;font-size:12px;color:#6b7280">Aviso automático del Portal Contratistas · Tecnopanel</p>'
    || '</div></body></html>');
end $$;

create or replace function public.ing_doc_empresa_label(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo
    when 'adhesion' then 'Certificado de adhesión al organismo administrador'
    when 'contratos' then 'Contratos de trabajo'
    when 'reglamento' then 'Recepción del reglamento interno'
    when 'f30' then 'Formulario F30'
    else 'Documento' end
$$;

create or replace function public.ing_revisar_doc_empresa(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  d ing_empresa_docs%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not ing_revisa_docs() then raise exception 'No puedes revisar documentos de contratistas' using errcode = '42501'; end if;
  if not p_aprobar and v_motivo is null then raise exception 'Indica el motivo del rechazo' using errcode = 'P0001'; end if;
  update ing_empresa_docs
  set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
      motivo_rechazo = case when p_aprobar then null else v_motivo end,
      revisado_por = auth.uid(), revisado_at = now()
  where id = p_id returning * into d;
  if not found then raise exception 'Documento no encontrado' using errcode = 'P0002'; end if;
  if not p_aprobar then
    perform ing_avisar_empresa(d.empresa_id,
      'Documento rechazado: ' || ing_doc_empresa_label(d.tipo) || ' de ' || to_char(d.periodo, 'MM-YYYY'),
      'Tecnopanel rechazó un documento',
      '<p style="margin:0 0 12px"><b>' || ing_html(ing_doc_empresa_label(d.tipo)) || '</b> de ' || to_char(d.periodo, 'MM-YYYY')
      || ' (' || ing_html(d.nombre) || ')</p><p style="margin:0">Motivo: ' || ing_html(v_motivo) || '</p>'
      || '<p style="margin:12px 0 0">Suba el documento corregido en el portal.</p>');
  end if;
end $$;

-- Volver a confirmar el listado lo deja otra vez por revisar
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
  insert into ing_listados (empresa_id, periodo, total, trabajadores, confirmado_por, confirmado_at, estado)
  values (v_empresa, v_periodo, v_total, v_lista, auth.uid(), now(), 'por_revisar')
  on conflict (empresa_id, periodo) do update
    set total = excluded.total, trabajadores = excluded.trabajadores,
        confirmado_por = excluded.confirmado_por, confirmado_at = excluded.confirmado_at,
        estado = 'por_revisar', motivo_rechazo = null, revisado_por = null, revisado_at = null;
  return v_total;
end $$;

create or replace function public.ing_revisar_listado(p_empresa_id uuid, p_periodo date, p_aprobar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not ing_revisa_docs() then raise exception 'No puedes revisar listados de contratistas' using errcode = '42501'; end if;
  if not p_aprobar and v_motivo is null then raise exception 'Indica el motivo del rechazo' using errcode = 'P0001'; end if;
  update ing_listados
  set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
      motivo_rechazo = case when p_aprobar then null else v_motivo end,
      revisado_por = auth.uid(), revisado_at = now()
  where empresa_id = p_empresa_id and periodo = date_trunc('month', p_periodo)::date;
  if not found then raise exception 'La empresa no ha confirmado el listado de ese mes' using errcode = 'P0002'; end if;
  if not p_aprobar then
    perform ing_avisar_empresa(p_empresa_id,
      'Listado de trabajadores rechazado: ' || to_char(p_periodo, 'MM-YYYY'),
      'Tecnopanel rechazó su listado de trabajadores',
      '<p style="margin:0 0 12px">Listado de ' || to_char(p_periodo, 'MM-YYYY') || '</p><p style="margin:0">Motivo: ' || ing_html(v_motivo) || '</p>'
      || '<p style="margin:12px 0 0">Corrija sus trabajadores en el portal y vuelva a confirmar el listado.</p>');
  end if;
end $$;

-- ---------------------------------------------------------------- estados de pago

-- Estados de pago con proyecto, subcontrato y empresa, para quien valida. Sin security_invoker:
-- el filtro es ing_valida_ep() (la RLS de estados_pago es por permisos de proyecto).
drop view if exists public.ing_estados_pago_v;
create view public.ing_estados_pago_v as
select ep.*, sc.especialidad, sc.subcontratista_id as empresa_id, p.nombre as proyecto_nombre
from estados_pago ep
join subcontratos sc on sc.id = ep.subcontrato_id
join proyectos p on p.id = ep.proyecto_id
where ing_valida_ep();

-- Lo que necesita el detalle de un EP (ítems, documentos, historial, archivos) para quien valida
drop policy if exists estados_pago_select_ing on public.estados_pago;
create policy estados_pago_select_ing on public.estados_pago for select to authenticated using (ing_valida_ep());
drop policy if exists estados_pago_modulos_select_ing on public.estados_pago_modulos;
create policy estados_pago_modulos_select_ing on public.estados_pago_modulos for select to authenticated using (ing_valida_ep());
drop policy if exists estados_pago_documentos_select_ing on public.estados_pago_documentos;
create policy estados_pago_documentos_select_ing on public.estados_pago_documentos for select to authenticated using (ing_valida_ep());
drop policy if exists estados_pago_historial_select_ing on public.estados_pago_historial;
create policy estados_pago_historial_select_ing on public.estados_pago_historial for select to authenticated using (ing_valida_ep());
drop policy if exists subcontratos_select_ing on public.subcontratos;
create policy subcontratos_select_ing on public.subcontratos for select to authenticated using (ing_valida_ep());
drop policy if exists estados_pago_docs_select_ing on storage.objects;
create policy estados_pago_docs_select_ing on storage.objects for select to authenticated
  using (bucket_id = 'estados-pago-docs' and public.ing_valida_ep());

-- Cambio de estado desde Contratistas: revisor (a revisión, rechazar) y aprobador (aprobar, pagar).
-- La transición la valida trg_estados_pago_transicion, que también deja el historial.
create or replace function public.ing_cambiar_estado_ep(p_id uuid, p_estado text, p_comentario text default null, p_monto_pagado numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  ep estados_pago%rowtype;
  v_com text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_proyecto text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_estado in ('en_revision', 'rechazado') and not (ing_tiene('revisor_contratistas') or ing_tiene('aprobador_ep')) then
    raise exception 'Solo el revisor de contratistas puede revisar o rechazar estados de pago' using errcode = '42501';
  end if;
  if p_estado in ('aprobado', 'pagado') and not ing_tiene('aprobador_ep') then
    raise exception 'Solo el aprobador de EP puede aprobar o registrar el pago' using errcode = '42501';
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

-- Al emitirse un EP, aviso a los revisores
create or replace function public.ing_ep_emitido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_empresa text; v_proyecto text;
begin
  select s.nombre, p.nombre into v_empresa, v_proyecto
  from subcontratos sc join subcontratistas s on s.id = sc.subcontratista_id join proyectos p on p.id = sc.proyecto_id
  where sc.id = new.subcontrato_id;
  perform ing_encolar(
    array(select ing_usuarios_con('revisor_contratistas', null)),
    'Nuevo estado de pago N° ' || new.numero_ep || ': ' || coalesce(v_empresa, '') || ' · ' || coalesce(v_proyecto, ''),
    '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">'
    || '<h2 style="margin:0 0 16px;font-size:19px">Estado de pago por revisar</h2>'
    || '<p style="margin:0 0 20px;line-height:1.55"><b>' || ing_html(coalesce(v_empresa, '')) || '</b> emitió el EP N° ' || ing_html(new.numero_ep)
    || ' del proyecto ' || ing_html(coalesce(v_proyecto, '')) || '.</p>'
    || '<p style="margin:0 0 20px"><a href="' || ing_url_base() || '/personal/contratistas'
    || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Abrir Contratistas</a></p>'
    || '<p style="margin:0;font-size:12px;color:#6b7280">Aviso automático del portal Ingreso de Personal · Tecnopanel</p>'
    || '</div></body></html>');
  return new;
end $$;
drop trigger if exists ing_ep_emitido on public.estados_pago;
create trigger ing_ep_emitido after insert on public.estados_pago
  for each row execute function public.ing_ep_emitido();

-- ---------------------------------------------------------------- trabajadores de los contratistas

-- Quien lleva el control de contratistas ve los trabajadores de las empresas contratistas
-- (los de Tecnopanel siguen siendo solo de Prevención)
drop policy if exists sso_empresas_select_ing on public.sso_empresas;
create policy sso_empresas_select_ing on public.sso_empresas for select to authenticated
  using (subcontratista_id is not null and ing_gestiona_contratistas());
drop policy if exists sso_trabajadores_select_ing on public.sso_trabajadores;
create policy sso_trabajadores_select_ing on public.sso_trabajadores for select to authenticated
  using (ing_gestiona_contratistas() and empresa_id in (select e.id from sso_empresas e where e.subcontratista_id is not null));

-- ---------------------------------------------------------------- privilegios

revoke all on public.ing_estados_pago_v from anon;
revoke insert, update, delete, truncate on public.ing_estados_pago_v from authenticated;
grant select on public.ing_estados_pago_v to authenticated;

revoke execute on function
  public.ing_valida_ep(), public.ing_revisa_docs(), public.ing_empresa_doc_antes(), public.ing_avisar_empresa(uuid, text, text, text),
  public.ing_doc_empresa_label(text), public.ing_revisar_doc_empresa(uuid, boolean, text), public.ing_revisar_listado(uuid, date, boolean, text),
  public.ing_cambiar_estado_ep(uuid, text, text, numeric), public.ing_ep_emitido()
  from public, anon;
grant execute on function
  public.ing_valida_ep(), public.ing_revisa_docs(), public.ing_revisar_doc_empresa(uuid, boolean, text),
  public.ing_revisar_listado(uuid, date, boolean, text), public.ing_cambiar_estado_ep(uuid, text, text, numeric),
  public.ing_gestiona_contratistas(), public.ing_confirmar_listado(date, uuid), public.ing_empresa_faltan(uuid, date)
  to authenticated;
revoke execute on function public.ing_avisar_empresa(uuid, text, text, text), public.ing_ep_emitido() from authenticated;

notify pgrst, 'reload schema';

commit;

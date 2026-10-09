-- Portal de Prevencion, fase 9 (PLAN_SSO_PORTAL.md): alertas diarias de vencimientos de todos los
-- modulos y resumen "Requiere atencion" del Dashboard.
--
-- sso_alertas_diarias() (tarea TP-SSO-Alertas, 08:00) sigue avisando los plazos de hallazgos y ahora
-- tambien: examenes ocupacionales, cursos con vigencia, reposicion de EPP, documentos, inspecciones
-- atrasadas, DIAT pendiente, acuerdos del Comite Paritario vencidos, comite sin reunion ordinaria y
-- periodo del comite por vencer.
--   - Cada vencimiento se avisa UNA vez (sso_alertas_log guarda lo ya avisado): pasar a "por vencer"
--     es un aviso y pasar a "vencido" es otro. No se repite cada dia.
--   - A quienes gestionan el modulo les llega un resumen por modulo ("3 examenes vencieron...") con
--     enlace a la pantalla (sso_notificaciones.ruta). A los responsables directos (documento, acuerdo,
--     evento) les llega el aviso de lo suyo.
--
-- sso_pendientes(): conteos de lo que requiere atencion, con los permisos de quien consulta
-- (security invoker: la RLS de cada modulo filtra).
--
-- Re-ejecutable. Va despues de 20261005190000_sso_comite.sql.
set client_encoding = 'UTF8';

begin;

alter table public.sso_notificaciones add column if not exists ruta text;   -- pantalla a abrir (resumenes)

create table if not exists public.sso_alertas_log (
  clave text primary key,                         -- ej. 'examen:<id>:vencido'
  creado_en timestamptz not null default now()
);
alter table public.sso_alertas_log enable row level security;   -- sin politicas: solo funciones definer
revoke all on public.sso_alertas_log from anon, authenticated;

-- Quienes gestionan un modulo: 'acciones' explicitas en ese modulo; si no hay nadie, los admin.
create or replace function public.sso_destinatarios(p_modulo text, p_acciones text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  with explicitos as (
    select distinct pe.user_id
    from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true) and not coalesce(p.is_root, false)
    where pe.proyecto_id = sso_ancla_id() and pe.modulo_key = 'sso:' || p_modulo and pe.accion = any (p_acciones)
  )
  select array(
    select user_id from explicitos
    union all
    select p.id from profiles p
    where not exists (select 1 from explicitos)
      and coalesce(p.activo, true) and not coalesce(p.is_root, false)
      and (coalesce(p.is_super_admin, false) or p.rol = 'admin'))
$$;

-- Inserta un aviso para cada destinatario activo (sin repetir personas).
create or replace function public.sso_alertar(
  p_dest uuid[], p_tipo text, p_titulo text, p_mensaje text, p_ruta text,
  p_evento_id uuid default null, p_acuerdo_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into sso_notificaciones (user_id, tipo, titulo, mensaje, ruta, evento_id, acuerdo_id)
  select distinct d, p_tipo, p_titulo, p_mensaje, p_ruta, p_evento_id, p_acuerdo_id
  from unnest(p_dest) d
  where d is not null and exists (select 1 from profiles p where p.id = d and coalesce(p.activo, true));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- "3 vencidos y 5 por vencer" (solo las partes que no son cero)
create or replace function public.sso_texto_conteo(p_vencidos int, p_por_vencer int, p_unidad text, p_unidades text)
returns text language sql immutable as $$
  select concat_ws(' y ',
    case when p_vencidos > 0 then p_vencidos || ' ' || case when p_vencidos = 1 then p_unidad || ' vencido' else p_unidades || ' vencidos' end end,
    case when p_por_vencer > 0 then p_por_vencer || ' ' || case when p_por_vencer = 1 then p_unidad || ' por vencer' else p_unidades || ' por vencer' end end)
$$;

-- ---------------------------------------------------------------- hallazgos (lo de la fase 1)

create or replace function public.sso_alertas_hallazgos()
returns text language plpgsql security definer set search_path = public as $$
declare
  h record;
  v_hoy date := sso_hoy();
  v_supervisores uuid[] := array(select sso_supervisores());
  v_dest uuid[];
  v_tipo text;
  v_titulo text;
  n_por_vencer int := 0;
  n_hoy int := 0;
  n_vencido int := 0;
  v_n int;
begin
  for h in
    select * from sso_hallazgos
    where estado <> 'cerrado'
      and (fecha_compromiso = v_hoy + 3 or fecha_compromiso <= v_hoy)
  loop
    if h.fecha_compromiso = v_hoy + 3 then
      v_tipo := 'por_vencer';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vence en 3 días';
      v_dest := array[h.responsable_user_id];
    elsif h.fecha_compromiso = v_hoy then
      v_tipo := 'vence_hoy';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vence hoy';
      v_dest := h.responsable_user_id || v_supervisores;
    else
      v_tipo := 'vencido';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vencido hace ' || (v_hoy - h.fecha_compromiso)
                  || case when v_hoy - h.fecha_compromiso = 1 then ' día' else ' días' end;
      v_dest := h.responsable_user_id || v_supervisores;
    end if;

    -- el mismo aviso ya salio hoy a esa persona: no repetir
    v_dest := array(
      select d from unnest(v_dest) d
      where not exists (
        select 1 from sso_notificaciones n
        where n.user_id = d and n.hallazgo_id = h.id and n.tipo = v_tipo
          and (n.created_at at time zone 'America/Santiago')::date = v_hoy));

    v_n := sso_notificar(v_dest, h.id, v_tipo, v_titulo, left(h.descripcion, 140) || ' · ' || h.ubicacion);
    if v_tipo = 'por_vencer' then n_por_vencer := n_por_vencer + v_n;
    elsif v_tipo = 'vence_hoy' then n_hoy := n_hoy + v_n;
    else n_vencido := n_vencido + v_n; end if;
  end loop;

  return format('hallazgos por_vencer=%s vence_hoy=%s vencido=%s', n_por_vencer, n_hoy, n_vencido);
end $$;

-- ---------------------------------------------------------------- vencimientos de los demas modulos

create or replace function public.sso_alertas_vencimientos()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := sso_hoy();
  v_ven int; v_por int; v_ej text; v_n int := 0; v_res text[] := '{}';
  r record;
begin
  -- 1) examenes ocupacionales (datos de salud: solo a quien tiene trabajadores:aprobar)
  with c as (
    select 'examen:' || v.id || ':' || v.situacion as clave, v.situacion, t.nombres || ' ' || t.apellidos || ' (' || te.nombre || ')' as et
    from sso_examenes_vigentes v
    join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    join sso_tipos_examen te on te.id = v.tipo_id
    where v.situacion in ('vencido', 'por_vencer')
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
         string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
  from c join n using (clave);
  if v_ven + v_por > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('trabajadores', array['aprobar']), 'resumen_vencimientos',
      'Exámenes ocupacionales: ' || sso_texto_conteo(v_ven, v_por, 'examen', 'exámenes'), left(v_ej, 200), '/prevencion/trabajadores');
    v_res := v_res || ('examenes=' || (v_ven + v_por));
  end if;

  -- 2) cursos con vigencia
  with c as (
    select 'cap:' || v.trabajador_id || ':' || v.tipo_id || ':' || v.vencimiento || ':' || v.situacion as clave, v.situacion,
           t.nombres || ' ' || t.apellidos || ' (' || tc.nombre || ')' as et
    from sso_capacitaciones_vigentes v
    join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    join sso_tipos_capacitacion tc on tc.id = v.tipo_id
    where v.situacion in ('vencido', 'por_vencer')
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
         string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
  from c join n using (clave);
  if v_ven + v_por > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('capacitaciones', array['editar']), 'resumen_vencimientos',
      'Capacitaciones: ' || sso_texto_conteo(v_ven, v_por, 'curso', 'cursos'), left(v_ej, 200), '/prevencion/capacitaciones/vigencias');
    v_res := v_res || ('cursos=' || (v_ven + v_por));
  end if;

  -- 3) reposicion de EPP
  with c as (
    select 'epp:' || v.trabajador_id || ':' || v.epp_id || ':' || v.reposicion || ':' || v.situacion as clave, v.situacion,
           t.nombres || ' ' || t.apellidos || ' (' || ec.nombre || ')' as et
    from sso_epp_vigentes v
    join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    join sso_epp_catalogo ec on ec.id = v.epp_id
    where v.situacion in ('vencido', 'por_vencer')
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
         string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
  from c join n using (clave);
  if v_ven + v_por > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('epp', array['editar']), 'resumen_vencimientos',
      'EPP por reponer: ' || sso_texto_conteo(v_ven, v_por, 'elemento', 'elementos'), left(v_ej, 200), '/prevencion/epp/reposiciones');
    v_res := v_res || ('epp=' || (v_ven + v_por));
  end if;

  -- 4) documentos: resumen a quien edita el modulo y aviso al responsable de cada documento
  create temp table if not exists _sso_docs (clave text, documento_id uuid, situacion text, codigo text, titulo text, responsable uuid, vigente_hasta date) on commit drop;
  truncate _sso_docs;
  with c as (
    select 'doc:' || d.version_id || ':' || d.situacion as clave, d.id, d.situacion, d.codigo, d.titulo, d.responsable_user_id, d.vigente_hasta
    from sso_documentos_v d
    where d.activo and d.situacion in ('vencido', 'por_vencer')
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  insert into _sso_docs select c.* from c join n using (clave);
  select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
         string_agg(codigo, ', ' order by situacion desc, codigo) into v_ven, v_por, v_ej from _sso_docs;
  if v_ven + v_por > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('documentos', array['editar']), 'resumen_vencimientos',
      'Revisión de documentos: ' || sso_texto_conteo(v_ven, v_por, 'documento', 'documentos'), left(v_ej, 200), '/prevencion/documentos');
    for r in select * from _sso_docs where responsable is not null and sso_usuario_puede_modulo('documentos', 'ver', responsable) loop
      v_n := v_n + sso_alertar(array[r.responsable], 'documento_' || r.situacion,
        r.codigo || case when r.situacion = 'vencido' then ': la revisión está vencida' else ': revisión vence el ' || to_char(r.vigente_hasta, 'DD-MM-YYYY') end,
        r.titulo || ' · eres el responsable', '/prevencion/documentos/' || r.documento_id);
    end loop;
    v_res := v_res || ('documentos=' || (v_ven + v_por));
  end if;

  -- 5) inspecciones atrasadas o nunca hechas (una vez por ciclo: la clave lleva la ultima inspeccion)
  with c as (
    select 'insp:' || p.checklist_id || ':' || coalesce(p.area_id::text, '-') || ':' || coalesce(p.ultima::text, 'nunca') as clave,
           p.checklist || coalesce(' · ' || a.nombre, '') as et
    from sso_programa_inspecciones p left join sso_areas a on a.id = p.area_id
    where p.situacion in ('atrasada', 'nunca')
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  select count(*), string_agg(et, ', ' order by et) into v_ven, v_ej from c join n using (clave);
  if v_ven > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('inspecciones', array['aprobar']), 'resumen_vencimientos',
      'Inspecciones: ' || v_ven || case when v_ven = 1 then ' atrasada o pendiente' else ' atrasadas o pendientes' end,
      left(v_ej, 200), '/prevencion/inspecciones');
    v_res := v_res || ('inspecciones=' || v_ven);
  end if;

  -- 6) DIAT/DIEP pendiente: accidente o enfermedad de hace mas de 24 horas sin folio (ultimo año)
  -- (un FOR no puede recorrer un WITH que inserta: se pasa por una tabla temporal)
  create temp table if not exists _sso_diat (clave text, id uuid, numero int, tipo text, descripcion text) on commit drop;
  truncate _sso_diat;
  with c as (
    select 'diat:' || e.id as clave, e.id, e.numero, e.tipo, e.descripcion
    from sso_eventos e
    where e.tipo in ('accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad')
      and coalesce(btrim(e.diat_folio), '') = '' and e.ocurrido_en < now() - interval '24 hours'
      and e.ocurrido_en > now() - interval '365 days'
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  insert into _sso_diat select c.* from c join n using (clave);
  for r in select * from _sso_diat order by numero loop
    v_n := v_n + sso_alertar(sso_destinatarios('accidentes', array['aprobar', 'editar']), 'diat_pendiente',
      'Evento N° ' || r.numero || ': falta registrar la ' || case when r.tipo = 'enfermedad' then 'DIEP' else 'DIAT' end || ' a la Mutual',
      left(r.descripcion, 160), null, r.id);
    v_res := v_res || ('diat=' || r.numero);
  end loop;

  -- 7) acuerdos del comite vencidos: aviso al responsable y resumen a la secretaria del comite
  create temp table if not exists _sso_ac (clave text, id uuid, descripcion text, responsable uuid, plazo date, comite text) on commit drop;
  truncate _sso_ac;
  with c as (
    select 'acuerdo:' || a.id || ':vencido:' || a.fecha_compromiso as clave, a.id, a.descripcion, a.responsable_user_id, a.fecha_compromiso, co.nombre
    from sso_comite_acuerdos a join sso_comites co on co.id = a.comite_id and co.activo
    where a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < v_hoy
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  insert into _sso_ac select c.* from c join n using (clave);
  select count(*), string_agg(left(descripcion, 60), ' · ' order by plazo) into v_ven, v_ej from _sso_ac;
  if v_ven > 0 then
    v_n := v_n + sso_alertar(sso_destinatarios('comite', array['crear', 'editar']), 'resumen_vencimientos',
      'Comité Paritario: ' || v_ven || case when v_ven = 1 then ' acuerdo vencido' else ' acuerdos vencidos' end,
      left(v_ej, 200), '/prevencion/comite/acuerdos');
    for r in select * from _sso_ac where responsable is not null loop
      v_n := v_n + sso_alertar(array[r.responsable], 'acuerdo_vencido',
        'Comité Paritario: venció el plazo de tu acuerdo (' || to_char(r.plazo, 'DD-MM-YYYY') || ')', left(r.descripcion, 160), null, null, r.id);
    end loop;
    v_res := v_res || ('acuerdos=' || v_ven);
  end if;

  -- 8) comite sin reunion ordinaria en mas de un mes (una vez por mes) y periodo por terminar
  create temp table if not exists _sso_com (clave text, nombre text, ultima date, titulo text, mensaje text) on commit drop;
  truncate _sso_com;
  with c as (
      select 'comite:' || co.id || ':sin_reunion:' || to_char(v_hoy, 'YYYY-MM') as clave, co.nombre, co.ultima_ordinaria,
             'Comité Paritario ' || co.nombre || ': ' || coalesce('sin reunión ordinaria desde el ' || to_char(co.ultima_ordinaria, 'DD-MM-YYYY'), 'no hay reuniones ordinarias registradas') as titulo,
             'Debe reunirse en forma ordinaria una vez al mes.' as mensaje
      from sso_comites_v co
      where co.activo and co.periodo_desde < v_hoy - 31 and (co.ultima_ordinaria is null or co.ultima_ordinaria < v_hoy - 31)
      union all
      select 'comite:' || co.id || ':periodo:' || co.periodo_hasta || ':' || case when co.periodo_hasta < v_hoy then 'vencido' else 'por_vencer' end,
             co.nombre, null,
             'Comité Paritario ' || co.nombre || ': el periodo ' || case when co.periodo_hasta < v_hoy then 'terminó' else 'termina' end || ' el ' || to_char(co.periodo_hasta, 'DD-MM-YYYY'),
             'Corresponde renovar el comité (elección de los representantes de los trabajadores).'
      from sso_comites_v co
      where co.activo and co.periodo_hasta <= v_hoy + 60
  ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
  insert into _sso_com select c.* from c join n using (clave);
  for r in select * from _sso_com loop
    v_n := v_n + sso_alertar(sso_destinatarios('comite', array['crear', 'editar']), 'comite', r.titulo, r.mensaje, '/prevencion/comite');
    v_res := v_res || 'comite';
  end loop;

  delete from sso_alertas_log where creado_en < now() - interval '400 days';
  return format('vencimientos avisos=%s [%s]', v_n, array_to_string(v_res, ' '));
end $$;

-- La tarea diaria (TP-SSO-Alertas) llama a esta
create or replace function public.sso_alertas_diarias()
returns text language plpgsql security definer set search_path = public as $$
begin
  return sso_alertas_hallazgos() || '; ' || sso_alertas_vencimientos();
end $$;

-- ---------------------------------------------------------------- Dashboard: requiere atencion

-- Conteos con los permisos de quien consulta (invoker: cada vista aplica su RLS; los examenes solo
-- cuentan para quien ve datos de salud). nivel: 'critico' (legal o vencido grave) o 'alerta'.
create or replace function public.sso_pendientes()
returns table (modulo text, clave text, etiqueta text, cantidad bigint, nivel text, ruta text)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'hallazgos', 'hallazgos_vencidos', 'Hallazgos con el plazo vencido', count(*), 'critico', '/prevencion/hallazgos'
    from sso_hallazgos_v where sso_puede_modulo('hallazgos', 'ver') and vencido
    union all
    select 'hallazgos', 'por_verificar', 'Cierres de hallazgos por validar', count(*), 'alerta', '/prevencion/hallazgos'
    from sso_hallazgos where sso_puede_modulo('hallazgos', 'aprobar') and estado = 'pend_verificacion'
    union all
    select 'accidentes', 'autoridad', 'Accidentes graves o fatales sin notificación a la autoridad', count(*), 'critico', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and gravedad in ('grave', 'fatal') and autoridad_notificada_en is null
    union all
    select 'accidentes', 'diat', 'Accidentes sin DIAT/DIEP registrada', count(*), 'critico', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and tipo in ('accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad')
      and coalesce(btrim(diat_folio), '') = '' and ocurrido_en < now() - interval '24 hours' and ocurrido_en > now() - interval '365 days'
    union all
    select 'accidentes', 'investigaciones', 'Investigaciones abiertas hace más de 30 días', count(*), 'alerta', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and estado <> 'cerrado' and ocurrido_en < now() - interval '30 days'
    union all
    select 'inspecciones', 'atrasadas', 'Inspecciones atrasadas o nunca hechas', count(*), 'alerta', '/prevencion/inspecciones'
    from sso_programa_inspecciones where sso_puede_modulo('inspecciones', 'ver') and situacion in ('atrasada', 'nunca')
    union all
    select 'trabajadores', 'examenes', 'Exámenes ocupacionales vencidos', count(*), 'critico', '/prevencion/trabajadores'
    from sso_examenes_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('trabajadores', 'aprobar') and v.situacion = 'vencido'
    union all
    select 'capacitaciones', 'cursos', 'Cursos vencidos (trabajador × curso)', count(*), 'alerta', '/prevencion/capacitaciones/vigencias'
    from sso_capacitaciones_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('capacitaciones', 'ver') and v.situacion = 'vencido'
    union all
    select 'epp', 'reposiciones', 'Elementos de EPP por reponer (vencidos)', count(*), 'alerta', '/prevencion/epp/reposiciones'
    from sso_epp_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('epp', 'ver') and v.situacion = 'vencido'
    union all
    select 'documentos', 'documentos', 'Documentos con la revisión vencida', count(*), 'alerta', '/prevencion/documentos'
    from sso_documentos_v where sso_puede_modulo('documentos', 'ver') and activo and situacion = 'vencido'
    union all
    select 'comite', 'acuerdos', 'Acuerdos del Comité Paritario vencidos', count(*), 'alerta', '/prevencion/comite/acuerdos'
    from sso_comite_acuerdos_v where sso_puede_modulo('comite', 'ver') and vencido
    union all
    select 'comite', 'reunion', 'Comités sin reunión ordinaria en el último mes', count(*), 'alerta', '/prevencion/comite'
    from sso_comites_v where sso_puede_modulo('comite', 'ver') and activo and periodo_desde < sso_hoy() - 31
      and (ultima_ordinaria is null or ultima_ordinaria < sso_hoy() - 31)
  ) x(modulo, clave, etiqueta, cantidad, nivel, ruta)
  where cantidad > 0
$$;

revoke execute on function public.sso_destinatarios(text, text[]), public.sso_alertar(uuid[], text, text, text, text, uuid, uuid),
  public.sso_alertas_hallazgos(), public.sso_alertas_vencimientos(), public.sso_alertas_diarias()
  from public, anon, authenticated;
revoke execute on function public.sso_pendientes() from public, anon;
grant  execute on function public.sso_pendientes() to authenticated;

notify pgrst, 'reload schema';

commit;

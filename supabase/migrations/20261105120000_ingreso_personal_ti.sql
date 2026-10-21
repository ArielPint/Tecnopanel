-- Portal Ingreso de Personal: lo que TI necesita saber (pedido de TI, 2026-10-21).
--
-- Además de correo, notebook, pantalla y otros, la solicitud indica:
--   ti_licencias   licencias de software: AEC Collection, AutoCAD LT, AutoCAD Full, SAP
--   ti_portales    portales del hub a los que hay que darle acceso: CRM, Proyectos, Producción,
--                  Prevención, Ingreso de Personal, Adquisiciones, Financiero, Gestión
-- Sigue siendo una sola tarea de TI; el correo a TI lleva el detalle.
--
-- Redefine ing_ingreso_formulario() (de 20261031120000) e ing_detalle_tarea_html() (de
-- 20261101120000) y recrea ing_ingresos_v (i.* fija las columnas al crearla; misma definición que
-- 20261102120000). Va después de 20261104120000_ingreso_personal_validacion.sql. Re-ejecutable.
set client_encoding = 'UTF8';

begin;

alter table public.ing_ingresos
  add column if not exists ti_licencias text[] not null default '{}',
  add column if not exists ti_portales text[] not null default '{}';

alter table public.ing_ingresos drop constraint if exists ing_ingresos_ti_licencias_check;
alter table public.ing_ingresos add constraint ing_ingresos_ti_licencias_check
  check (ti_licencias <@ array['aec', 'autocad_lt', 'autocad_full', 'sap']);
alter table public.ing_ingresos drop constraint if exists ing_ingresos_ti_portales_check;
alter table public.ing_ingresos add constraint ing_ingresos_ti_portales_check
  check (ti_portales <@ array['crm', 'proyectos', 'produccion', 'prevencion', 'ingreso', 'adquisiciones', 'financiero', 'gestion']);

create or replace function public.ing_licencia_label(p text)
returns text language sql immutable as $$
  select case p when 'aec' then 'Licencia AEC' when 'autocad_lt' then 'AutoCAD LT' when 'autocad_full' then 'AutoCAD Full'
                when 'sap' then 'Licencia SAP' else p end
$$;

create or replace function public.ing_portal_label(p text)
returns text language sql immutable as $$
  select case p when 'crm' then 'CRM' when 'proyectos' then 'Proyectos' when 'produccion' then 'Producción'
                when 'prevencion' then 'Prevención' when 'ingreso' then 'Ingreso de Personal' when 'adquisiciones' then 'Adquisiciones'
                when 'financiero' then 'Financiero' when 'gestion' then 'Gestión' else p end
$$;

-- Igual que en 20261031120000, más licencias y portales (cuentan como "algo de TI")
create or replace function public.ing_ingreso_formulario()
returns trigger language plpgsql set search_path = public as $$
declare
  v_nuevo boolean := tg_op = 'INSERT';
  v_algo_ti boolean;
begin
  new.req_induccion := true;   -- la inducción de seguridad es obligatoria para todos
  new.jefatura_directa := nullif(btrim(coalesce(new.jefatura_directa, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');
  new.reemplaza_a := case when new.motivo = 'reemplazo' then nullif(btrim(coalesce(new.reemplaza_a, '')), '') end;
  new.licencia_requerida := case when new.req_vehiculo then nullif(btrim(coalesce(new.licencia_requerida, '')), '') end;
  new.ti_otros := case when new.req_ti then nullif(btrim(coalesce(new.ti_otros, '')), '') end;
  if not new.req_ti then
    new.ti_correo := false; new.ti_notebook := false; new.ti_pantalla := false;
    new.ti_licencias := '{}'; new.ti_portales := '{}';
  end if;
  new.ti_licencias := array(select distinct x from unnest(coalesce(new.ti_licencias, '{}')) x order by x);
  new.ti_portales := array(select distinct x from unnest(coalesce(new.ti_portales, '{}')) x order by x);
  new.talla_zapato := nullif(btrim(coalesce(new.talla_zapato, '')), '');
  new.talla_polera := nullif(btrim(coalesce(new.talla_polera, '')), '');
  new.talla_pantalon := nullif(btrim(coalesce(new.talla_pantalon, '')), '');
  new.talla_chaqueta := nullif(btrim(coalesce(new.talla_chaqueta, '')), '');
  v_algo_ti := new.ti_correo or new.ti_notebook or new.ti_pantalla or new.ti_otros is not null
               or cardinality(new.ti_licencias) > 0 or cardinality(new.ti_portales) > 0;

  if current_user in ('authenticated', 'anon') then
    if v_nuevo and new.motivo is null then
      raise exception 'Indica el motivo de la contratación' using errcode = '22023';
    end if;
    if v_nuevo and new.jefatura_directa is null then
      raise exception 'Indica la jefatura directa del trabajador' using errcode = '22023';
    end if;
    if v_nuevo and new.horario is null then
      raise exception 'Indica el horario de la jornada' using errcode = '22023';
    end if;
    if new.motivo = 'reemplazo' and new.reemplaza_a is null then
      raise exception 'Indica a quién reemplaza' using errcode = '22023';
    end if;
    if new.req_vehiculo and new.licencia_requerida is null
       and (v_nuevo or not old.req_vehiculo or old.licencia_requerida is not null) then
      raise exception 'Indica la licencia o certificación que pide la conducción' using errcode = '22023';
    end if;
    if new.req_ti and not v_algo_ti
       and (v_nuevo or not old.req_ti or old.ti_correo or old.ti_notebook or old.ti_pantalla or old.ti_otros is not null
            or cardinality(old.ti_licencias) > 0 or cardinality(old.ti_portales) > 0) then
      raise exception 'Indica qué necesita de TI (equipo, licencias, portales u otros)' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

create or replace function public.ing_detalle_tarea_html(p_tipo text, p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when d.texto is null then '' else '<p style="margin:0 0 12px">' || ing_html(d.texto) || '</p>' end
  from ing_ingresos i
  cross join lateral (select nullif(case p_tipo
    when 'ti' then concat_ws(' · ',
      case when i.ti_correo then 'Correo' end, case when i.ti_notebook then 'Notebook' end,
      case when i.ti_pantalla then 'Pantalla' end,
      nullif(array_to_string(array(select ing_licencia_label(x) from unnest(i.ti_licencias) x), ', '), ''),
      'Portales: ' || nullif(array_to_string(array(select ing_portal_label(x) from unnest(i.ti_portales) x), ', '), ''),
      'Otros: ' || i.ti_otros)
    when 'epp' then concat_ws(' · ', 'Zapato ' || i.talla_zapato, i.tallas)
    when 'uniforme' then concat_ws(' · ', 'Polera ' || i.talla_polera, 'Pantalón ' || i.talla_pantalon,
      'Polar ' || i.talla_chaqueta, i.tallas)
    when 'vehiculo' then 'Licencia o certificación: ' || i.licencia_requerida
    end, '') as texto) d
  where i.id = p_ingreso_id
$$;

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

revoke all on public.ing_ingresos_v from anon;
revoke insert, update, delete, truncate on public.ing_ingresos_v from authenticated;
grant select on public.ing_ingresos_v to authenticated;

revoke execute on function public.ing_licencia_label(text), public.ing_portal_label(text), public.ing_ingreso_formulario() from public, anon;
revoke execute on function public.ing_detalle_tarea_html(text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Portal Produccion de Paneles SIP: los proyectos de SAP (pnl_sap_proyectos, sincronizados desde
-- HANA) tambien son destino de la fabricacion, no solo de los cortes.
--
-- El proyecto de una linea de fabricacion es ahora uno de tres (o ninguno):
--   proyecto_id          obra del hub (La Chacra...)
--   pnl_proyecto_id      proyecto propio del portal
--   sap_proyecto_codigo  proyecto de SAP (OPRJ.PrjCode)
-- Las vistas pnl_lineas_v y pnl_consumos_v traen la columna nueva al final y su nombre en
-- proyecto_nombre.
--
-- Re-ejecutable. Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

alter table public.pnl_lineas add column if not exists sap_proyecto_codigo text
  references public.pnl_sap_proyectos(codigo) on delete restrict;
create index if not exists pnl_lineas_sap_proyecto_idx on public.pnl_lineas (sap_proyecto_codigo);

alter table public.pnl_lineas drop constraint if exists pnl_lineas_un_proyecto;
alter table public.pnl_lineas add constraint pnl_lineas_un_proyecto
  check (num_nonnulls(proyecto_id, pnl_proyecto_id, sap_proyecto_codigo) <= 1);

-- ---------------------------------------------------------------- vistas (columna nueva al final)

create or replace view public.pnl_lineas_v with (security_invoker = true) as
select
  l.id, l.parte_id, p.numero as parte_numero, p.fecha, p.hora_desde, p.hora_hasta,
  l.panel_id, pa.codigo as panel_codigo, pa.descripcion as panel_descripcion, pa.espesor_mm,
  round(coalesce(pa.ancho_mm::numeric * pa.largo_mm / 1e6, 0), 4) as m2_panel,
  l.buenos, l.rechazados, l.buenos + l.rechazados as total,
  l.proyecto_id, l.pnl_proyecto_id, coalesce(pr.nombre, pp.nombre, sp.nombre) as proyecto_nombre, l.referencia,
  p.created_by, p.created_at,
  l.sap_proyecto_codigo
from public.pnl_lineas l
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
left join public.proyectos pr on pr.id = l.proyecto_id
left join public.pnl_proyectos pp on pp.id = l.pnl_proyecto_id
left join public.pnl_sap_proyectos sp on sp.codigo = l.sap_proyecto_codigo;

create or replace view public.pnl_consumos_v with (security_invoker = true) as
select
  c.linea_id, l.parte_id, p.fecha, p.hora_desde, p.hora_hasta,
  l.panel_id, pa.codigo as panel_codigo, l.proyecto_id, l.pnl_proyecto_id, l.referencia,
  c.material_id, m.codigo as material_codigo, m.descripcion as material_descripcion, m.unidad,
  c.cantidad_unitaria,
  c.cantidad_unitaria * l.buenos as cantidad_buenos,
  c.cantidad_unitaria * l.rechazados as cantidad_merma,
  c.cantidad_unitaria * (l.buenos + l.rechazados) as cantidad_total,
  l.sap_proyecto_codigo
from public.pnl_consumos c
join public.pnl_lineas l on l.id = c.linea_id
join public.pnl_partes p on p.id = l.parte_id
join public.pnl_paneles pa on pa.id = l.panel_id
join public.pnl_materiales m on m.id = c.material_id;

-- ---------------------------------------------------------------- guardar un parte (con proyecto SAP)

-- Igual que en 20261006120000_produccion_sip.sql, con sap_proyecto_codigo en cada linea:
-- p_lineas: [{id?, panel_id, buenos, rechazados, proyecto_id | pnl_proyecto_id | sap_proyecto_codigo, referencia}]
create or replace function public.pnl_guardar_parte(
  p_parte_id uuid, p_fecha date, p_hora_desde time, p_hora_hasta time, p_observacion text, p_lineas jsonb
) returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El parte necesita al menos un panel' using errcode = 'P0001';
  end if;
  if p_fecha > pnl_hoy() then
    raise exception 'La fecha no puede ser futura' using errcode = 'P0001';
  end if;

  if p_parte_id is null then
    insert into pnl_partes (fecha, hora_desde, hora_hasta, observacion)
    values (p_fecha, p_hora_desde, p_hora_hasta, nullif(btrim(p_observacion), ''))
    returning id into v_id;
  else
    update pnl_partes set fecha = p_fecha, hora_desde = p_hora_desde, hora_hasta = p_hora_hasta,
      observacion = nullif(btrim(p_observacion), '')
    where id = p_parte_id
    returning id into v_id;
    if v_id is null then
      raise exception 'No puede corregir este parte' using errcode = '42501';
    end if;
    delete from pnl_lineas l where l.parte_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_lineas) e where nullif(e->>'id', '')::uuid = l.id);
  end if;

  update pnl_lineas l set
    panel_id = (e->>'panel_id')::uuid,
    buenos = coalesce((e->>'buenos')::int, 0),
    rechazados = coalesce((e->>'rechazados')::int, 0),
    proyecto_id = nullif(e->>'proyecto_id', '')::uuid,
    pnl_proyecto_id = nullif(e->>'pnl_proyecto_id', '')::uuid,
    sap_proyecto_codigo = nullif(e->>'sap_proyecto_codigo', ''),
    referencia = nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where p_parte_id is not null and l.parte_id = v_id and l.id = nullif(e->>'id', '')::uuid;

  insert into pnl_lineas (parte_id, panel_id, buenos, rechazados, proyecto_id, pnl_proyecto_id, sap_proyecto_codigo, referencia)
  select v_id, (e->>'panel_id')::uuid, coalesce((e->>'buenos')::int, 0), coalesce((e->>'rechazados')::int, 0),
         nullif(e->>'proyecto_id', '')::uuid, nullif(e->>'pnl_proyecto_id', '')::uuid, nullif(e->>'sap_proyecto_codigo', ''),
         nullif(btrim(e->>'referencia'), '')
  from jsonb_array_elements(p_lineas) e
  where nullif(e->>'id', '') is null
     or not exists (select 1 from pnl_lineas l where l.id = nullif(e->>'id', '')::uuid and l.parte_id = v_id);

  return v_id;
end $$;

revoke execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb) from public, anon;
grant  execute on function public.pnl_guardar_parte(uuid, date, time, time, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Portal Ingreso de Personal: ajustes según la respuesta de Bodega/Prevención (2026-10-21).
--
--   - La inducción de seguridad es el IRL (informar riesgos laborales), primera inducción de
--     obligación legal: cambia el título de la tarea, también en los ingresos ya creados.
--   - El uniforme lleva polar en vez de chaqueta (se sigue guardando en talla_chaqueta): cambia el
--     texto del correo a Bodega.
--
-- Va después de 20261031120000_ingreso_personal_formulario.sql (redefine dos de sus funciones).
-- Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

create or replace function public.ing_catalogo_tareas()
returns table (tipo text, area text, titulo text, evidencia boolean, orden int)
language sql immutable as $$
  values
    ('contrato',   'rrhh',       'Contrato y anexos firmados',                                   true,  1),
    ('bienvenida', 'rrhh',       'Inducción de bienvenida',                                      false, 2),
    ('ti',         'ti',         'Crear correo y accesos, entregar equipo',                      false, 3),
    ('epp',        'bodega',     'Entregar EPP con acta de entrega firmada',                     true,  4),
    ('uniforme',   'bodega',     'Entregar uniforme',                                            false, 5),
    ('induccion',  'prevencion', 'IRL: informar riesgos laborales, con registro firmado',        true,  6),
    ('vehiculo',   'jefatura',   'Verificar licencia y autorizar conducción',                    true,  7)
$$;

update public.ing_tareas t set titulo = c.titulo
from public.ing_catalogo_tareas() c
where c.tipo = t.tipo and t.tipo = 'induccion' and t.titulo is distinct from c.titulo;

create or replace function public.ing_detalle_tarea_html(p_tipo text, p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when d.texto is null then '' else '<p style="margin:0 0 12px">' || ing_html(d.texto) || '</p>' end
  from ing_ingresos i
  cross join lateral (select nullif(case p_tipo
    when 'ti' then concat_ws(' · ',
      case when i.ti_correo then 'Correo' end, case when i.ti_notebook then 'Notebook' end,
      case when i.ti_pantalla then 'Pantalla' end, 'Otros: ' || i.ti_otros)
    when 'epp' then concat_ws(' · ', 'Zapato ' || i.talla_zapato, i.tallas)
    when 'uniforme' then concat_ws(' · ', 'Polera ' || i.talla_polera, 'Pantalón ' || i.talla_pantalon,
      'Polar ' || i.talla_chaqueta, i.tallas)
    when 'vehiculo' then 'Licencia o certificación: ' || i.licencia_requerida
    end, '') as texto) d
  where i.id = p_ingreso_id
$$;

revoke execute on function public.ing_detalle_tarea_html(text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

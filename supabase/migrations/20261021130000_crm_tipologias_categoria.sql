-- CRM: categoría de cada tipología VIT, para agrupar el desplegable (Viviendas Panelizadas,
-- Viviendas Modulares, Edificios Modulares). Re-ejecutable. Las tipologías sin categoría se
-- muestran al final, en "Otras".
alter table public.tipologia_vit_precios add column if not exists categoria text;

update public.tipologia_vit_precios set categoria = 'Viviendas Panelizadas'
 where tipologia in ('Ñandu RD', 'Ñandu PV', 'Urbana Aislada', 'Urbana Pareada', 'Urbana Ampliación',
                     'Ñandu RD Austral', 'Ñandu PV Austral', 'Urbana Aislada Austral', 'Urbana Pareada Austral',
                     'Urbana Austral Ampliación');

update public.tipologia_vit_precios set categoria = 'Viviendas Modulares'
 where tipologia in ('T01 Central Zona A-E', 'T01 Austral Zona F-G');

update public.tipologia_vit_precios set categoria = 'Edificios Modulares'
 where tipologia in ('Pequeños Condominios (3 Pisos)', 'Edificio T04 (4 Pisos)', 'Edificio T05 (5 Pisos)');

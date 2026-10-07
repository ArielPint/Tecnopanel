-- Logistica > Registro GD: una solicitud de materiales puede repartirse en varias guias (una guia
-- admite entre 20 y 25 productos). Cada linea de registro_compras guarda el N° de solicitud de la que
-- salio, para que al cargar la misma solicitud en otra guia se descuente lo ya cargado.
--
-- Nullable: las guias anteriores a este cambio quedan sin vinculo.
-- Re-ejecutable.
set client_encoding = 'UTF8';

begin;

alter table public.registro_compras add column if not exists solicitud_numero integer;

create index if not exists registro_compras_solicitud_numero_idx
  on public.registro_compras (proyecto_id, solicitud_numero)
  where solicitud_numero is not null;

commit;

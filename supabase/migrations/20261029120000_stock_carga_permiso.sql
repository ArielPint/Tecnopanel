-- Carga del Excel de stock (Solicitudes > Stock) para quien tiene esa pestaña, no solo admins.
-- La carga hace upsert (INSERT ... ON CONFLICT DO UPDATE): Postgres exige la política de INSERT
-- aunque el código ya exista, y estaba restringida a es_admin_portal(). Un usuario con
-- 'solicitudes:stock' veía la pestaña pero la carga fallaba por RLS (2026-10-20, gpino).
-- UPDATE ya lo permite tiene_modulo('solicitudes'); DELETE sigue solo para admins.
-- Re-ejecutable.

drop policy if exists stock_productos_insert on public.stock_productos;
create policy stock_productos_insert on public.stock_productos
  for insert to authenticated
  with check (public.es_admin_portal() or public.tiene_modulo(array['solicitudes:stock']));

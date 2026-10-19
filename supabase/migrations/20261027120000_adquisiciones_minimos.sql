-- Adquisiciones: los minimos de Reposicion los define solo Compras (sobre las migraciones *_adquisiciones*.sql
-- anteriores, que van antes). Bodega sigue viendo la reposicion de su sucursal y creando solicitudes de
-- reposicion, pero ya no cambia minimos ni cantidades a pedir. Igual que en 20261018120000_adquisiciones_sucursal.sql
-- salvo el permiso: adq_compras_de (comprador o jefe de compras de la sucursal de la bodega).
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

create or replace function public.adq_guardar_reposicion(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from jsonb_array_elements(p) f
             where not adq_compras_de(coalesce(adq_bodega_sucursal(f ->> 'bodega_codigo'), '-'))) then
    raise exception 'Solo Compras de esa sucursal define los mínimos de reposición' using errcode = '42501';
  end if;
  delete from adq_reposicion a
  using jsonb_array_elements(p) f
  where a.articulo_codigo = f ->> 'articulo_codigo' and a.bodega_codigo = f ->> 'bodega_codigo' and (f ->> 'minimo') is null;
  insert into adq_reposicion (articulo_codigo, bodega_codigo, minimo, reorden, actualizado_por, updated_at)
  select f ->> 'articulo_codigo', f ->> 'bodega_codigo', (f ->> 'minimo')::numeric, nullif((f ->> 'reorden')::numeric, 0), auth.uid(), now()
  from jsonb_array_elements(p) f
  where (f ->> 'minimo') is not null
  on conflict (articulo_codigo, bodega_codigo) do update
    set minimo = excluded.minimo, reorden = excluded.reorden, actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at;
end $$;

revoke execute on function public.adq_guardar_reposicion(jsonb) from public, anon;
grant execute on function public.adq_guardar_reposicion(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

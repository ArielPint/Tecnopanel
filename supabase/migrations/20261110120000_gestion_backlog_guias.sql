-- Gestion > Backlog: rebajar tambien lo despachado con guias (pedido del usuario 2026-10-23). SOLO EN EL SERVIDOR.
--   despachado       = guias de despacho (ODLN) - devoluciones (ORDN) del proyecto, neto con descuento
--   facturado_directo = facturas que no salen de una guia (lineas sin base en entrega), neto con descuento
--   backlog          = contratado - despachado - facturado_directo (lo calcula el frontend)
-- Lo facturado desde una guia ya esta en despachado: no se descuenta dos veces. Los anticipos no rebajan
-- (son pago adelantado, no algo entregado). facturado (criterio de sap_ventas) queda como informacion.
-- Va despues de 20261109120000_gestion_backlog_sap.sql. Re-ejecutable.
set client_encoding = 'UTF8';

alter table public.sap_backlog add column if not exists despachado numeric(16, 2) not null default 0;
alter table public.sap_backlog add column if not exists facturado_directo numeric(16, 2) not null default 0;
alter table public.sap_backlog_estado add column if not exists despachado numeric(18, 2) not null default 0;

-- p = { "filas": [ {..., contratado, facturado, despachado, facturado_directo}, ... ] }
create or replace function public.sap_backlog_sincronizar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_proyectos integer;
  v_contratado numeric;
  v_facturado numeric;
  v_despachado numeric;
begin
  if jsonb_typeof(p -> 'filas') is distinct from 'array' or jsonb_array_length(p -> 'filas') = 0 then
    raise exception 'sap_backlog_sincronizar: sin filas, no se reemplaza nada';
  end if;

  delete from public.sap_backlog where true;
  insert into public.sap_backlog (proyecto_codigo, proyecto_nombre, cliente_codigo, cliente_nombre, ceco, linea,
                                  sucursal, pedidos_abiertos, primer_pedido, ultimo_pedido, contratado, facturado,
                                  despachado, facturado_directo)
  select f ->> 'proyecto_codigo', nullif(f ->> 'proyecto_nombre', ''),
         coalesce(f ->> 'cliente_codigo', ''), nullif(f ->> 'cliente_nombre', ''),
         coalesce(f ->> 'ceco', ''), nullif(f ->> 'linea', ''), nullif(f ->> 'sucursal', ''),
         (f ->> 'pedidos_abiertos')::integer,
         nullif(f ->> 'primer_pedido', '')::date, nullif(f ->> 'ultimo_pedido', '')::date,
         (f ->> 'contratado')::numeric, (f ->> 'facturado')::numeric,
         coalesce((f ->> 'despachado')::numeric, 0), coalesce((f ->> 'facturado_directo')::numeric, 0)
  from jsonb_array_elements(p -> 'filas') f;

  select count(*), coalesce(sum(contratado), 0), coalesce(sum(facturado), 0), coalesce(sum(despachado), 0)
    into v_proyectos, v_contratado, v_facturado, v_despachado from public.sap_backlog;
  insert into public.sap_backlog_estado (id, sincronizado_en, proyectos, contratado, facturado, despachado)
  values (true, now(), v_proyectos, v_contratado, v_facturado, v_despachado)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, proyectos = excluded.proyectos,
                                 contratado = excluded.contratado, facturado = excluded.facturado,
                                 despachado = excluded.despachado;
  return jsonb_build_object('proyectos', v_proyectos, 'contratado', v_contratado, 'facturado', v_facturado,
                            'despachado', v_despachado);
end;
$$;
revoke all on function public.sap_backlog_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_backlog_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

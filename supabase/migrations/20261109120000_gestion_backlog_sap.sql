-- Gestion > Backlog: lo contratado que falta por facturar, por proyecto, desde SAP. SOLO EN EL SERVIDOR
-- (Supabase no tiene sap_ventas; ahi el frontend avisa que el backlog solo esta en el servidor).
--
-- Una fila por proyecto de SAP que tiene al menos una nota de venta (pedido) abierta:
--   contratado = notas de venta no anuladas del proyecto (abiertas y cerradas), neto con descuento
--   facturado  = facturas + anticipos - notas de credito del proyecto, con el criterio de sap_ventas
--   backlog    = contratado - facturado (lo calcula el frontend)
-- Cuando SAP cierra el ultimo pedido abierto, el proyecto sale del backlog (decision del usuario
-- 2026-10-23: con pedidos cerrados el saldo suele ser falso: facturas sin proyecto o cierres a mano).
-- Linea y sucursal: las del centro de costo con mas monto en los pedidos del proyecto.
--
-- Lo llena tareas\sincronizar-sap-ventas.ps1 (misma tarea horaria que las ventas) con la RPC
-- sap_backlog_sincronizar (service_role), que reemplaza todo. Re-ejecutable.
set client_encoding = 'UTF8';

create table if not exists public.sap_backlog (
  proyecto_codigo  text primary key,
  proyecto_nombre  text,
  cliente_codigo   text not null default '',
  cliente_nombre   text,
  ceco             text not null default '',
  linea            text,
  sucursal         text check (sucursal in ('Santiago', 'Puerto Varas')),
  pedidos_abiertos integer not null,
  primer_pedido    date,
  ultimo_pedido    date,
  contratado       numeric(16, 2) not null,
  facturado        numeric(16, 2) not null
);

create table if not exists public.sap_backlog_estado (
  id               boolean primary key default true check (id),
  sincronizado_en  timestamptz not null,
  proyectos        integer not null,
  contratado       numeric(18, 2) not null,
  facturado        numeric(18, 2) not null
);

alter table public.sap_backlog enable row level security;
alter table public.sap_backlog_estado enable row level security;

-- Mismo acceso que Gestion > Ventas (sap_ventas_visible: Gestion y por sucursal).
drop policy if exists sap_backlog_select on public.sap_backlog;
create policy sap_backlog_select on public.sap_backlog for select to authenticated
  using (public.sap_ventas_visible(sucursal));

drop policy if exists sap_backlog_estado_select on public.sap_backlog_estado;
create policy sap_backlog_estado_select on public.sap_backlog_estado for select to authenticated
  using (public.sap_ventas_visible(null));

revoke all on public.sap_backlog, public.sap_backlog_estado from anon, authenticated;
grant select on public.sap_backlog, public.sap_backlog_estado to authenticated;

-- p = { "filas": [ {proyecto_codigo, proyecto_nombre, cliente_codigo, cliente_nombre, ceco, linea, sucursal,
--                    pedidos_abiertos, primer_pedido:'2026-01-31', ultimo_pedido, contratado, facturado}, ... ] }
create or replace function public.sap_backlog_sincronizar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_proyectos integer;
  v_contratado numeric;
  v_facturado numeric;
begin
  if jsonb_typeof(p -> 'filas') is distinct from 'array' or jsonb_array_length(p -> 'filas') = 0 then
    raise exception 'sap_backlog_sincronizar: sin filas, no se reemplaza nada';
  end if;

  delete from public.sap_backlog where true;
  insert into public.sap_backlog (proyecto_codigo, proyecto_nombre, cliente_codigo, cliente_nombre, ceco, linea,
                                  sucursal, pedidos_abiertos, primer_pedido, ultimo_pedido, contratado, facturado)
  select f ->> 'proyecto_codigo', nullif(f ->> 'proyecto_nombre', ''),
         coalesce(f ->> 'cliente_codigo', ''), nullif(f ->> 'cliente_nombre', ''),
         coalesce(f ->> 'ceco', ''), nullif(f ->> 'linea', ''), nullif(f ->> 'sucursal', ''),
         (f ->> 'pedidos_abiertos')::integer,
         nullif(f ->> 'primer_pedido', '')::date, nullif(f ->> 'ultimo_pedido', '')::date,
         (f ->> 'contratado')::numeric, (f ->> 'facturado')::numeric
  from jsonb_array_elements(p -> 'filas') f;

  select count(*), coalesce(sum(contratado), 0), coalesce(sum(facturado), 0)
    into v_proyectos, v_contratado, v_facturado from public.sap_backlog;
  insert into public.sap_backlog_estado (id, sincronizado_en, proyectos, contratado, facturado)
  values (true, now(), v_proyectos, v_contratado, v_facturado)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, proyectos = excluded.proyectos,
                                 contratado = excluded.contratado, facturado = excluded.facturado;
  return jsonb_build_object('proyectos', v_proyectos, 'contratado', v_contratado, 'facturado', v_facturado);
end;
$$;
revoke all on function public.sap_backlog_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_backlog_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

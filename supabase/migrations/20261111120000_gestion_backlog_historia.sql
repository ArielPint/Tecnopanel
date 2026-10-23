-- Gestion > Backlog: analisis y tendencias (pedido del usuario 2026-10-23, opcion C). SOLO EN EL SERVIDOR.
--
-- Dos fuentes para la historia del backlog:
--   1) Reconstruida desde SAP (aproximada): movimientos de todos los proyectos con nota de venta, para
--      calcular el backlog a cualquier fecha pasada en el navegador:
--        sap_backlog_proyecto  proyecto -> cliente, CECO, linea, sucursal (los de mas monto en sus pedidos)
--        sap_backlog_nv        cada nota de venta por proyecto: fecha, monto y cierre. SAP no guarda la fecha
--                              de cierre: se usa la ultima modificacion (UpdateDate) de las cerradas.
--        sap_backlog_mov       guias (despacho), devoluciones y facturas sin guia por proyecto y dia
--   2) Foto diaria (oficial desde 2026-10-23): sap_backlog_foto, una copia por dia de sap_backlog que deja
--      sap_backlog_sincronizar (la ultima sincronizacion del dia queda).
-- La sincronizacion horaria de ventas (tareas\sincronizar-sap-ventas.ps1) llena todo.
-- Va despues de 20261110120000_gestion_backlog_guias.sql. Re-ejecutable.
set client_encoding = 'UTF8';

-- Sucursales que el usuario ve en Gestion (mismo criterio que sap_ventas_visible), una sola vez por consulta
-- (subselect en las politicas): '{}' sin acceso a Gestion.
create or replace function public.sap_gestion_sucursales()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select case
    when not public.sap_ventas_visible(null) then '{}'::text[]
    when public.ve_todas_sucursales() or public.mi_sucursal() is null then array['Santiago', 'Puerto Varas']
    else array[public.mi_sucursal()]
  end;
$$;
revoke all on function public.sap_gestion_sucursales() from public, anon;
grant execute on function public.sap_gestion_sucursales() to authenticated;

create table if not exists public.sap_backlog_proyecto (
  proyecto_codigo  text primary key,
  proyecto_nombre  text,
  cliente_codigo   text not null default '',
  cliente_nombre   text,
  ceco             text not null default '',
  linea            text,
  sucursal         text check (sucursal in ('Santiago', 'Puerto Varas'))
);

create table if not exists public.sap_backlog_nv (
  doc_entry        integer not null,
  proyecto_codigo  text    not null,
  fecha            date    not null,
  cierre           date,                -- null = abierta; si no, UpdateDate de SAP (aproximado)
  monto            numeric(16, 2) not null,
  sucursal         text,
  primary key (doc_entry, proyecto_codigo)
);

create table if not exists public.sap_backlog_mov (
  proyecto_codigo  text not null,
  fecha            date not null,
  tipo             text not null check (tipo in ('despacho', 'devolucion', 'factura_directa')),
  monto            numeric(16, 2) not null,  -- positivo siempre; la devolucion resta al despachado
  sucursal         text,
  primary key (proyecto_codigo, fecha, tipo)
);

create table if not exists public.sap_backlog_foto (
  fecha             date not null,
  proyecto_codigo   text not null,
  contratado        numeric(16, 2) not null,
  despachado        numeric(16, 2) not null,
  facturado_directo numeric(16, 2) not null,
  sucursal          text,
  primary key (fecha, proyecto_codigo)
);

alter table public.sap_backlog_proyecto enable row level security;
alter table public.sap_backlog_nv enable row level security;
alter table public.sap_backlog_mov enable row level security;
alter table public.sap_backlog_foto enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sap_backlog_proyecto', 'sap_backlog_nv', 'sap_backlog_mov', 'sap_backlog_foto'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated
                      using (sucursal = any ((select public.sap_gestion_sucursales())::text[])
                             or (sucursal is null and cardinality((select public.sap_gestion_sucursales())) > 0))',
                   t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create index if not exists sap_backlog_foto_proyecto on public.sap_backlog_foto (proyecto_codigo, fecha);

-- Fotos a fechas pedidas: para cada fecha, la foto mas reciente de esa fecha o de hasta 6 dias antes
-- (si el servidor no sincronizo justo ese dia). Respeta RLS (security invoker).
create or replace function public.sap_backlog_fotos(p_fechas date[])
returns table (fecha_pedida date, fecha_foto date, proyecto_codigo text, contratado numeric, despachado numeric,
               facturado_directo numeric)
language sql stable security invoker
set search_path = public
as $$
  with pedidas as (select distinct unnest(p_fechas) as d),
  elegida as (
    select p.d, (select max(f.fecha) from public.sap_backlog_foto f where f.fecha <= p.d and f.fecha > p.d - 7) as ff
    from pedidas p
  )
  select e.d, e.ff, f.proyecto_codigo, f.contratado, f.despachado, f.facturado_directo
  from elegida e join public.sap_backlog_foto f on f.fecha = e.ff;
$$;
revoke all on function public.sap_backlog_fotos(date[]) from public, anon;
grant execute on function public.sap_backlog_fotos(date[]) to authenticated;

-- El backlog actual ahora tambien deja la foto del dia (hora de Chile).
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
  v_hoy date := (now() at time zone 'America/Santiago')::date;
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

  delete from public.sap_backlog_foto where fecha = v_hoy;
  insert into public.sap_backlog_foto (fecha, proyecto_codigo, contratado, despachado, facturado_directo, sucursal)
  select v_hoy, proyecto_codigo, contratado, despachado, facturado_directo, sucursal from public.sap_backlog;

  select count(*), coalesce(sum(contratado), 0), coalesce(sum(facturado), 0), coalesce(sum(despachado), 0)
    into v_proyectos, v_contratado, v_facturado, v_despachado from public.sap_backlog;
  insert into public.sap_backlog_estado (id, sincronizado_en, proyectos, contratado, facturado, despachado)
  values (true, now(), v_proyectos, v_contratado, v_facturado, v_despachado)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, proyectos = excluded.proyectos,
                                 contratado = excluded.contratado, facturado = excluded.facturado,
                                 despachado = excluded.despachado;
  return jsonb_build_object('proyectos', v_proyectos, 'contratado', v_contratado, 'facturado', v_facturado,
                            'despachado', v_despachado, 'foto', v_hoy);
end;
$$;
revoke all on function public.sap_backlog_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_backlog_sincronizar(jsonb) to service_role;

-- p = { "proyectos": [ {proyecto_codigo, proyecto_nombre, cliente_codigo, cliente_nombre, ceco, linea, sucursal} ],
--       "nv":  [ {doc_entry, proyecto_codigo, fecha:'2026-03-30', cierre, monto} ],
--       "mov": [ {proyecto_codigo, fecha, tipo, monto} ] }      reemplaza todo
create or replace function public.sap_backlog_historia_sincronizar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_proyectos integer;
  v_nv integer;
  v_mov integer;
begin
  if jsonb_typeof(p -> 'proyectos') is distinct from 'array' or jsonb_array_length(p -> 'proyectos') = 0
     or jsonb_typeof(p -> 'nv') is distinct from 'array' or jsonb_array_length(p -> 'nv') = 0
     or jsonb_typeof(p -> 'mov') is distinct from 'array' then
    raise exception 'sap_backlog_historia_sincronizar: faltan proyectos o notas de venta, no se reemplaza nada';
  end if;

  delete from public.sap_backlog_proyecto where true;
  insert into public.sap_backlog_proyecto (proyecto_codigo, proyecto_nombre, cliente_codigo, cliente_nombre, ceco, linea, sucursal)
  select f ->> 'proyecto_codigo', nullif(f ->> 'proyecto_nombre', ''), coalesce(f ->> 'cliente_codigo', ''),
         nullif(f ->> 'cliente_nombre', ''), coalesce(f ->> 'ceco', ''), nullif(f ->> 'linea', ''), nullif(f ->> 'sucursal', '')
  from jsonb_array_elements(p -> 'proyectos') f;

  delete from public.sap_backlog_nv where true;
  insert into public.sap_backlog_nv (doc_entry, proyecto_codigo, fecha, cierre, monto, sucursal)
  select (f ->> 'doc_entry')::integer, f ->> 'proyecto_codigo', (f ->> 'fecha')::date, nullif(f ->> 'cierre', '')::date,
         (f ->> 'monto')::numeric, pr.sucursal
  from jsonb_array_elements(p -> 'nv') f
  left join public.sap_backlog_proyecto pr on pr.proyecto_codigo = f ->> 'proyecto_codigo';

  delete from public.sap_backlog_mov where true;
  insert into public.sap_backlog_mov (proyecto_codigo, fecha, tipo, monto, sucursal)
  select f ->> 'proyecto_codigo', (f ->> 'fecha')::date, f ->> 'tipo', (f ->> 'monto')::numeric, pr.sucursal
  from jsonb_array_elements(p -> 'mov') f
  left join public.sap_backlog_proyecto pr on pr.proyecto_codigo = f ->> 'proyecto_codigo';

  select count(*) into v_proyectos from public.sap_backlog_proyecto;
  select count(*) into v_nv from public.sap_backlog_nv;
  select count(*) into v_mov from public.sap_backlog_mov;
  return jsonb_build_object('proyectos', v_proyectos, 'nv', v_nv, 'mov', v_mov);
end;
$$;
revoke all on function public.sap_backlog_historia_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_backlog_historia_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

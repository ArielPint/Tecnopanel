-- Adquisiciones: Planificacion de materiales y Planes de Compra (sobre 20261022120000_adquisiciones_bodega.sql
-- y las anteriores, que van antes). Segunda entrega de lo que se trae de TP Control Tower.
--
-- Planificacion (adq_planificar), por bodega (B006 Santiago, B007 Puerto Varas):
--   requerimiento  lo que falta emitir de las ordenes de fabricacion abiertas de SAP en esa bodega, creadas
--                  desde p_desde (SAP tiene ordenes de anios anteriores que nunca se cerraron):
--                    - ordenes de obra (articulo 99999999, una por proyecto): las que se elijan (todas por defecto)
--                    - ordenes de kits y paneles ya liberadas: siempre (SAP no las asocia a una obra)
--                  + simulacion: N viviendas como la orden de una obra abierta
--                  Lo que tiene receta (kits, paneles) se cubre primero con su stock y con sus ordenes abiertas;
--                  lo que queda sin cubrir se explota por la receta, nivel por nivel (codigo de nivel mas bajo),
--                  para no contar dos veces. El resultado solo trae lo que no se fabrica (lo que se compra) y es
--                  de inventario: maquilas, fletes y gastos van en las ordenes como montos y no se planifican.
--   disponible real = max(stock usado - inutilizable, 0) - comprometido de bodega (Bodega, 20261022120000)
--   OC pendiente   todo saldo de lineas de OC abiertas de la bodega, aunque este atrasado: cubre la necesidad;
--                  la fecha comprometida solo clasifica (atrasada, en plazo, posterior a la necesidad, sin fecha)
--   en solicitud   lo ya pedido en solicitudes abiertas del portal de esa sucursal, para no pedirlo dos veces
--   minimo         el de Reposicion (adq_reposicion); sin minimo, 0
--   compra sugerida = max(requerimiento + minimo - disponible real - OC pendiente - en solicitud, 0)
--   saldo despues   = disponible real + OC pendiente - requerimiento
--   estado          critico: hay que comprar y no queda disponible en bodega; comprar: hay que comprar;
--                   en_solicitud: falta, pero ya esta pedido en solicitudes abiertas; cubierto: no hay que comprar
-- Planes de compra: version por bodega, anio y mes (no se pisan), lineas congeladas al guardar, OC de SAP
--   asociadas a mano y solicitudes creadas desde el plan (adq_solicitudes.plan_id); seguimiento de lo
--   planificado contra lo pedido, comprado y recibido.
-- Ven: Compras y Bodega de la sucursal de la bodega, y los aprobadores. Guardan y gestionan planes: Compras.
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- tablas

create table if not exists public.adq_planes (
  id              uuid primary key default gen_random_uuid(),
  numero          int generated always as identity unique,
  bodega_codigo   text not null check (bodega_codigo in ('B006', 'B007')),
  sucursal        text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  anio            int  not null check (anio between 2020 and 2100),
  mes             int  not null check (mes between 1 and 12),
  version         int  not null check (version > 0),
  estado          text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  fecha_necesidad date,
  ot_desde        date,                         -- ordenes de fabricacion consideradas desde esa fecha
  obras           text[],                       -- proyectos de SAP considerados; null = todas las obras abiertas
  simulacion      jsonb not null default '[]',  -- [{proyecto_codigo, proyecto_nombre, cantidad}]
  nota            text,
  creado_por      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  cerrado_por     uuid references auth.users(id),
  cerrado_at      timestamptz,
  unique (bodega_codigo, anio, mes, version)
);

create table if not exists public.adq_plan_lineas (
  plan_id         uuid not null references public.adq_planes(id) on delete cascade,
  articulo_codigo text not null,
  articulo_nombre text,
  unidad          text,
  requerimiento   numeric(18, 4) not null default 0,
  disponible_real numeric(18, 4) not null default 0,
  oc_pendiente    numeric(18, 4) not null default 0,
  en_solicitud    numeric(18, 4) not null default 0,
  minimo          numeric(18, 4) not null default 0,
  sugerido        numeric(18, 4) not null default 0,
  planificado     numeric(18, 4) not null check (planificado >= 0),   -- lo aprobado para comprar
  precio_ref      numeric(18, 4),
  proveedor_ref   text,
  alerta_oc       text,
  primary key (plan_id, articulo_codigo)
);

create table if not exists public.adq_plan_oc (
  plan_id       uuid not null references public.adq_planes(id) on delete cascade,
  docnum        int  not null check (docnum > 0),
  vinculado_por uuid default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (plan_id, docnum)
);
create index if not exists adq_plan_oc_docnum_idx on public.adq_plan_oc (docnum);
alter table public.adq_planes add column if not exists ot_desde date;

alter table public.adq_solicitudes add column if not exists plan_id uuid;
do $$ begin
  alter table public.adq_solicitudes add constraint adq_solicitudes_plan_fk
    foreign key (plan_id) references public.adq_planes(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists adq_solicitudes_plan_idx on public.adq_solicitudes (plan_id);

-- ---------------------------------------------------------------- quien ve

create or replace function public.adq_ve_planificacion_en(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_ve_reposicion_en(p_sucursal) or adq_ve_control_en(p_sucursal)
$$;

-- ---------------------------------------------------------------- calculo

-- p_obras: proyectos de SAP de las ordenes de obra a considerar (null = todas las abiertas de la bodega).
-- p_simulacion: [{proyecto_codigo, cantidad}] = cantidad de viviendas como la orden de obra de ese proyecto.
-- p_fecha: fecha en que se necesitan los materiales (clasifica las OC; null = sin fecha de necesidad).
-- p_desde: solo ordenes de fabricacion creadas desde esa fecha (null = todas las abiertas).
drop function if exists public.adq_planificar(text, text[], jsonb, date);
create or replace function public.adq_planificar(p_bodega text, p_obras text[] default null,
                                                 p_simulacion jsonb default '[]', p_fecha date default null,
                                                 p_desde date default null)
returns table (
  articulo_codigo text, articulo_nombre text, unidad text, grupo text,
  requerimiento numeric, req_simulacion numeric,
  stock_sap numeric, comprometido_sap numeric, stock_fisico numeric, inutilizable numeric, comprometido_bodega numeric,
  fuente_stock text, estado_conteo text, disponible_real numeric,
  oc_pendiente numeric, oc_atrasada numeric, oc_en_plazo numeric, oc_posterior numeric, oc_sin_fecha numeric,
  en_solicitud numeric, minimo numeric, compra_sugerida numeric, saldo_despues numeric,
  consumo_mensual numeric, cobertura_meses numeric, estado text, alerta_oc text,
  ultimo_precio numeric, ultimo_proveedor text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_suc text := adq_bodega_sucursal(p_bodega);
  v_nivel int;
  v_max int;
begin
  if v_suc is null then raise exception 'Bodega % no válida', p_bodega using errcode = '22023'; end if;
  if not adq_ve_planificacion_en(v_suc) then
    raise exception 'No tienes acceso a la planificación de %', v_suc using errcode = '42501';
  end if;

  -- demanda: real (ordenes de SAP) y simulada, por articulo
  create temp table if not exists _adq_dem (articulo text, real numeric, sim numeric) on commit drop;
  truncate _adq_dem;

  insert into _adq_dem
  select l.articulo_codigo, l.planificado - l.emitido, 0
  from sap_ot o join sap_ot_lineas l on l.doc_entry = o.doc_entry
  where coalesce(l.bodega_codigo, o.bodega_codigo) = p_bodega and l.planificado > l.emitido and l.inventariable
    and (p_desde is null or o.fecha >= p_desde)
    and (o.articulo_codigo <> '99999999' or p_obras is null or o.proyecto_codigo = any (p_obras));

  insert into _adq_dem
  select l.articulo_codigo, 0, l.planificado / nullif(o.cantidad, 0) * (s ->> 'cantidad')::numeric
  from jsonb_array_elements(coalesce(p_simulacion, '[]')) s
  join sap_ot o on o.proyecto_codigo = s ->> 'proyecto_codigo' and o.articulo_codigo = '99999999'
  join sap_ot_lineas l on l.doc_entry = o.doc_entry and l.inventariable
  where coalesce((s ->> 'cantidad')::numeric, 0) > 0
    -- una sola orden por proyecto como modelo (la mas reciente)
    and o.doc_entry = (select max(x.doc_entry) from sap_ot x where x.proyecto_codigo = o.proyecto_codigo and x.articulo_codigo = '99999999');

  -- lo que se fabrica: cubrir con stock y ordenes abiertas, y explotar el resto por la receta
  create temp table if not exists _adq_nivel (articulo text primary key, nivel int) on commit drop;
  truncate _adq_nivel;
  insert into _adq_nivel
  with recursive arbol(articulo, nivel) as (
    select distinct r.padre_codigo, 0 from sap_recetas r
    union all
    select r.componente_codigo, a.nivel + 1 from arbol a join sap_recetas r on r.padre_codigo = a.articulo where a.nivel < 8
  )
  select a.articulo, max(a.nivel) from arbol a
  where exists (select 1 from sap_recetas r where r.padre_codigo = a.articulo)
  group by a.articulo;

  select coalesce(max(n.nivel), -1) into v_max from _adq_nivel n;
  for v_nivel in 0 .. v_max loop
    insert into _adq_dem
    with g as (
      select d.articulo, sum(d.real) as real, sum(d.sim) as sim
      from _adq_dem d join _adq_nivel n on n.articulo = d.articulo and n.nivel = v_nivel
      group by d.articulo
    ), c as (
      select g.articulo, g.real, g.sim,
        greatest(coalesce(
          greatest(coalesce(b.stock_fisico, st.en_stock, 0) - coalesce(b.inutilizable, 0), 0) - coalesce(b.comprometido, 0), 0), 0)
        + coalesce((select sum(greatest(o.cantidad - o.completada, 0)) from sap_ot o
                    where o.articulo_codigo = g.articulo and o.bodega_codigo = p_bodega
                      and (p_desde is null or o.fecha >= p_desde)), 0) as oferta
      from g
      left join sap_stock st on st.articulo_codigo = g.articulo and st.bodega_codigo = p_bodega
      left join adq_bodega_stock b on b.articulo_codigo = g.articulo and b.bodega_codigo = p_bodega
    ), sin_cubrir as (
      -- la oferta cubre primero lo real; lo simulado va despues
      select c.articulo, greatest(c.real - c.oferta, 0) as real,
             greatest(c.sim - greatest(c.oferta - c.real, 0), 0) as sim
      from c
    )
    select r.componente_codigo, s.real * r.cantidad, s.sim * r.cantidad
    from sin_cubrir s join sap_recetas r on r.padre_codigo = s.articulo and r.inventariable
    where s.real > 0 or s.sim > 0;
  end loop;

  return query
  with dem as (
    select d.articulo, sum(d.real + d.sim) as req, sum(d.sim) as sim
    from _adq_dem d
    where not exists (select 1 from _adq_nivel n where n.articulo = d.articulo)
    group by d.articulo
    having sum(d.real + d.sim) > 0.00005
  ), oc as (
    select l.articulo_codigo as articulo, sum(l.pendiente) as total,
      sum(l.pendiente) filter (where o.fecha_entrega < adq_hoy()) as atrasada,
      sum(l.pendiente) filter (where o.fecha_entrega >= adq_hoy() and (p_fecha is null or o.fecha_entrega <= p_fecha)) as en_plazo,
      sum(l.pendiente) filter (where p_fecha is not null and o.fecha_entrega > p_fecha and o.fecha_entrega >= adq_hoy()) as posterior,
      sum(l.pendiente) filter (where o.fecha_entrega is null) as sin_fecha
    from sap_oc_lineas l join sap_oc o on o.doc_entry = l.doc_entry
    where l.abierta and not o.cancelada and l.pendiente > 0 and l.bodega = p_bodega
    group by l.articulo_codigo
  ), sol as (
    select i.articulo_codigo as articulo, sum(i.cantidad) as cantidad
    from adq_items i join adq_solicitudes s on s.id = i.solicitud_id
    where s.sucursal = v_suc and s.estado in ('cotizando', 'en_aprobacion', 'aprobada')
    group by i.articulo_codigo
  ), base as (
    select d.articulo, d.req, d.sim,
      coalesce(a.nombre, st.articulo_nombre, rc.componente_nombre, d.articulo) as nombre,
      coalesce(st.unidad, a.unidad, rc.unidad) as unidad, coalesce(st.grupo, a.grupo) as grupo,
      coalesce(st.en_stock, 0) as stock_sap, coalesce(st.comprometido, 0) as comprometido_sap,
      b.stock_fisico, coalesce(b.inutilizable, 0) as inutilizable, b.comprometido as comprometido_bodega, b.contado_at,
      coalesce(oc.total, 0) as oc_total, coalesce(oc.atrasada, 0) as oc_atrasada, coalesce(oc.en_plazo, 0) as oc_en_plazo,
      coalesce(oc.posterior, 0) as oc_posterior, coalesce(oc.sin_fecha, 0) as oc_sin_fecha,
      coalesce(sol.cantidad, 0) as en_sol, coalesce(rp.minimo, 0) as minimo,
      round(coalesce(cs.salidas_12m, 0) / 12, 4) as consumo,
      a.ultimo_precio, rcp.proveedor_nombre as proveedor
    from dem d
    left join sap_stock st on st.articulo_codigo = d.articulo and st.bodega_codigo = p_bodega
    left join sap_articulos a on a.codigo = d.articulo
    left join lateral (select r.componente_nombre, r.unidad from sap_recetas r where r.componente_codigo = d.articulo limit 1) rc on true
    left join adq_bodega_stock b on b.articulo_codigo = d.articulo and b.bodega_codigo = p_bodega
    left join oc on oc.articulo = d.articulo
    left join sol on sol.articulo = d.articulo
    left join adq_reposicion rp on rp.articulo_codigo = d.articulo and rp.bodega_codigo = p_bodega
    left join sap_consumo cs on cs.articulo_codigo = d.articulo and cs.bodega_codigo = p_bodega
    left join sap_recepciones rcp on rcp.articulo_codigo = d.articulo and rcp.bodega_codigo = p_bodega
  ), calc as (
    select x.*,
      greatest(coalesce(x.stock_fisico, x.stock_sap) - x.inutilizable, 0) - coalesce(x.comprometido_bodega, 0) as disp
    from base x
  ), fin as (
    select c.*,
      greatest(c.req + c.minimo - c.disp - c.oc_total - c.en_sol, 0) as sugerida,
      c.disp + c.oc_total - c.req as saldo
    from calc c
  )
  select f.articulo, f.nombre, f.unidad, f.grupo,
    round(f.req, 4), round(f.sim, 4),
    f.stock_sap, f.comprometido_sap, f.stock_fisico, f.inutilizable, f.comprometido_bodega,
    case when f.stock_fisico is null then 'SAP' else 'Físico' end,
    case when f.contado_at is null then 'sin_conteo'
         when adq_hoy() - (f.contado_at at time zone 'America/Santiago')::date <= 3 then 'vigente'
         when adq_hoy() - (f.contado_at at time zone 'America/Santiago')::date <= 7 then 'atencion'
         else 'desactualizado' end,
    round(f.disp, 4),
    f.oc_total, f.oc_atrasada, f.oc_en_plazo, f.oc_posterior, f.oc_sin_fecha,
    f.en_sol, f.minimo, round(f.sugerida, 4), round(f.saldo, 4),
    f.consumo, case when f.consumo > 0 then round(f.saldo / f.consumo, 1) end,
    case when f.sugerida > 0 and f.disp <= 0 then 'critico' when f.sugerida > 0 then 'comprar'
         when f.saldo < 0 then 'en_solicitud' else 'cubierto' end,
    case when f.oc_atrasada > 0 then 'OC atrasada' when f.oc_sin_fecha > 0 then 'OC sin fecha'
         when f.oc_posterior > 0 then 'OC posterior a la necesidad' when f.oc_total > 0 then 'OC pendiente' end,
    f.ultimo_precio, f.proveedor
  from fin f
  order by f.nombre;
end $$;

-- Obras con orden abierta en SAP (creada desde p_desde), para elegir en la planificacion
drop function if exists public.adq_obras_planificables(text);
create or replace function public.adq_obras_planificables(p_bodega text, p_desde date default null)
returns table (proyecto_codigo text, proyecto_nombre text, ordenes int, desde date, lineas_pendientes int, kits_pendientes numeric)
language sql stable security definer set search_path = public as $$
  select o.proyecto_codigo, max(o.proyecto_nombre), count(distinct o.doc_entry)::int, min(o.fecha),
    count(l.*) filter (where l.planificado > l.emitido and l.inventariable)::int,
    coalesce(sum(l.planificado - l.emitido) filter (where l.articulo_codigo like '6604%'), 0)
  from sap_ot o left join sap_ot_lineas l on l.doc_entry = o.doc_entry
  where o.articulo_codigo = '99999999' and o.proyecto_codigo is not null and (p_desde is null or o.fecha >= p_desde)
    and coalesce(l.bodega_codigo, o.bodega_codigo) = p_bodega
    and adq_ve_planificacion_en(adq_bodega_sucursal(p_bodega))
  group by o.proyecto_codigo
  order by min(o.fecha) desc
$$;

-- ---------------------------------------------------------------- planes de compra

-- p = {bodega_codigo, anio, mes, fecha_necesidad, obras, simulacion, nota, lineas: [{articulo_codigo, articulo_nombre,
--      unidad, requerimiento, disponible_real, oc_pendiente, en_solicitud, minimo, sugerido, planificado, precio_ref,
--      proveedor_ref, alerta_oc}]}. Devuelve el id del plan (version nueva; las anteriores no se tocan).
create or replace function public.adq_guardar_plan(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bod text := p ->> 'bodega_codigo';
  v_suc text := adq_bodega_sucursal(p ->> 'bodega_codigo');
  v_anio int := (p ->> 'anio')::int;
  v_mes int := (p ->> 'mes')::int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if v_suc is null then raise exception 'Bodega no válida' using errcode = '22023'; end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Compras de % guarda planes de compra', v_suc using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p -> 'lineas', '[]')) f where coalesce((f ->> 'planificado')::numeric, 0) > 0) then
    raise exception 'El plan no tiene cantidades a comprar' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('adq_plan:' || v_bod || ':' || v_anio || ':' || v_mes));

  insert into adq_planes (bodega_codigo, sucursal, anio, mes, version, fecha_necesidad, ot_desde, obras, simulacion, nota, creado_por)
  values (v_bod, v_suc, v_anio, v_mes,
          coalesce((select max(version) from adq_planes where bodega_codigo = v_bod and anio = v_anio and mes = v_mes), 0) + 1,
          nullif(p ->> 'fecha_necesidad', '')::date, nullif(p ->> 'ot_desde', '')::date,
          case when jsonb_typeof(p -> 'obras') = 'array' then array(select jsonb_array_elements_text(p -> 'obras')) end,
          coalesce(p -> 'simulacion', '[]'), nullif(btrim(coalesce(p ->> 'nota', '')), ''), auth.uid())
  returning id into v_id;

  insert into adq_plan_lineas (plan_id, articulo_codigo, articulo_nombre, unidad, requerimiento, disponible_real, oc_pendiente,
                               en_solicitud, minimo, sugerido, planificado, precio_ref, proveedor_ref, alerta_oc)
  select v_id, f ->> 'articulo_codigo', nullif(f ->> 'articulo_nombre', ''), nullif(f ->> 'unidad', ''),
         coalesce((f ->> 'requerimiento')::numeric, 0), coalesce((f ->> 'disponible_real')::numeric, 0),
         coalesce((f ->> 'oc_pendiente')::numeric, 0), coalesce((f ->> 'en_solicitud')::numeric, 0),
         coalesce((f ->> 'minimo')::numeric, 0), coalesce((f ->> 'sugerido')::numeric, 0),
         greatest(coalesce((f ->> 'planificado')::numeric, 0), 0), (f ->> 'precio_ref')::numeric,
         nullif(f ->> 'proveedor_ref', ''), nullif(f ->> 'alerta_oc', '')
  from jsonb_array_elements(p -> 'lineas') f
  where coalesce(f ->> 'articulo_codigo', '') <> ''
  on conflict do nothing;
  return v_id;
end $$;

create or replace function public.adq_plan_estado(p_plan_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare v_suc text;
begin
  select sucursal into v_suc from adq_planes where id = p_plan_id;
  if not found then raise exception 'Plan no encontrado' using errcode = 'P0002'; end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Compras de % gestiona sus planes', v_suc using errcode = '42501'; end if;
  if p_estado not in ('abierto', 'cerrado') then raise exception 'Estado no válido' using errcode = '22023'; end if;
  update adq_planes
  set estado = p_estado,
      cerrado_por = case when p_estado = 'cerrado' then auth.uid() end,
      cerrado_at = case when p_estado = 'cerrado' then now() end
  where id = p_plan_id;
end $$;

-- Asocia OC de SAP al plan. Cada OC tiene que existir, no estar cancelada y traer algun articulo del plan.
create or replace function public.adq_plan_vincular_oc(p_plan_id uuid, p_docnums int[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_suc text;
  v_malas text;
  v_n int;
begin
  select sucursal into v_suc from adq_planes where id = p_plan_id;
  if not found then raise exception 'Plan no encontrado' using errcode = 'P0002'; end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Compras de % gestiona sus planes', v_suc using errcode = '42501'; end if;
  select string_agg(d::text, ', ') into v_malas
  from unnest(p_docnums) d
  where not exists (select 1 from sap_oc o join sap_oc_lineas l on l.doc_entry = o.doc_entry
                    join adq_plan_lineas pl on pl.plan_id = p_plan_id and pl.articulo_codigo = l.articulo_codigo
                    where o.docnum = d and not o.cancelada);
  if v_malas is not null then
    raise exception 'Estas OC no existen en SAP, están canceladas o no traen materiales del plan: %', v_malas using errcode = 'P0001';
  end if;
  insert into adq_plan_oc (plan_id, docnum, vinculado_por)
  select p_plan_id, d, auth.uid() from unnest(p_docnums) d
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.adq_plan_desvincular_oc(p_plan_id uuid, p_docnum int)
returns void language plpgsql security definer set search_path = public as $$
declare v_suc text;
begin
  select sucursal into v_suc from adq_planes where id = p_plan_id;
  if not found then raise exception 'Plan no encontrado' using errcode = 'P0002'; end if;
  if not adq_compras_de(v_suc) then raise exception 'Solo Compras de % gestiona sus planes', v_suc using errcode = '42501'; end if;
  delete from adq_plan_oc where plan_id = p_plan_id and docnum = p_docnum;
end $$;

-- OC de SAP recientes con materiales del plan que todavia no estan asociadas (sugerencias; no se asocian solas)
create or replace function public.adq_plan_oc_candidatas(p_plan_id uuid)
returns table (docnum int, proveedor_nombre text, fecha date, fecha_entrega date, abierta boolean, articulos int, cantidad numeric)
language sql stable security definer set search_path = public as $$
  select o.docnum, o.proveedor_nombre, o.fecha, o.fecha_entrega, o.abierta, count(distinct l.articulo_codigo)::int, sum(l.cantidad)
  from adq_planes p
  join adq_plan_lineas pl on pl.plan_id = p.id
  join sap_oc_lineas l on l.articulo_codigo = pl.articulo_codigo and l.bodega = p.bodega_codigo
  join sap_oc o on o.doc_entry = l.doc_entry and not o.cancelada and o.fecha >= (p.created_at at time zone 'America/Santiago')::date - 7
  where p.id = p_plan_id and adq_ve_planificacion_en(p.sucursal)
    and not exists (select 1 from adq_plan_oc x where x.plan_id = p.id and x.docnum = o.docnum)
    and not exists (select 1 from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
                    where s.plan_id = p.id and x.docnum = o.docnum)
  group by o.docnum, o.proveedor_nombre, o.fecha, o.fecha_entrega, o.abierta
  order by o.fecha desc, o.docnum desc
  limit 50
$$;

-- ---------------------------------------------------------------- vistas

-- OC del plan: las asociadas a mano y las de las solicitudes creadas desde el plan
create or replace view public.adq_plan_oc_todas as
select x.plan_id, x.docnum, 'plan'::text as via from adq_plan_oc x
union
select s.plan_id, o.docnum, 'solicitud' from adq_oc o join adq_solicitudes s on s.id = o.solicitud_id where s.plan_id is not null;
revoke all on public.adq_plan_oc_todas from anon, authenticated;   -- interna, la usan las vistas de abajo

-- adq_planes_v depende de adq_plan_seguimiento_v: se borra primero
drop view if exists public.adq_planes_v;
drop view if exists public.adq_plan_seguimiento_v;

create view public.adq_plan_seguimiento_v as
select pl.*, p.bodega_codigo, p.sucursal,
  coalesce(sc.cantidad, 0) as en_solicitud_plan,
  coalesce(oc.comprado, 0) as comprado,
  coalesce(oc.recibido, 0) as recibido,
  coalesce(oc.por_recibir, 0) as por_recibir,
  greatest(pl.planificado - coalesce(oc.comprado, 0), 0) as sin_oc,
  coalesce(oc.atrasada, false) as oc_atrasada,
  oc.docnums,
  case when pl.planificado > 0 and coalesce(oc.recibido, 0) >= pl.planificado then 'recibido'
       when pl.planificado > 0 and coalesce(oc.comprado, 0) >= pl.planificado then 'comprado'
       when coalesce(oc.comprado, 0) > 0 then 'parcial'
       when coalesce(sc.cantidad, 0) > 0 then 'en_solicitud'
       else 'pendiente' end as estado_linea
from adq_plan_lineas pl
join adq_planes p on p.id = pl.plan_id
left join lateral (
  select sum(i.cantidad) as cantidad from adq_items i join adq_solicitudes s on s.id = i.solicitud_id
  where s.plan_id = p.id and i.articulo_codigo = pl.articulo_codigo and s.estado not in ('anulada', 'rechazada')
) sc on true
left join lateral (
  select sum(l.cantidad) as comprado, sum(l.cantidad - l.pendiente) as recibido,
         sum(l.pendiente) filter (where l.abierta) as por_recibir,
         bool_or(l.abierta and l.pendiente > 0 and o.fecha_entrega < adq_hoy()) as atrasada,
         string_agg(distinct o.docnum::text, ', ') as docnums
  from adq_plan_oc_todas t
  join sap_oc o on o.docnum = t.docnum and not o.cancelada
  join sap_oc_lineas l on l.doc_entry = o.doc_entry and l.articulo_codigo = pl.articulo_codigo
  where t.plan_id = p.id
) oc on true
where adq_ve_planificacion_en(p.sucursal);

create view public.adq_planes_v as
select p.*,
  adq_nombre(p.creado_por) as creado_por_nombre,
  adq_nombre(p.cerrado_por) as cerrado_por_nombre,
  to_char(make_date(p.anio, p.mes, 1), 'YYYY-MM') as periodo,
  coalesce(l.n, 0)::int as lineas,
  coalesce(l.valor, 0) as valor_planificado,
  coalesce(l.avance, 0) as avance_pct,
  coalesce(l.con_oc, 0)::int as lineas_con_oc,
  coalesce(o.n, 0)::int as oc,
  coalesce(sc.lista, '') as solicitudes,
  coalesce(sc.abiertas, 0)::int as solicitudes_abiertas
from adq_planes p
left join lateral (
  select count(*) as n, sum(s.planificado * coalesce(s.precio_ref, 0)) as valor,
         round(100 * sum(least(s.comprado, s.planificado)) / nullif(sum(s.planificado), 0))::int as avance,
         count(*) filter (where s.comprado > 0) as con_oc
  from adq_plan_seguimiento_v s where s.plan_id = p.id
) l on true
left join lateral (select count(*) as n from adq_plan_oc_todas t where t.plan_id = p.id) o on true
left join lateral (
  select string_agg('SC-' || s.numero, ', ' order by s.numero) as lista,
         count(*) filter (where s.estado in ('cotizando', 'en_aprobacion', 'aprobada', 'oc_emitida')) as abiertas
  from adq_solicitudes s where s.plan_id = p.id
) sc on true
where adq_ve_planificacion_en(p.sucursal);

-- ---------------------------------------------------------------- RLS y privilegios

alter table public.adq_planes      enable row level security;
alter table public.adq_plan_lineas enable row level security;
alter table public.adq_plan_oc     enable row level security;

drop policy if exists adq_planes_select on public.adq_planes;
create policy adq_planes_select on public.adq_planes for select to authenticated using (adq_ve_planificacion_en(sucursal));
drop policy if exists adq_plan_lineas_select on public.adq_plan_lineas;
create policy adq_plan_lineas_select on public.adq_plan_lineas for select to authenticated
  using (exists (select 1 from adq_planes p where p.id = plan_id and adq_ve_planificacion_en(p.sucursal)));
drop policy if exists adq_plan_oc_select on public.adq_plan_oc;
create policy adq_plan_oc_select on public.adq_plan_oc for select to authenticated
  using (exists (select 1 from adq_planes p where p.id = plan_id and adq_ve_planificacion_en(p.sucursal)));
-- La solicitud puede nacer de un plan de su sucursal (el resto de la fila la valida adq_solicitud_antes)
drop policy if exists adq_solicitudes_insert on public.adq_solicitudes;
create policy adq_solicitudes_insert on public.adq_solicitudes for insert to authenticated
  with check (adq_puede_solicitar_en(sucursal)
              and (plan_id is null or exists (select 1 from adq_planes p where p.id = plan_id and p.sucursal = adq_solicitudes.sucursal)));

revoke all on public.adq_planes, public.adq_plan_lineas, public.adq_plan_oc, public.adq_planes_v, public.adq_plan_seguimiento_v
  from anon, authenticated;
grant select on public.adq_planes, public.adq_plan_lineas, public.adq_plan_oc, public.adq_planes_v, public.adq_plan_seguimiento_v
  to authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'adq\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function
  public.adq_ve_planificacion_en(text), public.adq_planificar(text, text[], jsonb, date, date), public.adq_obras_planificables(text, date),
  public.adq_guardar_plan(jsonb), public.adq_plan_estado(uuid, text), public.adq_plan_vincular_oc(uuid, int[]),
  public.adq_plan_desvincular_oc(uuid, int), public.adq_plan_oc_candidatas(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;

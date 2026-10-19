-- Adquisiciones: planificacion por programa de viviendas y detalle de OC por linea (sobre las migraciones
-- *_adquisiciones*.sql anteriores, que van antes).
--
-- Tipos de vivienda: cada tipo es un conjunto de kits (bultos) de SAP con su cantidad por vivienda. Se cargan
--   una vez los 4 del Excel de recetas VIT (Urbana Ampliada Recortada, Nandu, Urbana Base, Urbana Ampliada
--   Normal); despues los mantiene el jefe de compras (agregar tipos, cambiar kits, desactivar).
-- Planificacion: el requerimiento sale del programa del mes (tipo x cantidad de viviendas), explotado por las
--   recetas de SAP kit -> panel -> materia prima. Lo programado no se cubre con kits o paneles ya hechos ni con
--   sus ordenes: esos son de las obras en curso. Opcional (p_incluir_ot): sumar lo que falta emitir de las
--   ordenes de fabricacion abiertas (como en 20261022130000), que si se cubre con su stock y sus ordenes.
--   El resto del calculo (disponible real, OC pendiente, en solicitud, minimo) es el mismo.
-- OC de SAP: vista por linea (SKU, familia y subfamilia de SAP, cantidades, pendiente y precio) para buscar
--   y exportar. Familia y subfamilia vienen de OITM.U_Familia / U_Sub_Familia (tablas @FAMI y @SFAMI).
--   Fecha de entrega: en SAP casi todas las OC la tienen igual a la fecha de la OC (no se registra la fecha
--   comprometida con el proveedor). Una entrega igual o anterior a la fecha de la OC se guarda vacia (sin fecha
--   comprometida), para que no aparezcan todas atrasadas desde el dia en que se emiten.
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- SAP

alter table public.sap_articulos add column if not exists familia text;
alter table public.sap_articulos add column if not exists subfamilia text;

-- ---------------------------------------------------------------- tipos de vivienda

create table if not exists public.adq_tipos_vivienda (
  id              int generated always as identity primary key,
  nombre          text not null unique check (btrim(nombre) <> ''),
  descripcion     text,
  activo          boolean not null default true,
  orden           int not null default 0,
  actualizado_por uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);

create table if not exists public.adq_tipo_vivienda_kits (
  tipo_id    int  not null references public.adq_tipos_vivienda(id) on delete cascade,
  kit_codigo text not null,
  cantidad   numeric(14, 4) not null default 1 check (cantidad > 0),   -- kits por vivienda
  primary key (tipo_id, kit_codigo)
);

-- Carga inicial (solo si no hay ningun tipo): los 4 tipos y sus bultos del Excel RECETAS-VIT (septiembre 2026)
do $$
declare v_id int;
begin
  if exists (select 1 from public.adq_tipos_vivienda) then return; end if;
  insert into public.adq_tipos_vivienda (nombre, descripcion, orden)
  values ('Urbana Ampliada Recortada', 'Vivienda urbana ampliada recortada aislada', 1) returning id into v_id;
  insert into public.adq_tipo_vivienda_kits (tipo_id, kit_codigo)
  select v_id, unnest(array['6604180','6604160','6604162','6604181','6604164','6604153','6604154','6604165','6604155','6604168','6604170','6604172']);

  insert into public.adq_tipos_vivienda (nombre, descripcion, orden)
  values ('Ñandú', 'Vivienda Ñandú rural industrializada', 2) returning id into v_id;
  insert into public.adq_tipo_vivienda_kits (tipo_id, kit_codigo)
  select v_id, unnest(array['6604182','6604184','6604186','6604188','6604189','6604190','6604191','6604193','6604195']);

  insert into public.adq_tipos_vivienda (nombre, descripcion, orden)
  values ('Urbana Base', 'Vivienda urbana aislada', 3) returning id into v_id;
  insert into public.adq_tipo_vivienda_kits (tipo_id, kit_codigo)
  select v_id, unnest(array['6604243','6604244','6604234','6604235','6604236','6604237','6604238','6604250','6604251','6604252','6604253']);

  insert into public.adq_tipos_vivienda (nombre, descripcion, orden)
  values ('Urbana Ampliada Normal', 'Vivienda urbana ampliada aislada', 4) returning id into v_id;
  insert into public.adq_tipo_vivienda_kits (tipo_id, kit_codigo)
  select v_id, unnest(array['6604254','6604255','6604256','6604257','6604258','6604259','6604260','6604261','6604262','6604263','6604264','6604265']);
end $$;

-- p = {id?, nombre, descripcion, activo, orden, kits: [{kit_codigo, cantidad}]}. Reemplaza los kits del tipo.
create or replace function public.adq_guardar_tipo_vivienda(p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_id int := nullif(p ->> 'id', '')::int;
begin
  if not adq_tiene('jefe_compras') then raise exception 'Solo el jefe de compras mantiene los tipos de vivienda' using errcode = '42501'; end if;
  if btrim(coalesce(p ->> 'nombre', '')) = '' then raise exception 'El tipo necesita un nombre' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p -> 'kits', '[]')) k where coalesce((k ->> 'cantidad')::numeric, 0) > 0) then
    raise exception 'El tipo necesita al menos un kit' using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into adq_tipos_vivienda (nombre, descripcion, activo, orden, actualizado_por)
    values (btrim(p ->> 'nombre'), nullif(btrim(coalesce(p ->> 'descripcion', '')), ''), coalesce((p ->> 'activo')::boolean, true),
            coalesce((p ->> 'orden')::int, (select coalesce(max(orden), 0) + 1 from adq_tipos_vivienda)), auth.uid())
    returning id into v_id;
  else
    update adq_tipos_vivienda set nombre = btrim(p ->> 'nombre'), descripcion = nullif(btrim(coalesce(p ->> 'descripcion', '')), ''),
      activo = coalesce((p ->> 'activo')::boolean, true), orden = coalesce((p ->> 'orden')::int, orden),
      actualizado_por = auth.uid(), updated_at = now()
    where id = v_id;
    if not found then raise exception 'Tipo de vivienda no encontrado' using errcode = 'P0002'; end if;
    delete from adq_tipo_vivienda_kits where tipo_id = v_id;
  end if;
  insert into adq_tipo_vivienda_kits (tipo_id, kit_codigo, cantidad)
  select v_id, btrim(k ->> 'kit_codigo'), sum((k ->> 'cantidad')::numeric)
  from jsonb_array_elements(p -> 'kits') k
  where coalesce((k ->> 'cantidad')::numeric, 0) > 0 and btrim(coalesce(k ->> 'kit_codigo', '')) <> ''
  group by btrim(k ->> 'kit_codigo');
  return v_id;
end $$;

drop view if exists public.adq_tipos_vivienda_v;
create view public.adq_tipos_vivienda_v as
select t.id, t.nombre, t.descripcion, t.activo, t.orden, t.updated_at, adq_nombre(t.actualizado_por) as actualizado_por_nombre,
  coalesce((select jsonb_agg(jsonb_build_object(
      'kit_codigo', k.kit_codigo, 'cantidad', k.cantidad,
      'kit_nombre', (select r.padre_nombre from sap_recetas r where r.padre_codigo = k.kit_codigo limit 1),
      'componentes', (select count(*) from sap_recetas r where r.padre_codigo = k.kit_codigo)) order by k.kit_codigo)
    from adq_tipo_vivienda_kits k where k.tipo_id = t.id), '[]') as kits
from adq_tipos_vivienda t
where adq_tiene_acceso();

-- ---------------------------------------------------------------- planificacion por programa

alter table public.adq_planes add column if not exists programa jsonb not null default '[]';   -- [{tipo_id, nombre, cantidad}]
alter table public.adq_planes add column if not exists incluir_ot boolean not null default false;

-- p_programa: [{tipo_id, cantidad}] viviendas a fabricar. p_incluir_ot: sumar lo pendiente de las ordenes de
-- fabricacion abiertas (de las obras p_obras, o todas; creadas desde p_desde). p_fecha: necesidad (clasifica OC).
drop function if exists public.adq_planificar(text, text[], jsonb, date, date);
drop function if exists public.adq_planificar(text, jsonb, boolean, text[], date, date);
create function public.adq_planificar(p_bodega text, p_programa jsonb default '[]', p_incluir_ot boolean default false,
                                      p_obras text[] default null, p_fecha date default null, p_desde date default null)
returns table (
  articulo_codigo text, articulo_nombre text, unidad text, grupo text, familia text,
  requerimiento numeric, req_programa numeric,
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

  -- demanda por articulo: de ordenes de SAP (real) y del programa de viviendas (prog)
  create temp table if not exists _adq_dem2 (articulo text, real numeric, prog numeric) on commit drop;
  truncate _adq_dem2;

  if p_incluir_ot then
    insert into _adq_dem2
    select l.articulo_codigo, l.planificado - l.emitido, 0
    from sap_ot o join sap_ot_lineas l on l.doc_entry = o.doc_entry
    where coalesce(l.bodega_codigo, o.bodega_codigo) = p_bodega and l.planificado > l.emitido and l.inventariable
      and (p_desde is null or o.fecha >= p_desde)
      and (o.articulo_codigo <> '99999999' or p_obras is null or o.proyecto_codigo = any (p_obras));
  end if;

  insert into _adq_dem2
  select k.kit_codigo, 0, k.cantidad * (x ->> 'cantidad')::numeric
  from jsonb_array_elements(coalesce(p_programa, '[]')) x
  join adq_tipo_vivienda_kits k on k.tipo_id = (x ->> 'tipo_id')::int
  where coalesce((x ->> 'cantidad')::numeric, 0) > 0;

  create temp table if not exists _adq_nivel2 (articulo text primary key, nivel int) on commit drop;
  truncate _adq_nivel2;
  insert into _adq_nivel2
  with recursive arbol(articulo, nivel) as (
    select distinct r.padre_codigo, 0 from sap_recetas r
    union all
    select r.componente_codigo, a.nivel + 1 from arbol a join sap_recetas r on r.padre_codigo = a.articulo where a.nivel < 8
  )
  select a.articulo, max(a.nivel) from arbol a
  where exists (select 1 from sap_recetas r where r.padre_codigo = a.articulo)
  group by a.articulo;

  select coalesce(max(n.nivel), -1) into v_max from _adq_nivel2 n;
  for v_nivel in 0 .. v_max loop
    insert into _adq_dem2
    with g as (
      select d.articulo, sum(d.real) as real, sum(d.prog) as prog
      from _adq_dem2 d join _adq_nivel2 n on n.articulo = d.articulo and n.nivel = v_nivel
      group by d.articulo
    ), c as (
      -- solo lo de las ordenes abiertas se cubre con lo ya fabricado y sus ordenes; lo programado es produccion nueva
      select g.articulo, g.prog,
        greatest(g.real
          - greatest(greatest(coalesce(b.stock_fisico, st.en_stock, 0) - coalesce(b.inutilizable, 0), 0) - coalesce(b.comprometido, 0), 0)
          - coalesce((select sum(greatest(o.cantidad - o.completada, 0)) from sap_ot o
                      where o.articulo_codigo = g.articulo and o.bodega_codigo = p_bodega
                        and (p_desde is null or o.fecha >= p_desde)), 0), 0) as real
      from g
      left join sap_stock st on st.articulo_codigo = g.articulo and st.bodega_codigo = p_bodega
      left join adq_bodega_stock b on b.articulo_codigo = g.articulo and b.bodega_codigo = p_bodega
    )
    select r.componente_codigo, c.real * r.cantidad, c.prog * r.cantidad
    from c join sap_recetas r on r.padre_codigo = c.articulo and r.inventariable
    where c.real > 0 or c.prog > 0;
  end loop;

  return query
  with dem as (
    select d.articulo, sum(d.real + d.prog) as req, sum(d.prog) as prog
    from _adq_dem2 d
    where not exists (select 1 from _adq_nivel2 n where n.articulo = d.articulo)
    group by d.articulo
    having sum(d.real + d.prog) > 0.00005
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
    select d.articulo, d.req, d.prog,
      coalesce(a.nombre, st.articulo_nombre, rc.componente_nombre, d.articulo) as nombre,
      coalesce(st.unidad, a.unidad, rc.unidad) as unidad, coalesce(st.grupo, a.grupo) as grupo, a.familia,
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
  select f.articulo, f.nombre, f.unidad, f.grupo, f.familia,
    round(f.req, 4), round(f.prog, 4),
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

-- Igual que en 20261022130000, mas el programa de viviendas y si se sumaron las ordenes abiertas
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

  insert into adq_planes (bodega_codigo, sucursal, anio, mes, version, fecha_necesidad, ot_desde, obras, programa, incluir_ot, nota, creado_por)
  values (v_bod, v_suc, v_anio, v_mes,
          coalesce((select max(version) from adq_planes where bodega_codigo = v_bod and anio = v_anio and mes = v_mes), 0) + 1,
          nullif(p ->> 'fecha_necesidad', '')::date, nullif(p ->> 'ot_desde', '')::date,
          case when jsonb_typeof(p -> 'obras') = 'array' then array(select jsonb_array_elements_text(p -> 'obras')) end,
          coalesce(p -> 'programa', '[]'), coalesce((p ->> 'incluir_ot')::boolean, false),
          nullif(btrim(coalesce(p ->> 'nota', '')), ''), auth.uid())
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

-- adq_planes_v usa p.*: se recrea para que traiga programa e incluir_ot (igual que en 20261022130000)
drop view if exists public.adq_planes_v;
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

-- ---------------------------------------------------------------- OC de SAP por linea

drop view if exists public.adq_sap_oc_lineas_v;
create view public.adq_sap_oc_lineas_v as
select l.doc_entry, l.linea, o.docnum, o.fecha, o.fecha_entrega, o.proveedor_codigo, o.proveedor_nombre, o.moneda,
  o.abierta as oc_abierta, o.cancelada, l.articulo_codigo, l.descripcion, l.unidad, l.bodega, l.ceco,
  a.grupo, a.familia, a.subfamilia,
  l.cantidad, l.cantidad - l.pendiente as recibido, l.pendiente, l.precio, l.total,
  case when l.cantidad > 0 then round(l.total * l.pendiente / l.cantidad, 2) else 0 end as pendiente_neto,
  l.abierta and l.pendiente > 0 as por_recibir,
  (l.abierta and l.pendiente > 0 and o.fecha_entrega < adq_hoy()) as atrasada,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc_lineas l
join sap_oc o on o.doc_entry = l.doc_entry
left join sap_articulos a on a.codigo = l.articulo_codigo
where adq_ve_oc_compras(o.sucursales);

-- ---------------------------------------------------------------- sincronizacion (articulos con familia)

-- Igual que en 20261022120000_adquisiciones_bodega.sql; los articulos traen familia y subfamilia
create or replace function public.sap_compras_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prov int; v_art int; v_oc int; v_fac int; v_cecos int;
  v_adq jsonb;
begin
  if jsonb_typeof(p -> 'oc') is distinct from 'array' or jsonb_array_length(p -> 'oc') = 0
     or jsonb_typeof(p -> 'proveedores') is distinct from 'array' or jsonb_array_length(p -> 'proveedores') = 0 then
    raise exception 'sap_compras_sincronizar: sin OC o sin proveedores, no se reemplaza nada';
  end if;

  delete from sap_proveedores where true;
  insert into sap_proveedores (codigo, nombre, rut, telefono, email, activo)
  select f ->> 'codigo', coalesce(nullif(f ->> 'nombre', ''), f ->> 'codigo'), nullif(f ->> 'rut', ''),
         nullif(f ->> 'telefono', ''), nullif(f ->> 'email', ''), coalesce((f ->> 'activo')::boolean, true)
  from jsonb_array_elements(p -> 'proveedores') f
  on conflict (codigo) do nothing;

  delete from sap_articulos where true;
  insert into sap_articulos (codigo, nombre, unidad, grupo, ultimo_precio, ultima_compra, familia, subfamilia)
  select f ->> 'codigo', coalesce(nullif(f ->> 'nombre', ''), f ->> 'codigo'), nullif(f ->> 'unidad', ''), nullif(f ->> 'grupo', ''),
         (f ->> 'ultimo_precio')::numeric, (f ->> 'ultima_compra')::date, nullif(f ->> 'familia', ''), nullif(f ->> 'subfamilia', '')
  from jsonb_array_elements(coalesce(p -> 'articulos', '[]')) f
  on conflict (codigo) do nothing;

  if jsonb_array_length(coalesce(p -> 'centros', '[]')) > 0 then
    delete from sap_centros_costo where true;
    insert into sap_centros_costo (codigo, nombre, sucursal, linea, activo)
    select f ->> 'codigo', coalesce(nullif(f ->> 'nombre', ''), f ->> 'codigo'),
           adq_ceco_sucursal(f ->> 'codigo'), adq_ceco_linea(f ->> 'codigo'), coalesce((f ->> 'activo')::boolean, true)
    from jsonb_array_elements(p -> 'centros') f
    on conflict (codigo) do nothing;
  end if;

  delete from sap_oc where true;   -- en cascada, sap_oc_lineas y sap_oc_facturas
  insert into sap_oc (doc_entry, docnum, proveedor_codigo, proveedor_nombre, fecha, fecha_entrega, abierta, cancelada,
                      total, iva, moneda, referencia, comentarios)
  select (f ->> 'doc_entry')::int, (f ->> 'docnum')::int, nullif(f ->> 'proveedor_codigo', ''), nullif(f ->> 'proveedor_nombre', ''),
         (f ->> 'fecha')::date,
         case when (f ->> 'fecha_entrega')::date > (f ->> 'fecha')::date then (f ->> 'fecha_entrega')::date end,
         coalesce((f ->> 'abierta')::boolean, false),
         coalesce((f ->> 'cancelada')::boolean, false), coalesce((f ->> 'total')::numeric, 0), coalesce((f ->> 'iva')::numeric, 0),
         nullif(f ->> 'moneda', ''), nullif(f ->> 'referencia', ''), nullif(f ->> 'comentarios', '')
  from jsonb_array_elements(p -> 'oc') f;

  insert into sap_oc_lineas (doc_entry, linea, articulo_codigo, descripcion, cantidad, pendiente, precio, total, unidad, bodega, abierta, ceco, wip)
  select (f ->> 'doc_entry')::int, (f ->> 'linea')::int, nullif(f ->> 'articulo_codigo', ''), nullif(f ->> 'descripcion', ''),
         coalesce((f ->> 'cantidad')::numeric, 0), coalesce((f ->> 'pendiente')::numeric, 0), coalesce((f ->> 'precio')::numeric, 0),
         coalesce((f ->> 'total')::numeric, 0), nullif(f ->> 'unidad', ''), nullif(f ->> 'bodega', ''),
         coalesce((f ->> 'abierta')::boolean, true), nullif(f ->> 'ceco', ''), nullif(f ->> 'wip', '')
  from jsonb_array_elements(coalesce(p -> 'lineas', '[]')) f
  where exists (select 1 from sap_oc o where o.doc_entry = (f ->> 'doc_entry')::int);

  insert into sap_oc_facturas (oc_doc_entry, doc_entry, docnum, folio, fecha, vencimiento, total, pagado, abierta, cancelada, neto_oc)
  select (f ->> 'oc_doc_entry')::int, (f ->> 'doc_entry')::int, (f ->> 'docnum')::int, nullif(f ->> 'folio', ''),
         (f ->> 'fecha')::date, (f ->> 'vencimiento')::date, coalesce((f ->> 'total')::numeric, 0),
         coalesce((f ->> 'pagado')::numeric, 0), coalesce((f ->> 'abierta')::boolean, true),
         coalesce((f ->> 'cancelada')::boolean, false), coalesce((f ->> 'neto_oc')::numeric, 0)
  from jsonb_array_elements(coalesce(p -> 'facturas', '[]')) f
  where exists (select 1 from sap_oc o where o.doc_entry = (f ->> 'oc_doc_entry')::int)
  on conflict do nothing;

  update sap_oc o set cantidad_total = l.cantidad, cantidad_pendiente = l.pendiente, neto = l.neto, sucursales = l.sucursales
  from (select doc_entry, sum(cantidad) as cantidad, sum(pendiente) as pendiente, sum(total) as neto,
               coalesce(array_agg(distinct coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega))
                                  order by coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega)))
                        filter (where coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega)) is not null), '{}') as sucursales
        from sap_oc_lineas group by doc_entry) l
  where l.doc_entry = o.doc_entry;
  update sap_oc o set facturado = f.neto
  from (select oc_doc_entry, sum(neto_oc) as neto from sap_oc_facturas where not cancelada group by oc_doc_entry) f
  where f.oc_doc_entry = o.doc_entry;

  if jsonb_typeof(p -> 'consumo') = 'array' then
    delete from sap_consumo where true;
    insert into sap_consumo (articulo_codigo, bodega_codigo, salidas_6m, salidas_12m, max_mes_12m, meses_12m)
    select f ->> 'articulo_codigo', f ->> 'bodega_codigo', coalesce((f ->> 'salidas_6m')::numeric, 0),
           coalesce((f ->> 'salidas_12m')::numeric, 0), coalesce((f ->> 'max_mes_12m')::numeric, 0),
           coalesce((f ->> 'meses_12m')::int, 0)
    from jsonb_array_elements(p -> 'consumo') f
    on conflict do nothing;
  end if;

  if jsonb_typeof(p -> 'recepciones') = 'array' then
    delete from sap_recepciones where true;
    insert into sap_recepciones (articulo_codigo, bodega_codigo, fecha, docnum, proveedor_nombre)
    select f ->> 'articulo_codigo', f ->> 'bodega_codigo', (f ->> 'fecha')::date, (f ->> 'docnum')::int, nullif(f ->> 'proveedor_nombre', '')
    from jsonb_array_elements(p -> 'recepciones') f
    where (f ->> 'fecha') is not null
    on conflict do nothing;
  end if;

  -- recetas y OT: solo si vienen con filas (una lectura vacia de SAP no borra las recetas)
  if jsonb_array_length(coalesce(p -> 'recetas', '[]')) > 0 then
    delete from sap_recetas where true;
    insert into sap_recetas (padre_codigo, padre_nombre, linea, componente_codigo, componente_nombre, cantidad, unidad, bodega_codigo, inventariable)
    select f ->> 'padre_codigo', nullif(f ->> 'padre_nombre', ''), (f ->> 'linea')::int, f ->> 'componente_codigo',
           nullif(f ->> 'componente_nombre', ''), coalesce((f ->> 'cantidad')::numeric, 0), nullif(f ->> 'unidad', ''),
           nullif(f ->> 'bodega_codigo', ''), coalesce((f ->> 'inventariable')::boolean, true)
    from jsonb_array_elements(p -> 'recetas') f
    on conflict do nothing;
  end if;

  if jsonb_typeof(p -> 'ot') = 'array' then
    delete from sap_ot where true;   -- en cascada, sap_ot_lineas
    insert into sap_ot (doc_entry, docnum, articulo_codigo, articulo_nombre, proyecto_codigo, proyecto_nombre, estado,
                        cantidad, completada, fecha, fecha_fin, bodega_codigo)
    select (f ->> 'doc_entry')::int, (f ->> 'docnum')::int, f ->> 'articulo_codigo', nullif(f ->> 'articulo_nombre', ''),
           nullif(f ->> 'proyecto_codigo', ''), nullif(f ->> 'proyecto_nombre', ''), f ->> 'estado',
           coalesce((f ->> 'cantidad')::numeric, 0), coalesce((f ->> 'completada')::numeric, 0),
           (f ->> 'fecha')::date, (f ->> 'fecha_fin')::date, nullif(f ->> 'bodega_codigo', '')
    from jsonb_array_elements(p -> 'ot') f
    where f ->> 'estado' in ('P', 'R')
    on conflict do nothing;
    insert into sap_ot_lineas (doc_entry, linea, articulo_codigo, planificado, emitido, bodega_codigo, inventariable)
    select (f ->> 'doc_entry')::int, (f ->> 'linea')::int, f ->> 'articulo_codigo', coalesce((f ->> 'planificado')::numeric, 0),
           coalesce((f ->> 'emitido')::numeric, 0), nullif(f ->> 'bodega_codigo', ''), coalesce((f ->> 'inventariable')::boolean, true)
    from jsonb_array_elements(coalesce(p -> 'ot_lineas', '[]')) f
    where exists (select 1 from sap_ot o where o.doc_entry = (f ->> 'doc_entry')::int)
    on conflict do nothing;
  end if;

  if p ? 'recetas' or p ? 'ot' then
    insert into sap_planificacion_estado (id, sincronizado_en, recetas, ot)
    values (true, now(), (select count(*) from sap_recetas), (select count(*) from sap_ot))
    on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, recetas = excluded.recetas, ot = excluded.ot;
  end if;

  select count(*) into v_prov from sap_proveedores;
  select count(*) into v_art from sap_articulos;
  select count(*) into v_oc from sap_oc;
  select count(*) into v_fac from sap_oc_facturas;
  select count(*) into v_cecos from sap_centros_costo;
  insert into sap_compras_estado (id, sincronizado_en, proveedores, articulos, oc)
  values (true, now(), v_prov, v_art, v_oc)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, proveedores = excluded.proveedores,
                                 articulos = excluded.articulos, oc = excluded.oc;
  v_adq := adq_sap_actualizar();
  return jsonb_build_object('proveedores', v_prov, 'articulos', v_art, 'oc', v_oc, 'facturas', v_fac, 'centros', v_cecos,
                            'consumo', (select count(*) from sap_consumo), 'recepciones', (select count(*) from sap_recepciones),
                            'recetas', (select count(*) from sap_recetas), 'ot', (select count(*) from sap_ot),
                            'ot_lineas', (select count(*) from sap_ot_lineas)) || v_adq;
end $$;

-- OC ya sincronizadas: misma regla (la proxima sincronizacion la aplica igual)
update public.sap_oc set fecha_entrega = null where fecha_entrega <= fecha;

-- ---------------------------------------------------------------- RLS y privilegios

alter table public.adq_tipos_vivienda     enable row level security;
alter table public.adq_tipo_vivienda_kits enable row level security;
drop policy if exists adq_tipos_vivienda_select on public.adq_tipos_vivienda;
create policy adq_tipos_vivienda_select on public.adq_tipos_vivienda for select to authenticated using (adq_tiene_acceso());
drop policy if exists adq_tipo_vivienda_kits_select on public.adq_tipo_vivienda_kits;
create policy adq_tipo_vivienda_kits_select on public.adq_tipo_vivienda_kits for select to authenticated using (adq_tiene_acceso());

revoke all on public.adq_tipos_vivienda, public.adq_tipo_vivienda_kits, public.adq_tipos_vivienda_v, public.adq_planes_v,
              public.adq_sap_oc_lineas_v from anon, authenticated;
grant select on public.adq_tipos_vivienda, public.adq_tipo_vivienda_kits, public.adq_tipos_vivienda_v, public.adq_planes_v,
                public.adq_sap_oc_lineas_v to authenticated;

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
  public.adq_guardar_tipo_vivienda(jsonb), public.adq_planificar(text, jsonb, boolean, text[], date, date), public.adq_guardar_plan(jsonb)
  to authenticated;
revoke all on function public.sap_compras_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_compras_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

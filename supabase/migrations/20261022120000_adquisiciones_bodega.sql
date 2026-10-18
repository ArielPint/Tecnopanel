-- Adquisiciones: Bodega (conteo fisico) y datos de SAP para planificar compras (sobre 20261016120000,
-- 20261017120000 y 20261018120000, que van antes). Primera entrega de lo que se trae de TP Control Tower.
--
--   Bodega: por articulo y bodega (B006 Santiago, B007 Puerto Varas) se registra el stock fisico contado,
--     el stock inutilizable y lo comprometido a distribuir. Nada de esto va a SAP ni lo pisa la
--     sincronizacion. Cada cambio queda en adq_bodega_historial (antes y despues, quien, cuando y motivo);
--     revertir agrega un movimiento, no borra historia.
--       stock usado     = fisico si se conto; si no, el de SAP
--       utilizable      = max(stock usado - inutilizable, 0)
--       disponible real = utilizable - comprometido de bodega (el comprometido de SAP es solo referencia)
--       conteo          vigente hasta 3 dias, atencion de 4 a 7, desactualizado despues
--       pendiente OC    saldo por recibir de lineas de OC abiertas de esa bodega (lo calcula SAP, no se edita)
--   SAP (solo lectura, lo trae tareas\sincronizar-sap-compras.ps1):
--     consumo de 12 meses (total, maximo mensual y meses con salidas) ademas del de 6
--     ultima recepcion por articulo y bodega (OPDN)
--     listas de materiales de produccion (OITT/ITT1): las recetas de kits y paneles
--     ordenes de fabricacion abiertas (OWOR/WOR1), con su proyecto; las de articulo 99999999 son las de
--     cada obra y listan los kits y materiales que necesita
--   Reposicion: el consumo mensual pasa a ser el promedio de 12 meses.
--
-- Quien ve y registra Bodega: Compras o Bodega de la sucursal de la bodega (adq_ve_reposicion_en).
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- SAP (solo lectura)

alter table public.sap_consumo add column if not exists salidas_12m numeric(18, 4) not null default 0;
alter table public.sap_consumo add column if not exists max_mes_12m numeric(18, 4) not null default 0;
alter table public.sap_consumo add column if not exists meses_12m int not null default 0;   -- meses con salidas

create table if not exists public.sap_recepciones (
  articulo_codigo  text not null,
  bodega_codigo    text not null,
  fecha            date not null,     -- ultima entrada de mercaderia (OPDN.DocDate)
  docnum           int,
  proveedor_nombre text,
  primary key (articulo_codigo, bodega_codigo)
);

-- Una fila por componente de cada lista de materiales; cantidad por 1 unidad del padre
create table if not exists public.sap_recetas (
  padre_codigo      text not null,     -- OITT.Code
  padre_nombre      text,
  linea             int  not null,     -- ITT1.ChildNum (un componente puede repetirse en la lista)
  componente_codigo text not null,
  componente_nombre text,
  cantidad          numeric(18, 6) not null,
  unidad            text,
  bodega_codigo     text,
  primary key (padre_codigo, linea)
);
create index if not exists sap_recetas_componente_idx on public.sap_recetas (componente_codigo);
-- false = no es de inventario (maquilas, fletes, gastos: su "cantidad" es un monto); no se planifica
alter table public.sap_recetas add column if not exists inventariable boolean not null default true;

create table if not exists public.sap_ot (
  doc_entry       int primary key,     -- OWOR.DocEntry
  docnum          int not null,
  articulo_codigo text not null,       -- 99999999 = orden de la obra
  articulo_nombre text,
  proyecto_codigo text,
  proyecto_nombre text,
  estado          text not null check (estado in ('P', 'R')),   -- planificada, liberada
  cantidad        numeric(18, 4) not null default 0,
  completada      numeric(18, 4) not null default 0,
  fecha           date,
  fecha_fin       date,
  bodega_codigo   text
);
create index if not exists sap_ot_proyecto_idx on public.sap_ot (proyecto_codigo);

create table if not exists public.sap_ot_lineas (
  doc_entry       int not null references public.sap_ot(doc_entry) on delete cascade,
  linea           int not null,
  articulo_codigo text not null,
  planificado     numeric(18, 4) not null default 0,
  emitido         numeric(18, 4) not null default 0,
  bodega_codigo   text,
  primary key (doc_entry, linea)
);
create index if not exists sap_ot_lineas_articulo_idx on public.sap_ot_lineas (articulo_codigo, bodega_codigo);
alter table public.sap_ot_lineas add column if not exists inventariable boolean not null default true;

create table if not exists public.sap_planificacion_estado (
  id              boolean primary key default true check (id),
  sincronizado_en timestamptz not null,
  recetas         int not null default 0,
  ot              int not null default 0
);

-- ---------------------------------------------------------------- tablas del portal

create table if not exists public.adq_bodega_stock (
  articulo_codigo text not null,
  bodega_codigo   text not null check (bodega_codigo in ('B006', 'B007')),
  stock_fisico    numeric(18, 4) check (stock_fisico is null or stock_fisico >= 0),   -- null = sin conteo
  inutilizable    numeric(18, 4) not null default 0 check (inutilizable >= 0),
  comprometido    numeric(18, 4) check (comprometido is null or comprometido >= 0),   -- null = sin registro
  observacion     text,
  contado_at      timestamptz,          -- ultima vez que se informo el stock fisico
  actualizado_por uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  primary key (articulo_codigo, bodega_codigo),
  check (stock_fisico is null or inutilizable <= stock_fisico)
);

create table if not exists public.adq_bodega_historial (
  id                 bigint generated always as identity primary key,
  articulo_codigo    text not null,
  bodega_codigo      text not null,
  accion             text not null check (accion in ('conteo', 'reversa')),
  stock_fisico_antes numeric(18, 4),
  inutilizable_antes numeric(18, 4),
  comprometido_antes numeric(18, 4),
  stock_fisico       numeric(18, 4),
  inutilizable       numeric(18, 4),
  comprometido       numeric(18, 4),
  stock_sap          numeric(18, 4),    -- stock de SAP en ese momento, para ver la diferencia despues
  observacion        text,
  motivo             text,
  revierte_id        bigint references public.adq_bodega_historial(id),
  user_id            uuid references auth.users(id),
  created_at         timestamptz not null default now()
);
create index if not exists adq_bodega_historial_idx on public.adq_bodega_historial (bodega_codigo, articulo_codigo, created_at desc);

-- ---------------------------------------------------------------- bodega: registrar y revertir

-- Deja el estado de un articulo en una bodega y su movimiento en el historial. Sin nada que guardar
-- (sin conteo, sin inutilizable y sin comprometido) la fila se quita; el historial queda.
create or replace function public.adq_bodega_aplicar(
  p_articulo text, p_bodega text, p_fisico numeric, p_inutilizable numeric, p_comprometido numeric,
  p_observacion text, p_motivo text, p_accion text, p_revierte bigint, p_contado_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  a adq_bodega_stock%rowtype;
  v_sap numeric;
begin
  select * into a from adq_bodega_stock where articulo_codigo = p_articulo and bodega_codigo = p_bodega for update;
  select en_stock into v_sap from sap_stock where articulo_codigo = p_articulo and bodega_codigo = p_bodega;

  if p_fisico is null and coalesce(p_inutilizable, 0) = 0 and p_comprometido is null then
    delete from adq_bodega_stock where articulo_codigo = p_articulo and bodega_codigo = p_bodega;
  else
    insert into adq_bodega_stock (articulo_codigo, bodega_codigo, stock_fisico, inutilizable, comprometido, observacion,
                                  contado_at, actualizado_por, updated_at)
    values (p_articulo, p_bodega, p_fisico, coalesce(p_inutilizable, 0), p_comprometido, p_observacion,
            case when p_fisico is not null then p_contado_at end, auth.uid(), now())
    on conflict (articulo_codigo, bodega_codigo) do update
      set stock_fisico = excluded.stock_fisico, inutilizable = excluded.inutilizable, comprometido = excluded.comprometido,
          observacion = excluded.observacion, contado_at = excluded.contado_at,
          actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at;
  end if;

  insert into adq_bodega_historial (articulo_codigo, bodega_codigo, accion, stock_fisico_antes, inutilizable_antes,
                                    comprometido_antes, stock_fisico, inutilizable, comprometido, stock_sap,
                                    observacion, motivo, revierte_id, user_id)
  values (p_articulo, p_bodega, p_accion, a.stock_fisico, a.inutilizable, a.comprometido, p_fisico,
          coalesce(p_inutilizable, 0), p_comprometido, v_sap, p_observacion, p_motivo, p_revierte, auth.uid());
end $$;

-- p = [{articulo_codigo, bodega_codigo, stock_fisico, inutilizable, comprometido, observacion}, ...]
-- Cada fila enviada es un registro: si trae stock fisico, cuenta como conteo de hoy aunque no cambie.
create or replace function public.adq_guardar_conteo(p jsonb, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  f jsonb;
  v_fisico numeric; v_inut numeric; v_comp numeric;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) = 0 then
    raise exception 'No hay nada que guardar' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p) x
             where not adq_ve_reposicion_en(coalesce(adq_bodega_sucursal(x ->> 'bodega_codigo'), '-'))) then
    raise exception 'Solo Bodega o Compras de esa sucursal registran su stock' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p) loop
    v_fisico := nullif(f ->> 'stock_fisico', '')::numeric;
    v_inut   := coalesce(nullif(f ->> 'inutilizable', '')::numeric, 0);
    v_comp   := nullif(f ->> 'comprometido', '')::numeric;
    if coalesce(f ->> 'articulo_codigo', '') = '' then
      raise exception 'Falta el código de artículo' using errcode = '22023';
    end if;
    if v_fisico < 0 or v_inut < 0 or v_comp < 0 then
      raise exception 'Las cantidades de % no pueden ser negativas', f ->> 'articulo_codigo' using errcode = '22023';
    end if;
    if v_fisico is not null and v_inut > v_fisico then
      raise exception 'En % el stock inutilizable (%) supera el stock físico (%)', f ->> 'articulo_codigo', v_inut, v_fisico
        using errcode = '22023';
    end if;
    perform adq_bodega_aplicar(f ->> 'articulo_codigo', f ->> 'bodega_codigo', v_fisico, v_inut, v_comp,
                               nullif(btrim(coalesce(f ->> 'observacion', '')), ''),
                               nullif(btrim(coalesce(p_motivo, '')), ''), 'conteo', null, now());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Vuelve el articulo a los valores que tenia antes del movimiento p_id. Agrega un movimiento 'reversa'.
create or replace function public.adq_revertir_conteo(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  h adq_bodega_historial%rowtype;
  v_contado timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Indica el motivo de la corrección' using errcode = 'P0001'; end if;
  select * into h from adq_bodega_historial where id = p_id;
  if not found then raise exception 'Movimiento no encontrado' using errcode = 'P0002'; end if;
  if not adq_ve_reposicion_en(coalesce(adq_bodega_sucursal(h.bodega_codigo), '-')) then
    raise exception 'Solo Bodega o Compras de esa sucursal corrigen su stock' using errcode = '42501';
  end if;
  -- se recupera tambien la fecha del conteo anterior, para no dejarlo como contado hoy
  select x.created_at into v_contado from adq_bodega_historial x
  where x.articulo_codigo = h.articulo_codigo and x.bodega_codigo = h.bodega_codigo and x.id < h.id
    and x.stock_fisico is not null
  order by x.id desc limit 1;
  perform adq_bodega_aplicar(h.articulo_codigo, h.bodega_codigo, h.stock_fisico_antes, h.inutilizable_antes,
                             h.comprometido_antes, null, btrim(p_motivo), 'reversa', h.id, v_contado);
end $$;

-- ---------------------------------------------------------------- sincronizacion con SAP

-- Igual que en 20261018120000, mas (todo opcional; lo que no viene no se toca):
--   consumo:    [{articulo_codigo, bodega_codigo, salidas_6m, salidas_12m, max_mes_12m, meses_12m}]
--   recepciones [{articulo_codigo, bodega_codigo, fecha, docnum, proveedor_nombre}]
--   recetas     [{padre_codigo, padre_nombre, linea, componente_codigo, componente_nombre, cantidad, unidad, bodega_codigo, inventariable}]
--   ot          [{doc_entry, docnum, articulo_codigo, articulo_nombre, proyecto_codigo, proyecto_nombre, estado,
--                 cantidad, completada, fecha, fecha_fin, bodega_codigo}]
--   ot_lineas   [{doc_entry, linea, articulo_codigo, planificado, emitido, bodega_codigo, inventariable}]
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
  insert into sap_articulos (codigo, nombre, unidad, grupo, ultimo_precio, ultima_compra)
  select f ->> 'codigo', coalesce(nullif(f ->> 'nombre', ''), f ->> 'codigo'), nullif(f ->> 'unidad', ''), nullif(f ->> 'grupo', ''),
         (f ->> 'ultimo_precio')::numeric, (f ->> 'ultima_compra')::date
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
         (f ->> 'fecha')::date, (f ->> 'fecha_entrega')::date, coalesce((f ->> 'abierta')::boolean, false),
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

-- ---------------------------------------------------------------- vistas

-- Bodega: stock de SAP, pendiente de OC y lo registrado por Bodega, por articulo y bodega
drop view if exists public.adq_bodega_v;
create view public.adq_bodega_v as
with pendiente as (
  select l.articulo_codigo, l.bodega as bodega_codigo, sum(l.pendiente) as pendiente_oc,
         count(distinct l.doc_entry)::int as oc_abiertas,
         min(o.fecha_entrega) as proxima_entrega,
         bool_or(o.fecha_entrega < adq_hoy()) as oc_atrasada
  from sap_oc_lineas l join sap_oc o on o.doc_entry = l.doc_entry
  where l.abierta and not o.cancelada and l.pendiente > 0 and l.bodega in ('B006', 'B007') and l.articulo_codigo is not null
  group by 1, 2
), claves as (
  select articulo_codigo, bodega_codigo from sap_stock where bodega_codigo in ('B006', 'B007')
  union select articulo_codigo, bodega_codigo from adq_bodega_stock
  union select articulo_codigo, bodega_codigo from pendiente
), base as (
  select k.articulo_codigo, k.bodega_codigo, adq_bodega_sucursal(k.bodega_codigo) as sucursal,
    coalesce(a.nombre, st.articulo_nombre, k.articulo_codigo) as articulo_nombre,
    coalesce(st.unidad, a.unidad) as unidad, coalesce(st.grupo, a.grupo) as grupo,
    coalesce(st.en_stock, 0) as stock_sap, coalesce(st.comprometido, 0) as comprometido_sap, coalesce(st.pedido, 0) as pedido_sap,
    coalesce(pe.pendiente_oc, 0) as pendiente_oc, coalesce(pe.oc_abiertas, 0) as oc_abiertas, pe.proxima_entrega,
    coalesce(pe.oc_atrasada, false) as oc_atrasada,
    round(coalesce(c.salidas_12m, 0) / 12, 4) as consumo_mensual,
    r.fecha as ultima_recepcion,
    b.stock_fisico, coalesce(b.inutilizable, 0) as inutilizable, b.comprometido as comprometido_bodega, b.observacion,
    b.contado_at, b.updated_at, adq_nombre(b.actualizado_por) as actualizado_por_nombre,
    (adq_hoy() - (b.contado_at at time zone 'America/Santiago')::date) as antiguedad_dias
  from claves k
  left join sap_stock st on st.articulo_codigo = k.articulo_codigo and st.bodega_codigo = k.bodega_codigo
  left join sap_articulos a on a.codigo = k.articulo_codigo
  left join pendiente pe on pe.articulo_codigo = k.articulo_codigo and pe.bodega_codigo = k.bodega_codigo
  left join sap_consumo c on c.articulo_codigo = k.articulo_codigo and c.bodega_codigo = k.bodega_codigo
  left join sap_recepciones r on r.articulo_codigo = k.articulo_codigo and r.bodega_codigo = k.bodega_codigo
  left join adq_bodega_stock b on b.articulo_codigo = k.articulo_codigo and b.bodega_codigo = k.bodega_codigo
  where adq_ve_reposicion_en(adq_bodega_sucursal(k.bodega_codigo))
)
select x.*,
  case when x.contado_at is null then 'sin_conteo' when x.antiguedad_dias <= 3 then 'vigente'
       when x.antiguedad_dias <= 7 then 'atencion' else 'desactualizado' end as estado_conteo,
  coalesce(x.stock_fisico, x.stock_sap) as stock_usado,
  greatest(coalesce(x.stock_fisico, x.stock_sap) - x.inutilizable, 0) as utilizable,
  greatest(coalesce(x.stock_fisico, x.stock_sap) - x.inutilizable, 0) - coalesce(x.comprometido_bodega, 0) as disponible_real,
  case when x.stock_fisico is not null then x.stock_fisico - x.stock_sap end as diferencia_sap
from base x;

drop view if exists public.adq_bodega_historial_v;
create view public.adq_bodega_historial_v as
select h.*, coalesce(a.nombre, st.articulo_nombre, h.articulo_codigo) as articulo_nombre,
  adq_nombre(h.user_id) as usuario_nombre,
  exists (select 1 from adq_bodega_historial x where x.revierte_id = h.id) as revertido
from adq_bodega_historial h
left join sap_articulos a on a.codigo = h.articulo_codigo
left join sap_stock st on st.articulo_codigo = h.articulo_codigo and st.bodega_codigo = h.bodega_codigo
where adq_ve_reposicion_en(adq_bodega_sucursal(h.bodega_codigo));

-- Reposicion: igual que en 20261018120000, con el consumo promedio de 12 meses y el maximo mensual
drop view if exists public.adq_reposicion_v;
create view public.adq_reposicion_v as
with claves as (
  select articulo_codigo, bodega_codigo from sap_stock where bodega_codigo in ('B006', 'B007')
  union select articulo_codigo, bodega_codigo from adq_reposicion
  union select articulo_codigo, bodega_codigo from sap_consumo
), base as (
  select k.articulo_codigo, k.bodega_codigo, adq_bodega_sucursal(k.bodega_codigo) as sucursal,
    coalesce(a.nombre, st.articulo_nombre, k.articulo_codigo) as articulo_nombre,
    coalesce(st.unidad, a.unidad) as unidad, a.ultimo_precio,
    coalesce(st.en_stock, 0) as en_stock, coalesce(st.comprometido, 0) as comprometido, coalesce(st.pedido, 0) as pedido,
    coalesce((select sum(i.cantidad) from adq_items i join adq_solicitudes s on s.id = i.solicitud_id
              where i.articulo_codigo = k.articulo_codigo and s.sucursal = adq_bodega_sucursal(k.bodega_codigo)
                and s.estado in ('cotizando', 'en_aprobacion', 'aprobada')), 0) as en_solicitud,
    round(coalesce(c.salidas_12m, 0) / 12, 4) as consumo_mensual,
    coalesce(c.max_mes_12m, 0) as consumo_max_mes,
    r.minimo, r.reorden, r.updated_at as minimo_actualizado
  from claves k
  left join sap_stock st on st.articulo_codigo = k.articulo_codigo and st.bodega_codigo = k.bodega_codigo
  left join sap_articulos a on a.codigo = k.articulo_codigo
  left join sap_consumo c on c.articulo_codigo = k.articulo_codigo and c.bodega_codigo = k.bodega_codigo
  left join adq_reposicion r on r.articulo_codigo = k.articulo_codigo and r.bodega_codigo = k.bodega_codigo
  where adq_ve_reposicion_en(adq_bodega_sucursal(k.bodega_codigo))
)
select b.*,
  b.en_stock - b.comprometido + b.pedido + b.en_solicitud as disponible,
  (b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo) as bajo_minimo,
  case when b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo then
    greatest(coalesce(b.reorden, 0), ceil(b.minimo + b.consumo_mensual - (b.en_stock - b.comprometido + b.pedido + b.en_solicitud)))
  end as sugerido,
  case when b.consumo_mensual > 0 then greatest(0, floor(30 * (b.en_stock - b.comprometido + b.pedido) / b.consumo_mensual))::int end as cobertura_dias
from base b;

-- ---------------------------------------------------------------- RLS y privilegios

alter table public.sap_recepciones          enable row level security;
alter table public.sap_recetas              enable row level security;
alter table public.sap_ot                   enable row level security;
alter table public.sap_ot_lineas            enable row level security;
alter table public.sap_planificacion_estado enable row level security;
alter table public.adq_bodega_stock         enable row level security;
alter table public.adq_bodega_historial     enable row level security;

drop policy if exists sap_recepciones_select on public.sap_recepciones;
create policy sap_recepciones_select on public.sap_recepciones for select to authenticated
  using (adq_ve_reposicion_en(adq_bodega_sucursal(bodega_codigo)));
drop policy if exists sap_recetas_select on public.sap_recetas;
create policy sap_recetas_select on public.sap_recetas for select to authenticated using (adq_tiene_acceso());
drop policy if exists sap_ot_select on public.sap_ot;
create policy sap_ot_select on public.sap_ot for select to authenticated using (adq_ve_reposicion() or adq_ve_control());
drop policy if exists sap_ot_lineas_select on public.sap_ot_lineas;
create policy sap_ot_lineas_select on public.sap_ot_lineas for select to authenticated using (adq_ve_reposicion() or adq_ve_control());
drop policy if exists sap_planificacion_estado_select on public.sap_planificacion_estado;
create policy sap_planificacion_estado_select on public.sap_planificacion_estado for select to authenticated using (adq_tiene_acceso());
-- Bodega se escribe solo con adq_guardar_conteo / adq_revertir_conteo
drop policy if exists adq_bodega_stock_select on public.adq_bodega_stock;
create policy adq_bodega_stock_select on public.adq_bodega_stock for select to authenticated
  using (adq_ve_reposicion_en(adq_bodega_sucursal(bodega_codigo)));
drop policy if exists adq_bodega_historial_select on public.adq_bodega_historial;
create policy adq_bodega_historial_select on public.adq_bodega_historial for select to authenticated
  using (adq_ve_reposicion_en(adq_bodega_sucursal(bodega_codigo)));

revoke all on public.sap_recepciones, public.sap_recetas, public.sap_ot, public.sap_ot_lineas, public.sap_planificacion_estado,
              public.adq_bodega_stock, public.adq_bodega_historial, public.adq_bodega_v, public.adq_bodega_historial_v,
              public.adq_reposicion_v
  from anon, authenticated;
grant select on public.sap_recepciones, public.sap_recetas, public.sap_ot, public.sap_ot_lineas, public.sap_planificacion_estado,
                public.adq_bodega_stock, public.adq_bodega_historial, public.adq_bodega_v, public.adq_bodega_historial_v,
                public.adq_reposicion_v
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
grant execute on function public.adq_guardar_conteo(jsonb, text), public.adq_revertir_conteo(bigint, text) to authenticated;
-- interna: la llaman las dos de arriba
revoke execute on function public.adq_bodega_aplicar(text, text, numeric, numeric, numeric, text, text, text, bigint, timestamptz)
  from authenticated;
revoke all on function public.sap_compras_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_compras_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

-- Adquisiciones: control de gasto (sobre 20261016120000_adquisiciones.sql, que debe aplicarse antes).
--
--   Centro de costo obligatorio: cada solicitud lleva un CECO de SAP (dimension 1, OPRC). El 4o digito
--     del codigo dice la sucursal (1 Santiago, 2 Puerto Varas) y los dos primeros la linea de negocio,
--     igual que en Ventas SAP; la solicitud toma la sucursal de su CECO.
--   Presupuesto anual por CECO (adq_presupuestos, lo carga el jefe de compras; SAP no tiene presupuestos).
--     Ejecutado = lineas de OC de SAP con ese CECO en el anio (todas, pasen o no por el portal).
--     Comprometido = solicitudes en aprobacion o aprobadas sin OC todavia.
--   Facturas de proveedor ligadas a cada OC (OPCH, directo o via la entrada de mercaderia).
--   Reposicion de stock: SAP no tiene minimos, se definen aqui por articulo y bodega (B006 Santiago,
--     B007 Puerto Varas), con el consumo de los ultimos 6 meses (OINM) como ayuda.
--   Tiempos de cada etapa (enviada_at, aprobada_at, oc_at) para el dashboard.
--   Rol nuevo: bodega (ve la reposicion, define minimos y crea solicitudes).
--
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- utilidades

create or replace function public.adq_ceco_sucursal(p_codigo text)
returns text language sql immutable as $$
  select case when p_codigo ~ '^\d{4}$' then
    case substr(p_codigo, 4, 1) when '1' then 'Santiago' when '2' then 'Puerto Varas' end end
$$;

-- Mismo mapa que tareas\sincronizar-sap-ventas.ps1; 9xxx son CECO de administracion (sin linea)
create or replace function public.adq_ceco_linea(p_codigo text)
returns text language sql immutable as $$
  select case when p_codigo ~ '^\d{4}$' then
    case left(p_codigo, 2)
      when '11' then 'SIP' when '12' then 'Madera' when '13' then 'Acero' when '14' then 'Escaleras'
      when '15' then 'Wall' when '16' then 'Tecno Home' when '17' then 'Viv. Ind. Panelizada'
      when '18' then 'Viv. Ind. Modular' else 'Administración' end end
$$;

create or replace function public.adq_bodega_sucursal(p_bodega text)
returns text language sql immutable as $$
  select case p_bodega when 'B006' then 'Santiago' when 'B007' then 'Puerto Varas' end
$$;

-- Quien ve gasto, presupuesto y reportes: Compras y aprobadores
create or replace function public.adq_ve_control()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_es_compras() or adq_mi_nivel() > 0
$$;

create or replace function public.adq_ve_reposicion()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_es_compras() or adq_tiene('bodega')
$$;

-- ---------------------------------------------------------------- SAP (solo lectura)

create table if not exists public.sap_centros_costo (
  codigo   text primary key,     -- OPRC.PrcCode, dimension 1 (CECO)
  nombre   text not null,
  sucursal text,                 -- segun el codigo; null = sin sucursal (p. ej. el general)
  linea    text,
  activo   boolean not null default true
);

alter table public.sap_oc add column if not exists neto numeric(18, 2) not null default 0;          -- suma de lineas, CLP
alter table public.sap_oc add column if not exists facturado numeric(18, 2) not null default 0;     -- neto facturado de esta OC
alter table public.sap_oc_lineas add column if not exists ceco text;    -- POR1.OcrCode
alter table public.sap_oc_lineas add column if not exists wip text;     -- POR1.OcrCode2 (tarea WIP)
create index if not exists sap_oc_lineas_ceco_idx on public.sap_oc_lineas (ceco);
create index if not exists sap_oc_fecha_idx on public.sap_oc (fecha);

-- Facturas de proveedor de cada OC. neto_oc: la parte de la factura que corresponde a esta OC.
create table if not exists public.sap_oc_facturas (
  oc_doc_entry int not null references public.sap_oc(doc_entry) on delete cascade,
  doc_entry    int not null,     -- OPCH.DocEntry
  docnum       int not null,
  folio        text,             -- tipo y folio SII, p. ej. 33-4825
  fecha        date not null,
  vencimiento  date,
  total        numeric(18, 2) not null default 0,    -- con IVA
  pagado       numeric(18, 2) not null default 0,
  abierta      boolean not null default true,
  cancelada    boolean not null default false,
  neto_oc      numeric(18, 2) not null default 0,
  primary key (oc_doc_entry, doc_entry)
);

-- Salidas de los ultimos 6 meses por articulo y bodega (OINM: salidas a produccion, entregas, facturas)
create table if not exists public.sap_consumo (
  articulo_codigo text not null,
  bodega_codigo   text not null,
  salidas_6m      numeric(18, 4) not null default 0,
  primary key (articulo_codigo, bodega_codigo)
);

-- ---------------------------------------------------------------- tablas del portal

create table if not exists public.adq_presupuestos (
  centro_costo text not null,
  anio int not null check (anio between 2020 and 2100),
  monto numeric(14, 0) not null check (monto >= 0),     -- neto CLP del anio
  actualizado_por uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (centro_costo, anio)
);

create table if not exists public.adq_reposicion (
  articulo_codigo text not null,
  bodega_codigo text not null check (bodega_codigo in ('B006', 'B007')),
  minimo numeric(14, 4) not null check (minimo >= 0),
  reorden numeric(14, 4) check (reorden is null or reorden > 0),   -- cuanto pedir; null = hasta minimo + 1 mes de consumo
  actualizado_por uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (articulo_codigo, bodega_codigo)
);

alter table public.adq_solicitudes add column if not exists enviada_at timestamptz;
alter table public.adq_solicitudes add column if not exists aprobada_at timestamptz;
alter table public.adq_solicitudes add column if not exists oc_at timestamptz;

-- Centro de costo obligatorio. Las solicitudes previas sin CECO quedan en el general.
update public.adq_solicitudes set centro_costo = 'Stelle_Z' where centro_costo is null;
alter table public.adq_solicitudes alter column centro_costo set not null;
create index if not exists adq_solicitudes_ceco_idx on public.adq_solicitudes (centro_costo);

-- ---------------------------------------------------------------- triggers de la solicitud

create or replace function public.adq_ceco_valido(p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  -- sin centros sincronizados (base sin SAP) no se puede validar: se acepta
  select not exists (select 1 from sap_centros_costo)
      or exists (select 1 from sap_centros_costo where codigo = p_codigo and activo)
$$;

-- El CECO tiene que existir en SAP y fija la sucursal. Solo se valida al crear o al cambiarlo.
create or replace function public.adq_solicitud_ceco()
returns trigger language plpgsql set search_path = public as $$
begin
  new.centro_costo := btrim(coalesce(new.centro_costo, ''));
  if tg_op = 'INSERT' or new.centro_costo is distinct from old.centro_costo then
    if new.centro_costo = '' then
      raise exception 'Elige el centro de costo' using errcode = '22023';
    end if;
    if not adq_ceco_valido(new.centro_costo) then
      raise exception 'El centro de costo % no existe en SAP o está inactivo', new.centro_costo using errcode = '22023';
    end if;
  end if;
  new.sucursal := coalesce(adq_ceco_sucursal(new.centro_costo), new.sucursal);
  return new;
end $$;
drop trigger if exists adq_solicitud_ceco on public.adq_solicitudes;
create trigger adq_solicitud_ceco before insert or update on public.adq_solicitudes
  for each row execute function public.adq_solicitud_ceco();

-- Fecha de cada etapa, segun el cambio de estado (que solo hacen las funciones adq_*)
create or replace function public.adq_solicitud_tiempos()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.enviada_at := null; new.aprobada_at := null; new.oc_at := null;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    new.enviada_at := old.enviada_at; new.aprobada_at := old.aprobada_at; new.oc_at := old.oc_at;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_aprobacion' then
      new.enviada_at := now(); new.aprobada_at := null; new.oc_at := null;
    elsif new.estado = 'aprobada' and old.estado = 'en_aprobacion' then
      new.aprobada_at := now();
    elsif new.estado = 'oc_emitida' and old.estado = 'aprobada' then
      new.oc_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists adq_solicitud_tiempos on public.adq_solicitudes;
create trigger adq_solicitud_tiempos before insert or update on public.adq_solicitudes
  for each row execute function public.adq_solicitud_tiempos();

-- Bodega tambien crea solicitudes (las de reposicion)
drop policy if exists adq_solicitudes_insert on public.adq_solicitudes;
create policy adq_solicitudes_insert on public.adq_solicitudes for insert to authenticated
  with check (adq_tiene('solicitante') or adq_tiene('bodega') or adq_es_compras());

-- ---------------------------------------------------------------- presupuesto

-- Presupuesto, ejecutado en SAP y comprometido en el portal de un CECO en un anio. La usan las vistas,
-- que la llaman con los permisos de quien consulta: por eso queda para authenticated.
create or replace function public.adq_presupuesto_ceco(p_ceco text, p_anio int)
returns table (presupuesto numeric, ejecutado numeric, comprometido numeric)
language sql stable security definer set search_path = public as $$
  select
    (select p.monto from adq_presupuestos p where p.centro_costo = p_ceco and p.anio = p_anio),
    coalesce((select sum(l.total) from sap_oc_lineas l join sap_oc o on o.doc_entry = l.doc_entry
              where l.ceco = p_ceco and not o.cancelada and extract(year from o.fecha) = p_anio), 0),
    coalesce((select sum(s.monto_aprobacion) from adq_solicitudes s
              where s.centro_costo = p_ceco and s.estado in ('en_aprobacion', 'aprobada')
                and extract(year from coalesce(s.enviada_at, s.created_at) at time zone 'America/Santiago') = p_anio), 0)
  where adq_ve_control()   -- solo Compras y aprobadores; para el resto no devuelve fila
$$;

-- Lo mismo para el CECO de una solicitud, solo para Compras y aprobadores. esta_incluida: la solicitud
-- ya suma en el comprometido (en aprobacion o aprobada); si no, el front le suma su monto de referencia.
create or replace function public.adq_presupuesto_solicitud(p_solicitud_id uuid)
returns table (centro_costo text, anio int, presupuesto numeric, ejecutado numeric, comprometido numeric, esta_incluida boolean)
language sql stable security definer set search_path = public as $$
  select s.centro_costo, x.anio, p.presupuesto, p.ejecutado, p.comprometido, s.estado in ('en_aprobacion', 'aprobada')
  from adq_solicitudes s
  cross join lateral (select extract(year from coalesce(s.enviada_at, s.created_at) at time zone 'America/Santiago')::int as anio) x
  cross join lateral adq_presupuesto_ceco(s.centro_costo, x.anio) p
  where s.id = p_solicitud_id and adq_ve(s.id) and adq_ve_control()
$$;

create or replace function public.adq_guardar_presupuestos(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not adq_tiene('jefe_compras') then raise exception 'Solo el jefe de compras carga los presupuestos' using errcode = '42501'; end if;
  -- monto vacio o 0: se quita
  delete from adq_presupuestos a
  using jsonb_array_elements(p) f
  where a.centro_costo = f ->> 'centro_costo' and a.anio = (f ->> 'anio')::int and coalesce((f ->> 'monto')::numeric, 0) = 0;
  insert into adq_presupuestos (centro_costo, anio, monto, actualizado_por, updated_at)
  select f ->> 'centro_costo', (f ->> 'anio')::int, (f ->> 'monto')::numeric, auth.uid(), now()
  from jsonb_array_elements(p) f
  where coalesce((f ->> 'monto')::numeric, 0) > 0
  on conflict (centro_costo, anio) do update
    set monto = excluded.monto, actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at;
end $$;

-- ---------------------------------------------------------------- reposicion

create or replace function public.adq_guardar_reposicion(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not adq_ve_reposicion() then raise exception 'Solo Compras o Bodega definen los mínimos' using errcode = '42501'; end if;
  -- minimo vacio: se quita
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

-- ---------------------------------------------------------------- sincronizacion con SAP

-- p = { proveedores, articulos, oc, lineas (con ceco y wip), centros: [{codigo,nombre,activo}],
--       facturas: [{oc_doc_entry,doc_entry,docnum,folio,fecha,vencimiento,total,pagado,abierta,cancelada,neto_oc}],
--       consumo: [{articulo_codigo,bodega_codigo,salidas_6m}] }
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

  -- los centros solo se reemplazan si vienen (un CECO que se use en una solicitud y desaparezca de SAP
  -- no rompe nada: se valida al crear o cambiar)
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

  update sap_oc o set cantidad_total = l.cantidad, cantidad_pendiente = l.pendiente, neto = l.neto
  from (select doc_entry, sum(cantidad) as cantidad, sum(pendiente) as pendiente, sum(total) as neto
        from sap_oc_lineas group by doc_entry) l
  where l.doc_entry = o.doc_entry;
  update sap_oc o set facturado = f.neto
  from (select oc_doc_entry, sum(neto_oc) as neto from sap_oc_facturas where not cancelada group by oc_doc_entry) f
  where f.oc_doc_entry = o.doc_entry;

  if jsonb_typeof(p -> 'consumo') = 'array' then
    delete from sap_consumo where true;
    insert into sap_consumo (articulo_codigo, bodega_codigo, salidas_6m)
    select f ->> 'articulo_codigo', f ->> 'bodega_codigo', coalesce((f ->> 'salidas_6m')::numeric, 0)
    from jsonb_array_elements(p -> 'consumo') f
    on conflict do nothing;
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
                            'consumo', (select count(*) from sap_consumo)) || v_adq;
end $$;

-- ---------------------------------------------------------------- vistas (se recrean: s.* y o.* cambian)

drop view if exists public.adq_solicitudes_v;
create view public.adq_solicitudes_v as
select s.*,
  adq_nombre(s.creado_por) as creado_por_nombre,
  adq_nombre(s.cerrado_por) as cerrado_por_nombre,
  p.nombre as proyecto_nombre,
  cc.nombre as centro_costo_nombre,
  adq_ceco_linea(s.centro_costo) as linea,
  coalesce(i.n, 0)::int as items,
  i.estimado as monto_estimado,
  coalesce(c.n, 0)::int as cotizaciones,
  e.proveedor_nombre as proveedor_elegido,
  coalesce(s.monto_aprobacion, i.estimado) as monto_referencia,
  (select string_agg(n.nombre, ', ' order by n.nivel) from adq_niveles n
   where s.estado = 'en_aprobacion' and n.nivel = s.nivel_aprobado + 1) as nivel_pendiente_nombre,
  adq_puede_aprobar(s.id) as puedo_aprobar,
  (s.estado = 'cotizando' and adq_compras_de(s.sucursal)) as puedo_cotizar,
  coalesce(oc.docnums, '') as oc_docnums,
  oc.recepcion_pct,
  oc.facturado
from adq_solicitudes s
left join proyectos p on p.id = s.proyecto_id
left join sap_centros_costo cc on cc.codigo = s.centro_costo
left join adq_cotizaciones e on e.id = s.cotizacion_id
left join lateral (
  select count(*) as n, sum(x.cantidad * x.precio_estimado) as estimado from adq_items x where x.solicitud_id = s.id
) i on true
left join lateral (select count(*) as n from adq_cotizaciones x where x.solicitud_id = s.id) c on true
left join lateral (
  select string_agg(x.docnum::text, ', ' order by x.docnum) as docnums,
         case when sum(o.cantidad_total) > 0
              then round(100 * (sum(o.cantidad_total) - sum(o.cantidad_pendiente)) / sum(o.cantidad_total)) end::int as recepcion_pct,
         sum(o.facturado) as facturado
  from adq_oc x left join sap_oc o on o.docnum = x.docnum and not o.cancelada
  where x.solicitud_id = s.id
) oc on true
where adq_ve_fila(s.creado_por, s.sucursal);

drop view if exists public.adq_oc_v;
create view public.adq_oc_v as
select x.solicitud_id, x.docnum, x.automatica, x.created_at, adq_nombre(x.vinculado_por) as vinculado_por_nombre,
  o.doc_entry, o.proveedor_nombre, o.fecha, o.fecha_entrega, o.abierta, o.cancelada, o.total, o.iva, o.moneda,
  o.cantidad_total, o.cantidad_pendiente, o.neto, o.facturado,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  (o.doc_entry is not null) as en_sap
from adq_oc x left join sap_oc o on o.docnum = x.docnum
where adq_ve(x.solicitud_id);

drop view if exists public.adq_sap_oc_v;
create view public.adq_sap_oc_v as
select o.*,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  case when o.neto > 0 then least(100, round(100 * o.facturado / o.neto))::int end as facturado_pct,
  (select string_agg(distinct l.ceco, ', ') from sap_oc_lineas l where l.doc_entry = o.doc_entry) as cecos,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc o
where adq_es_compras();

-- Gasto real en SAP (lineas de OC no canceladas) por mes, CECO y proveedor. Para el dashboard.
drop view if exists public.adq_gasto_v;
create view public.adq_gasto_v as
select extract(year from o.fecha)::int as anio, extract(month from o.fecha)::int as mes,
  coalesce(l.ceco, '') as centro_costo, cc.nombre as centro_costo_nombre,
  coalesce(adq_ceco_sucursal(l.ceco), adq_bodega_sucursal(l.bodega)) as sucursal,
  adq_ceco_linea(l.ceco) as linea,
  o.proveedor_nombre,
  sum(l.total) as neto,
  count(distinct o.doc_entry)::int as oc
from sap_oc_lineas l
join sap_oc o on o.doc_entry = l.doc_entry and not o.cancelada
left join sap_centros_costo cc on cc.codigo = l.ceco
where adq_ve_control()
group by 1, 2, 3, 4, 5, 6, 7;

-- Presupuesto, ejecutado (SAP) y comprometido (portal) por CECO y anio
drop view if exists public.adq_presupuesto_v;
create view public.adq_presupuesto_v as
with claves as (
  select centro_costo, anio from adq_presupuestos
  union
  select l.ceco, extract(year from o.fecha)::int from sap_oc_lineas l join sap_oc o on o.doc_entry = l.doc_entry
  where l.ceco is not null and not o.cancelada
  union
  select centro_costo, extract(year from coalesce(enviada_at, created_at) at time zone 'America/Santiago')::int
  from adq_solicitudes where estado in ('en_aprobacion', 'aprobada')
)
select k.centro_costo, k.anio, cc.nombre as centro_costo_nombre,
  coalesce(cc.sucursal, adq_ceco_sucursal(k.centro_costo)) as sucursal, adq_ceco_linea(k.centro_costo) as linea,
  p.presupuesto, p.ejecutado, p.comprometido,
  (select count(*)::int from adq_solicitudes s where s.centro_costo = k.centro_costo
     and extract(year from s.created_at at time zone 'America/Santiago') = k.anio and s.estado not in ('anulada', 'rechazada')) as solicitudes
from claves k
left join sap_centros_costo cc on cc.codigo = k.centro_costo
cross join lateral adq_presupuesto_ceco(k.centro_costo, k.anio) p
where adq_ve_control();

-- Reposicion: stock de SAP de B006/B007, minimos del portal, consumo y lo ya pedido en solicitudes abiertas
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
    round(coalesce(c.salidas_6m, 0) / 6, 4) as consumo_mensual,
    r.minimo, r.reorden, r.updated_at as minimo_actualizado
  from claves k
  left join sap_stock st on st.articulo_codigo = k.articulo_codigo and st.bodega_codigo = k.bodega_codigo
  left join sap_articulos a on a.codigo = k.articulo_codigo
  left join sap_consumo c on c.articulo_codigo = k.articulo_codigo and c.bodega_codigo = k.bodega_codigo
  left join adq_reposicion r on r.articulo_codigo = k.articulo_codigo and r.bodega_codigo = k.bodega_codigo
)
select b.*,
  b.en_stock - b.comprometido + b.pedido + b.en_solicitud as disponible,
  (b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo) as bajo_minimo,
  case when b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo then
    greatest(coalesce(b.reorden, 0), ceil(b.minimo + b.consumo_mensual - (b.en_stock - b.comprometido + b.pedido + b.en_solicitud)))
  end as sugerido,
  case when b.consumo_mensual > 0 then greatest(0, floor(30 * (b.en_stock - b.comprometido + b.pedido) / b.consumo_mensual))::int end as cobertura_dias
from base b
where adq_ve_reposicion();

-- ---------------------------------------------------------------- RLS y privilegios

alter table public.sap_centros_costo enable row level security;
alter table public.sap_oc_facturas   enable row level security;
alter table public.sap_consumo       enable row level security;
alter table public.adq_presupuestos  enable row level security;
alter table public.adq_reposicion    enable row level security;

drop policy if exists sap_centros_costo_select on public.sap_centros_costo;
create policy sap_centros_costo_select on public.sap_centros_costo for select to authenticated using (adq_tiene_acceso());
drop policy if exists sap_oc_facturas_select on public.sap_oc_facturas;
create policy sap_oc_facturas_select on public.sap_oc_facturas for select to authenticated
  using (adq_es_compras() or adq_ve_oc_sap(oc_doc_entry));
drop policy if exists sap_consumo_select on public.sap_consumo;
create policy sap_consumo_select on public.sap_consumo for select to authenticated using (adq_ve_reposicion());
drop policy if exists adq_presupuestos_select on public.adq_presupuestos;
create policy adq_presupuestos_select on public.adq_presupuestos for select to authenticated using (adq_ve_control());
drop policy if exists adq_reposicion_select on public.adq_reposicion;
create policy adq_reposicion_select on public.adq_reposicion for select to authenticated using (adq_ve_reposicion());

revoke all on public.sap_centros_costo, public.sap_oc_facturas, public.sap_consumo, public.adq_presupuestos,
              public.adq_reposicion, public.adq_solicitudes_v, public.adq_oc_v, public.adq_sap_oc_v, public.adq_gasto_v,
              public.adq_presupuesto_v, public.adq_reposicion_v
  from anon, authenticated;
grant select on public.sap_centros_costo, public.sap_oc_facturas, public.sap_consumo, public.adq_presupuestos,
                public.adq_reposicion, public.adq_solicitudes_v, public.adq_oc_v, public.adq_sap_oc_v, public.adq_gasto_v,
                public.adq_presupuesto_v, public.adq_reposicion_v
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
  public.adq_ceco_sucursal(text), public.adq_ceco_linea(text), public.adq_bodega_sucursal(text),
  public.adq_ve_control(), public.adq_ve_reposicion(), public.adq_ceco_valido(text),
  public.adq_solicitud_ceco(), public.adq_solicitud_tiempos(),
  public.adq_presupuesto_ceco(text, int), public.adq_presupuesto_solicitud(uuid),
  public.adq_guardar_presupuestos(jsonb), public.adq_guardar_reposicion(jsonb)
  to authenticated;
revoke all on function public.sap_compras_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_compras_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

-- Portal Adquisiciones (/adquisiciones): solicitudes de compra de toda la empresa.
--
-- Flujo: quien necesita algo crea la solicitud de compra (SC) con sus items -> Compras pide y carga
-- cotizaciones -> Compras elige una y la envia a aprobacion -> se aprueba por niveles segun el monto
-- neto de la cotizacion elegida (adq_niveles, configurable) -> Compras emite la OC en SAP Business One
-- y la vincula a la SC (a mano, o sola si el comentario o la referencia de la OC dice "SC-<numero>")
-- -> cuando SAP muestra la OC recibida completa, la SC queda "recibida".
--
-- La OC oficial vive en SAP: el portal solo la lee. sap_proveedores, sap_articulos, sap_oc y
-- sap_oc_lineas las llena stack\tareas\sincronizar-sap-compras.ps1 cada hora con la RPC
-- sap_compras_sincronizar (service_role), que reemplaza todo y despues revisa las SC (adq_sap_actualizar).
--
-- Accesos: pseudo-proyecto ancla propio (slug 'adquisiciones', tipo 'sistema'), un rol por fila de
-- permisos: modulo_key 'adq:<rol>', accion 'ver'. Roles:
--   solicitante    crea solicitudes y ve las suyas
--   comprador      ve las de su sucursal (profiles.sucursal; sin sucursal, ambas): cotizaciones, envio a
--                  aprobacion, vinculo con la OC de SAP, anulacion
--   aprobador_1..3 aprueba hasta ese nivel las de su sucursal (quien aprueba un nivel aprueba tambien los
--                  de abajo que esten pendientes). Nadie aprueba una solicitud creada por si mismo.
--   jefe_compras   todo lo de comprador en ambas sucursales, y los niveles de aprobacion
-- Los admin del hub (rol admin, super admin, root) tienen todos los roles.
--
-- Correos: los triggers y funciones dejan los avisos en adq_correos y la tarea TP-Correos-Adquisiciones
-- (23-adquisiciones.ps1) los manda cada 5 minutos por el mailer del servidor.
--
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla de accesos

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('a7c4e1d2-3b5f-4e8a-9c61-2f0d8b4e7a35', 'Adquisiciones (sistema)', 'adquisiciones', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del portal Adquisiciones. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.adq_ancla_id()
returns uuid language sql immutable as $$
  select 'a7c4e1d2-3b5f-4e8a-9c61-2f0d8b4e7a35'::uuid
$$;

-- Direccion publica del portal, para los enlaces de los correos
create or replace function public.adq_url_base()
returns text language sql immutable as $$
  select 'https://portal.tecnopanel.cl:8080'
$$;

-- ---------------------------------------------------------------- roles

create or replace function public.adq_es_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin'))
$$;

create or replace function public.adq_usuario_tiene(p_rol text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_es_admin(p_user_id) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = adq_ancla_id() and pe.modulo_key = 'adq:' || p_rol)
$$;

create or replace function public.adq_tiene(p_rol text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_usuario_tiene(p_rol, auth.uid())
$$;

create or replace function public.adq_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select adq_es_admin(p_user_id) or exists (
    select 1 from permisos pe where pe.user_id = p_user_id and pe.proyecto_id = adq_ancla_id() and pe.modulo_key like 'adq:%')
$$;

-- Nivel de aprobacion mas alto del usuario (0 = no aprueba). Los admin, el mas alto.
create or replace function public.adq_usuario_nivel(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when adq_es_admin(p_user_id) then 3
    else coalesce((
      select max(substr(pe.modulo_key, 15)::int)   -- 'adq:aprobador_<n>'
      from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
      where pe.user_id = p_user_id and pe.proyecto_id = adq_ancla_id() and pe.modulo_key ~ '^adq:aprobador_[1-3]$'), 0)
  end
$$;

create or replace function public.adq_mi_nivel()
returns int language sql stable security definer set search_path = public as $$
  select adq_usuario_nivel(auth.uid())
$$;

-- Comprador o jefe de compras (el jefe en ambas sucursales)
create or replace function public.adq_es_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_tiene('comprador') or adq_tiene('jefe_compras')
$$;

create or replace function public.adq_usuario_en_sucursal(p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id
      and (p.sucursal is null or p.sucursal = p_sucursal
           or coalesce(p.is_super_admin, false) or coalesce(p.is_root, false)
           or p.rol in ('admin', 'gerente_general')))
$$;

create or replace function public.adq_en_sucursal(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_usuario_en_sucursal(auth.uid(), p_sucursal)
$$;

-- Compras de esa sucursal (el jefe de compras, de todas)
create or replace function public.adq_compras_de(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_tiene('jefe_compras') or (adq_tiene('comprador') and adq_en_sucursal(p_sucursal))
$$;

-- Personas con un rol explicito (sin los admin implicitos, para no llenarles el correo).
-- p_sucursal null: todas las sucursales.
create or replace function public.adq_usuarios_con(p_rol text, p_sucursal text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct pe.user_id
  from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
  where pe.proyecto_id = adq_ancla_id() and pe.modulo_key = 'adq:' || p_rol
    and (p_sucursal is null or p.sucursal is null or p.sucursal = p_sucursal)
$$;

-- Quienes pueden aprobar el nivel indicado (ese nivel o uno mas alto) en la sucursal
create or replace function public.adq_aprobadores(p_nivel int, p_sucursal text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select u from generate_series(greatest(p_nivel, 1), 3) n, adq_usuarios_con('aprobador_' || n, p_sucursal) u
$$;

-- ---------------------------------------------------------------- utilidades

create or replace function public.adq_hoy()
returns date language sql stable as $$
  select (now() at time zone 'America/Santiago')::date
$$;

create or replace function public.adq_uuid(p text)
returns uuid language sql immutable as $$
  select case when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

create or replace function public.adq_html(p text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- 1234567.4 -> '$1.234.567'
create or replace function public.adq_clp(p numeric)
returns text language sql immutable as $$
  select '$' || replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,999,990'), ',', '.')
$$;

create or replace function public.adq_nombre(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email)
  from profiles p where p.id = p_user_id
$$;

-- ---------------------------------------------------------------- SAP (solo lectura, lo llena la sincronizacion)

create table if not exists public.sap_proveedores (
  codigo   text primary key,             -- OCRD.CardCode
  nombre   text not null,
  rut      text,                         -- OCRD.LicTradNum
  telefono text,
  email    text,
  activo   boolean not null default true
);

create table if not exists public.sap_articulos (
  codigo         text primary key,       -- OITM.ItemCode (articulos de compra activos)
  nombre         text not null,
  unidad         text,                   -- unidad de compra
  grupo          text,
  ultimo_precio  numeric(18, 4),         -- OITM.LastPurPrc
  ultima_compra  date
);

create table if not exists public.sap_oc (
  doc_entry          int primary key,    -- OPOR.DocEntry
  docnum             int not null,       -- N° que ve la gente
  proveedor_codigo   text,
  proveedor_nombre   text,
  fecha              date not null,
  fecha_entrega      date,
  abierta            boolean not null,   -- DocStatus = 'O'
  cancelada          boolean not null default false,
  total              numeric(18, 2) not null default 0,  -- con IVA, en la moneda del documento
  iva                numeric(18, 2) not null default 0,
  moneda             text,
  referencia         text,               -- NumAtCard
  comentarios        text,
  cantidad_total     numeric(18, 4) not null default 0,
  cantidad_pendiente numeric(18, 4) not null default 0   -- suma de POR1.OpenQty: lo que falta recibir
);
create index if not exists sap_oc_docnum_idx on public.sap_oc (docnum);

create table if not exists public.sap_oc_lineas (
  doc_entry       int not null references public.sap_oc(doc_entry) on delete cascade,
  linea           int not null,
  articulo_codigo text,
  descripcion     text,
  cantidad        numeric(18, 4) not null default 0,
  pendiente       numeric(18, 4) not null default 0,
  precio          numeric(18, 4) not null default 0,
  total           numeric(18, 2) not null default 0,
  unidad          text,
  bodega          text,
  abierta         boolean not null default true,
  primary key (doc_entry, linea)
);

create table if not exists public.sap_compras_estado (
  id               boolean primary key default true check (id),
  sincronizado_en  timestamptz not null,
  proveedores      int not null,
  articulos        int not null,
  oc               int not null
);

-- ---------------------------------------------------------------- tablas del portal

-- Niveles de aprobacion: una solicitud necesita todos los niveles cuyo monto_desde sea <= al monto
-- neto (CLP) de la cotizacion elegida. El nivel 1 parte siempre en 0.
create table if not exists public.adq_niveles (
  nivel       int primary key check (nivel between 1 and 3),
  nombre      text not null check (btrim(nombre) <> ''),
  monto_desde numeric(14, 0) not null check (monto_desde >= 0),
  activo      boolean not null default true,
  check (nivel <> 1 or (monto_desde = 0 and activo))
);
insert into public.adq_niveles (nivel, nombre, monto_desde) values
  (1, 'Jefatura', 0),
  (2, 'Gerencia de área', 2000000),
  (3, 'Gerencia general', 10000000)
on conflict (nivel) do nothing;

create table if not exists public.adq_solicitudes (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,
  estado text not null default 'cotizando'
    check (estado in ('cotizando', 'en_aprobacion', 'aprobada', 'oc_emitida', 'recibida', 'rechazada', 'anulada')),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  area text not null check (btrim(area) <> ''),                     -- area que pide
  titulo text not null check (btrim(titulo) <> ''),
  justificacion text,
  proyecto_id uuid references public.proyectos(id) on delete set null,   -- obra a la que se carga (opcional)
  centro_costo text,                                                -- o centro de costo / linea
  prioridad text not null default 'normal' check (prioridad in ('normal', 'urgente')),
  fecha_requerida date,
  lugar_entrega text,
  -- lo fija adq_enviar_aprobacion
  cotizacion_id uuid,
  monto_aprobacion numeric(14, 0),
  nivel_requerido int not null default 0,
  nivel_aprobado int not null default 0,
  ronda int not null default 0,                                     -- veces que se envio a aprobacion
  motivo_cierre text,                                               -- de rechazo o anulacion
  creado_por uuid not null default auth.uid() references auth.users(id),
  cerrado_por uuid references auth.users(id),
  fecha_cierre timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((estado in ('recibida', 'rechazada', 'anulada')) = (fecha_cierre is not null))
);
create index if not exists adq_solicitudes_estado_idx on public.adq_solicitudes (estado, sucursal);

create table if not exists public.adq_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  orden int not null default 0,
  articulo_codigo text,                                   -- codigo SAP, si existe
  descripcion text not null check (btrim(descripcion) <> ''),
  cantidad numeric(14, 4) not null check (cantidad > 0),
  unidad text not null default 'UN' check (btrim(unidad) <> ''),
  precio_estimado numeric(14, 2) check (precio_estimado is null or precio_estimado >= 0),   -- unitario neto CLP
  created_at timestamptz not null default now()
);
create index if not exists adq_items_solicitud_idx on public.adq_items (solicitud_id, orden);

create table if not exists public.adq_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  proveedor_codigo text,                                  -- CardCode de SAP, si existe
  proveedor_nombre text not null check (btrim(proveedor_nombre) <> ''),
  proveedor_rut text,
  monto_neto numeric(14, 0) not null check (monto_neto >= 0),   -- CLP, sin IVA
  plazo_entrega_dias int check (plazo_entrega_dias is null or plazo_entrega_dias >= 0),
  condicion_pago text,
  validez date,
  observacion text,
  creado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists adq_cotizaciones_solicitud_idx on public.adq_cotizaciones (solicitud_id);

do $$ begin
  alter table public.adq_solicitudes add constraint adq_solicitudes_cotizacion_fk
    foreign key (cotizacion_id) references public.adq_cotizaciones(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.adq_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  ronda int not null,
  nivel int not null check (nivel between 1 and 3),
  decision text not null check (decision in ('aprobada', 'rechazada', 'devuelta')),
  comentario text,
  monto numeric(14, 0),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists adq_aprobaciones_solicitud_idx on public.adq_aprobaciones (solicitud_id, created_at);

-- OC de SAP vinculadas (una solicitud puede terminar en varias OC, p. ej. por proveedor)
create table if not exists public.adq_oc (
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  docnum int not null check (docnum > 0),
  automatica boolean not null default false,              -- la vinculo la sincronizacion por "SC-<n>"
  vinculado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (solicitud_id, docnum)
);
create index if not exists adq_oc_docnum_idx on public.adq_oc (docnum);

-- Adjuntos de la solicitud (especificaciones, planos) y de cada cotizacion, en el bucket
-- 'adquisiciones': <solicitud_id>/docs/<archivo> y <solicitud_id>/cot/<cotizacion_id>/<archivo>
create table if not exists public.adq_archivos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  cotizacion_id uuid references public.adq_cotizaciones(id) on delete cascade,
  path text not null unique,
  nombre text not null,
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists adq_archivos_solicitud_idx on public.adq_archivos (solicitud_id);

create table if not exists public.adq_bitacora (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.adq_solicitudes(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id),
  tipo text not null default 'evento' check (tipo in ('evento', 'comentario')),
  texto text not null check (btrim(texto) <> ''),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists adq_bitacora_solicitud_idx on public.adq_bitacora (solicitud_id, created_at);

-- Cola de correos. Nadie la lee desde la web: la vacia la tarea TP-Correos-Adquisiciones.
create table if not exists public.adq_correos (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  asunto text not null,
  html text not null,
  intentos int not null default 0,
  error text,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists adq_correos_pendientes_idx on public.adq_correos (created_at) where enviado_at is null;

-- ---------------------------------------------------------------- quien ve y hace que

-- Fila de la solicitud: el jefe de compras todo; el que la creo; compras y aprobadores de la sucursal
create or replace function public.adq_ve_fila(p_creado_por uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_tiene('jefe_compras') or p_creado_por = auth.uid()
      or ((adq_tiene('comprador') or adq_mi_nivel() > 0) and adq_en_sucursal(p_sucursal))
$$;

create or replace function public.adq_ve(p_solicitud_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from adq_solicitudes s where s.id = p_solicitud_id and adq_ve_fila(s.creado_por, s.sucursal))
$$;

-- Datos e items: mientras se cotiza, quien la creo o compras de la sucursal
create or replace function public.adq_puede_editar(p_solicitud_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adq_solicitudes s
    where s.id = p_solicitud_id and s.estado = 'cotizando'
      and (s.creado_por = auth.uid() or adq_compras_de(s.sucursal)))
$$;

-- Cotizaciones: compras de la sucursal, mientras se cotiza
create or replace function public.adq_puede_cotizar(p_solicitud_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adq_solicitudes s
    where s.id = p_solicitud_id and s.estado = 'cotizando' and adq_compras_de(s.sucursal))
$$;

-- Adjuntos: a la solicitud, quien puede editarla; a una cotizacion, compras
create or replace function public.adq_puede_adjuntar(p_solicitud_id uuid, p_cotizacion_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_cotizacion_id is null then adq_puede_editar(p_solicitud_id)
    else adq_puede_cotizar(p_solicitud_id)
         and exists (select 1 from adq_cotizaciones c where c.id = p_cotizacion_id and c.solicitud_id = p_solicitud_id)
  end
$$;

create or replace function public.adq_puede_borrar_archivo(p_solicitud_id uuid, p_subido_por uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adq_solicitudes s
    where s.id = p_solicitud_id and s.estado = 'cotizando'
      and (p_subido_por = auth.uid() or adq_compras_de(s.sucursal)))
$$;

-- La persona puede aprobar ahora: esta en aprobacion, le alcanza el nivel pendiente y no la creo
create or replace function public.adq_puede_aprobar(p_solicitud_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adq_solicitudes s
    where s.id = p_solicitud_id and s.estado = 'en_aprobacion'
      and s.creado_por is distinct from auth.uid()
      and adq_mi_nivel() >= s.nivel_aprobado + 1
      and adq_en_sucursal(s.sucursal))
$$;

-- OC de SAP vinculada a una solicitud que la persona ve (para leer sus lineas)
create or replace function public.adq_ve_oc_sap(p_doc_entry int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sap_oc o join adq_oc x on x.docnum = o.docnum
    where o.doc_entry = p_doc_entry and adq_ve(x.solicitud_id))
$$;

-- Storage: la ruta dice de que solicitud (y cotizacion) es el objeto
create or replace function public.adq_ve_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(adq_ve(adq_uuid(split_part(p_name, '/', 1))), false)
$$;

create or replace function public.adq_puede_subir_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case split_part(p_name, '/', 2)
    when 'docs' then adq_puede_adjuntar(adq_uuid(split_part(p_name, '/', 1)), null)
    when 'cot' then adq_uuid(split_part(p_name, '/', 3)) is not null
                    and adq_puede_adjuntar(adq_uuid(split_part(p_name, '/', 1)), adq_uuid(split_part(p_name, '/', 3)))
    else false end, false)
$$;

create or replace function public.adq_puede_borrar_objeto(p_name text, p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(adq_puede_borrar_archivo(adq_uuid(split_part(p_name, '/', 1)), adq_uuid(p_owner)), false)
$$;

-- Nivel que exige un monto: el mas alto activo cuyo monto_desde no lo supera
create or replace function public.adq_nivel_para(p_monto numeric)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(nivel), 1) from adq_niveles where activo and monto_desde <= coalesce(p_monto, 0)
$$;

-- ---------------------------------------------------------------- correos

create or replace function public.adq_encolar(p_destinatarios uuid[], p_asunto text, p_html text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into adq_correos (para, asunto, html)
  select distinct lower(btrim(p.email)), p_asunto, p_html
  from profiles p
  where p.id = any (p_destinatarios)
    and p.id is distinct from auth.uid()          -- no se avisa a quien hizo la accion
    and coalesce(p.activo, true)
    and coalesce(btrim(p.email), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.adq_correo_html(p_titulo text, p_cuerpo text, p_solicitud_id uuid)
returns text language sql immutable as $$
  select '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">'
    || '<h2 style="margin:0 0 16px;font-size:19px">' || adq_html(p_titulo) || '</h2>'
    || '<div style="margin:0 0 20px;line-height:1.55">' || p_cuerpo || '</div>'
    || '<p style="margin:0 0 20px"><a href="' || adq_url_base() || '/adquisiciones/' || p_solicitud_id
    || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Abrir la solicitud</a></p>'
    || '<p style="margin:0;font-size:12px;color:#6b7280">Aviso automático del portal Adquisiciones · Tecnopanel</p>'
    || '</div></body></html>'
$$;

create or replace function public.adq_resumen_html(p_solicitud_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select '<b>SC-' || s.numero || ' · ' || adq_html(s.titulo) || '</b><br>'
    || 'Sucursal ' || adq_html(s.sucursal) || ' · ' || adq_html(s.area)
    || case when s.prioridad = 'urgente' then ' · <b style="color:#b91c1c">URGENTE</b>' else '' end || '<br>'
    || coalesce('Monto neto ' || adq_clp(s.monto_aprobacion)
                || coalesce(' · ' || adq_html(c.proveedor_nombre), '') || '<br>', '')
    || 'Pedida por ' || adq_html(coalesce(adq_nombre(s.creado_por), ''))
  from adq_solicitudes s left join adq_cotizaciones c on c.id = s.cotizacion_id
  where s.id = p_solicitud_id
$$;

create or replace function public.adq_avisar(p_destinatarios uuid[], p_solicitud_id uuid, p_asunto text, p_titulo text, p_cuerpo text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform adq_encolar(p_destinatarios, p_asunto,
    adq_correo_html(p_titulo, coalesce(p_cuerpo, '') || adq_resumen_html(p_solicitud_id), p_solicitud_id));
end $$;

create or replace function public.adq_compras_ids(p_sucursal text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select array(select adq_usuarios_con('comprador', p_sucursal) union select adq_usuarios_con('jefe_compras', null))
$$;

-- ---------------------------------------------------------------- triggers

-- BEFORE: SECURITY INVOKER a proposito, para que current_user sea 'authenticated' cuando viene de la
-- web y el dueno cuando viene de las funciones (igual que en Ingreso de Personal).
create or replace function public.adq_solicitud_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.titulo := btrim(new.titulo);
  new.area := btrim(new.area);
  new.centro_costo := nullif(btrim(coalesce(new.centro_costo, '')), '');
  new.lugar_entrega := nullif(btrim(coalesce(new.lugar_entrega, '')), '');
  new.justificacion := nullif(btrim(coalesce(new.justificacion, '')), '');
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.estado := 'cotizando';
      new.creado_por := auth.uid();
      new.cotizacion_id := null;
      new.monto_aprobacion := null;
      new.nivel_requerido := 0;
      new.nivel_aprobado := 0;
      new.ronda := 0;
      new.motivo_cierre := null;
      new.cerrado_por := null;
      new.fecha_cierre := null;
      if new.fecha_requerida < adq_hoy() then
        raise exception 'La fecha requerida no puede ser anterior a hoy' using errcode = '22023';
      end if;
    else
      if old.estado <> 'cotizando' then
        raise exception 'La solicitud ya no se puede editar (está %)', old.estado using errcode = '42501';
      end if;
      if (new.estado, new.cotizacion_id, new.monto_aprobacion, new.nivel_requerido, new.nivel_aprobado, new.ronda,
          new.motivo_cierre, new.cerrado_por, new.fecha_cierre, new.creado_por, new.created_at)
         is distinct from
         (old.estado, old.cotizacion_id, old.monto_aprobacion, old.nivel_requerido, old.nivel_aprobado, old.ronda,
          old.motivo_cierre, old.cerrado_por, old.fecha_cierre, old.creado_por, old.created_at) then
        raise exception 'El estado se cambia con las acciones de la solicitud' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists adq_solicitud_antes on public.adq_solicitudes;
create trigger adq_solicitud_antes before insert or update on public.adq_solicitudes
  for each row execute function public.adq_solicitud_antes();

create or replace function public.adq_solicitud_despues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into adq_bitacora (solicitud_id, user_id, texto) values (new.id, auth.uid(), 'Solicitud creada');
    perform adq_avisar(adq_compras_ids(new.sucursal), new.id,
      'Nueva solicitud de compra SC-' || new.numero || ': ' || new.titulo,
      'Nueva solicitud de compra SC-' || new.numero,
      '<p style="margin:0 0 12px">Hay que cotizarla.</p>');
  elsif (new.sucursal, new.area, new.titulo, new.justificacion, new.proyecto_id, new.centro_costo, new.prioridad,
         new.fecha_requerida, new.lugar_entrega)
        is distinct from
        (old.sucursal, old.area, old.titulo, old.justificacion, old.proyecto_id, old.centro_costo, old.prioridad,
         old.fecha_requerida, old.lugar_entrega) then
    insert into adq_bitacora (solicitud_id, user_id, texto) values (new.id, auth.uid(), 'Datos de la solicitud actualizados');
  end if;
  return new;
end $$;
drop trigger if exists adq_solicitud_despues on public.adq_solicitudes;
create trigger adq_solicitud_despues after insert or update on public.adq_solicitudes
  for each row execute function public.adq_solicitud_despues();

create or replace function public.adq_cotizacion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.proveedor_nombre := btrim(new.proveedor_nombre);
  new.proveedor_codigo := nullif(btrim(coalesce(new.proveedor_codigo, '')), '');
  new.proveedor_rut := nullif(upper(btrim(coalesce(new.proveedor_rut, ''))), '');
  if tg_op = 'UPDATE' and new.solicitud_id is distinct from old.solicitud_id then
    raise exception 'La cotización no se puede mover a otra solicitud' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists adq_cotizacion_antes on public.adq_cotizaciones;
create trigger adq_cotizacion_antes before insert or update on public.adq_cotizaciones
  for each row execute function public.adq_cotizacion_antes();

create or replace function public.adq_cotizacion_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare c adq_cotizaciones%rowtype;
begin
  if tg_op = 'DELETE' then c := old; else c := new; end if;
  if not exists (select 1 from adq_solicitudes where id = c.solicitud_id) then return c; end if;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (c.solicitud_id, auth.uid(),
    case tg_op when 'INSERT' then 'Cotización agregada: ' when 'UPDATE' then 'Cotización actualizada: ' else 'Cotización eliminada: ' end
    || c.proveedor_nombre || ' · ' || adq_clp(c.monto_neto) || ' neto');
  return c;
end $$;
drop trigger if exists adq_cotizacion_bitacora on public.adq_cotizaciones;
create trigger adq_cotizacion_bitacora after insert or update or delete on public.adq_cotizaciones
  for each row execute function public.adq_cotizacion_bitacora();

create or replace function public.adq_archivo_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare a adq_archivos%rowtype;
begin
  if tg_op = 'DELETE' then a := old; else a := new; end if;
  if not exists (select 1 from adq_solicitudes where id = a.solicitud_id) then return a; end if;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (a.solicitud_id, auth.uid(), case when tg_op = 'DELETE' then 'Archivo eliminado: ' else 'Archivo adjunto: ' end || a.nombre);
  return a;
end $$;
drop trigger if exists adq_archivo_bitacora on public.adq_archivos;
create trigger adq_archivo_bitacora after insert or delete on public.adq_archivos
  for each row execute function public.adq_archivo_bitacora();

-- ---------------------------------------------------------------- acciones (RPC)

-- Compras elige la cotizacion y la manda a aprobar. El monto neto de esa cotizacion fija los niveles.
create or replace function public.adq_enviar_aprobacion(p_solicitud_id uuid, p_cotizacion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s adq_solicitudes%rowtype;
  c adq_cotizaciones%rowtype;
  v_nivel int;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras envía a aprobación' using errcode = '42501'; end if;
  if s.estado <> 'cotizando' then raise exception 'La solicitud no está en cotización' using errcode = 'P0001'; end if;
  if not exists (select 1 from adq_items where solicitud_id = s.id) then
    raise exception 'La solicitud no tiene ítems' using errcode = 'P0001';
  end if;
  select * into c from adq_cotizaciones where id = p_cotizacion_id and solicitud_id = s.id;
  if not found then raise exception 'Elige una cotización de esta solicitud' using errcode = 'P0001'; end if;

  v_nivel := adq_nivel_para(c.monto_neto);
  update adq_solicitudes
  set estado = 'en_aprobacion', cotizacion_id = c.id, monto_aprobacion = c.monto_neto,
      nivel_requerido = v_nivel, nivel_aprobado = 0, ronda = s.ronda + 1
  where id = s.id;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (s.id, auth.uid(), 'Enviada a aprobación con ' || c.proveedor_nombre || ' · ' || adq_clp(c.monto_neto)
    || ' neto · requiere ' || (select string_agg(nombre, ', ' order by nivel) from adq_niveles where nivel <= v_nivel and activo));
  perform adq_avisar(array(select adq_aprobadores(1, s.sucursal)), s.id,
    'Por aprobar: SC-' || s.numero || ' · ' || s.titulo,
    'Solicitud de compra SC-' || s.numero || ' por aprobar');
end $$;

create or replace function public.adq_aprobar(p_solicitud_id uuid, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s adq_solicitudes%rowtype;
  v_hasta int;
  v_coment text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if s.estado <> 'en_aprobacion' then raise exception 'La solicitud no está en aprobación' using errcode = 'P0001'; end if;
  if s.creado_por = auth.uid() then raise exception 'No puedes aprobar una solicitud que creaste tú' using errcode = '42501'; end if;
  if not adq_puede_aprobar(s.id) then
    raise exception 'Tu nivel de aprobación no alcanza o la solicitud es de otra sucursal' using errcode = '42501';
  end if;

  -- aprueba el nivel pendiente y los siguientes que le alcancen
  v_hasta := least(adq_mi_nivel(), s.nivel_requerido);
  insert into adq_aprobaciones (solicitud_id, ronda, nivel, decision, comentario, monto, user_id)
  select s.id, s.ronda, n, 'aprobada', v_coment, s.monto_aprobacion, auth.uid()
  from generate_series(s.nivel_aprobado + 1, v_hasta) n;

  if v_hasta >= s.nivel_requerido then
    update adq_solicitudes set estado = 'aprobada', nivel_aprobado = v_hasta where id = s.id;
    insert into adq_bitacora (solicitud_id, user_id, texto)
    values (s.id, auth.uid(), 'Aprobada (nivel ' || v_hasta || ')' || coalesce(' · ' || v_coment, ''));
    perform adq_avisar(adq_compras_ids(s.sucursal) || s.creado_por, s.id,
      'Aprobada: SC-' || s.numero || ' · ' || s.titulo,
      'Solicitud de compra SC-' || s.numero || ' aprobada',
      '<p style="margin:0 0 12px">Compras ya puede emitir la OC en SAP. Para que se vincule sola, escribe <b>SC-'
      || s.numero || '</b> en los comentarios de la OC.</p>');
  else
    update adq_solicitudes set nivel_aprobado = v_hasta where id = s.id;
    insert into adq_bitacora (solicitud_id, user_id, texto)
    values (s.id, auth.uid(), 'Aprobado el nivel ' || v_hasta || ' de ' || s.nivel_requerido || coalesce(' · ' || v_coment, ''));
    perform adq_avisar(array(select adq_aprobadores(v_hasta + 1, s.sucursal)), s.id,
      'Por aprobar: SC-' || s.numero || ' · ' || s.titulo,
      'Solicitud de compra SC-' || s.numero || ' por aprobar',
      '<p style="margin:0 0 12px">Ya pasó el nivel ' || v_hasta || '. Falta tu aprobación.</p>');
  end if;
end $$;

-- Rechazar cierra la solicitud. Devolver la manda de vuelta a cotizacion (otra cotizacion, mas datos).
create or replace function public.adq_rechazar(p_solicitud_id uuid, p_motivo text, p_devolver boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  s adq_solicitudes%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo' using errcode = 'P0001'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if s.estado <> 'en_aprobacion' then raise exception 'La solicitud no está en aprobación' using errcode = 'P0001'; end if;
  if not adq_puede_aprobar(s.id) then raise exception 'No puedes decidir esta solicitud' using errcode = '42501'; end if;

  insert into adq_aprobaciones (solicitud_id, ronda, nivel, decision, comentario, monto, user_id)
  values (s.id, s.ronda, s.nivel_aprobado + 1, case when p_devolver then 'devuelta' else 'rechazada' end,
          v_motivo, s.monto_aprobacion, auth.uid());
  if p_devolver then
    update adq_solicitudes set estado = 'cotizando', nivel_aprobado = 0 where id = s.id;
    insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'Devuelta a cotización · ' || v_motivo);
  else
    update adq_solicitudes set estado = 'rechazada', motivo_cierre = v_motivo, cerrado_por = auth.uid(), fecha_cierre = now()
    where id = s.id;
    insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'Rechazada · ' || v_motivo);
  end if;
  perform adq_avisar(adq_compras_ids(s.sucursal) || s.creado_por, s.id,
    case when p_devolver then 'Devuelta: SC-' else 'Rechazada: SC-' end || s.numero || ' · ' || s.titulo,
    'Solicitud de compra SC-' || s.numero || case when p_devolver then ' devuelta a cotización' else ' rechazada' end,
    '<p style="margin:0 0 12px">Motivo: ' || adq_html(v_motivo) || '</p>');
end $$;

-- Vincula una OC de SAP (por su N°). Si la sincronizacion ya la trajo, se valida que exista.
create or replace function public.adq_vincular_oc(p_solicitud_id uuid, p_docnum int)
returns void language plpgsql security definer set search_path = public as $$
declare s adq_solicitudes%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if p_docnum is null or p_docnum <= 0 then raise exception 'Indica el N° de la OC de SAP' using errcode = 'P0001'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras vincula órdenes de compra' using errcode = '42501'; end if;
  if s.estado not in ('aprobada', 'oc_emitida') then
    raise exception 'Solo se vinculan OC a solicitudes aprobadas' using errcode = 'P0001';
  end if;
  -- Una OC mas nueva que la ultima sincronizada se acepta: la proxima sincronizacion la trae
  if exists (select 1 from sap_oc) and not exists (select 1 from sap_oc where docnum = p_docnum)
     and p_docnum <= (select max(docnum) from sap_oc) then
    raise exception 'La OC % no existe en SAP (o está fuera del período sincronizado)', p_docnum using errcode = 'P0001';
  end if;
  insert into adq_oc (solicitud_id, docnum, vinculado_por) values (s.id, p_docnum, auth.uid())
  on conflict do nothing;
  if s.estado = 'aprobada' then update adq_solicitudes set estado = 'oc_emitida' where id = s.id; end if;
  insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'OC SAP N° ' || p_docnum || ' vinculada');
  perform adq_avisar(array[s.creado_por], s.id,
    'OC emitida: SC-' || s.numero || ' · OC SAP ' || p_docnum,
    'Se emitió la OC N° ' || p_docnum || ' para tu solicitud SC-' || s.numero);
end $$;

create or replace function public.adq_desvincular_oc(p_solicitud_id uuid, p_docnum int)
returns void language plpgsql security definer set search_path = public as $$
declare s adq_solicitudes%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras desvincula órdenes de compra' using errcode = '42501'; end if;
  if s.estado <> 'oc_emitida' then raise exception 'La solicitud ya está cerrada' using errcode = 'P0001'; end if;
  delete from adq_oc where solicitud_id = s.id and docnum = p_docnum;
  if not found then return; end if;
  if not exists (select 1 from adq_oc where solicitud_id = s.id) then
    update adq_solicitudes set estado = 'aprobada' where id = s.id;
  end if;
  insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'OC SAP N° ' || p_docnum || ' desvinculada');
end $$;

-- Cierre manual (servicios sin recepcion en SAP, o recepcion fuera de SAP)
create or replace function public.adq_marcar_recibida(p_solicitud_id uuid, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s adq_solicitudes%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras cierra la solicitud' using errcode = '42501'; end if;
  if s.estado <> 'oc_emitida' then raise exception 'Primero vincula la OC de SAP' using errcode = 'P0001'; end if;
  update adq_solicitudes set estado = 'recibida', cerrado_por = auth.uid(), fecha_cierre = now() where id = s.id;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (s.id, auth.uid(), 'Marcada como recibida' || coalesce(' · ' || nullif(btrim(coalesce(p_comentario, '')), ''), ''));
  perform adq_avisar(array[s.creado_por], s.id, 'Recibida: SC-' || s.numero || ' · ' || s.titulo,
    'Tu solicitud de compra SC-' || s.numero || ' fue recibida');
end $$;

create or replace function public.adq_anular(p_solicitud_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s adq_solicitudes%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Indica el motivo de la anulación' using errcode = 'P0001'; end if;
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if s.estado in ('recibida', 'rechazada', 'anulada') then raise exception 'La solicitud ya está cerrada' using errcode = 'P0001'; end if;
  if not (adq_compras_de(s.sucursal) or (s.creado_por = auth.uid() and s.estado in ('cotizando', 'en_aprobacion'))) then
    raise exception 'No puedes anular esta solicitud' using errcode = '42501';
  end if;
  update adq_solicitudes set estado = 'anulada', motivo_cierre = v_motivo, cerrado_por = auth.uid(), fecha_cierre = now()
  where id = s.id;
  insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'Anulada · ' || v_motivo);
  perform adq_avisar(adq_compras_ids(s.sucursal) || s.creado_por, s.id,
    'Anulada: SC-' || s.numero || ' · ' || s.titulo, 'Solicitud de compra SC-' || s.numero || ' anulada',
    '<p style="margin:0 0 12px">Motivo: ' || adq_html(v_motivo) || '</p>');
end $$;

-- p = [{nivel, nombre, monto_desde, activo}, ...]: guarda todos juntos y valida al final
drop function if exists public.adq_guardar_nivel(int, text, numeric, boolean);
create or replace function public.adq_guardar_niveles(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not adq_tiene('jefe_compras') then raise exception 'Solo el jefe de compras configura los niveles' using errcode = '42501'; end if;
  update adq_niveles n
  set nombre = btrim(f ->> 'nombre'),
      monto_desde = case when n.nivel = 1 then 0 else (f ->> 'monto_desde')::numeric end,
      activo = n.nivel = 1 or coalesce((f ->> 'activo')::boolean, true)
  from jsonb_array_elements(p) f
  where n.nivel = (f ->> 'nivel')::int;
  if exists (select 1 from adq_niveles where btrim(nombre) = '') then
    raise exception 'Cada nivel necesita un nombre' using errcode = 'P0001';
  end if;
  if exists (select 1 from adq_niveles a join adq_niveles b on b.nivel > a.nivel
             where a.activo and b.activo and b.monto_desde <= a.monto_desde) then
    raise exception 'Cada nivel tiene que partir en un monto mayor que el anterior' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------- despues de cada sincronizacion con SAP

-- 1) vincula sola la OC cuyo comentario o referencia dice "SC-<numero>" (o "SC <numero>", "SC N° <numero>")
-- 2) cierra como recibida la solicitud cuyas OC vinculadas ya no tienen nada pendiente en SAP
create or replace function public.adq_sap_actualizar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_vinculadas int := 0;
  v_recibidas int := 0;
begin
  for r in
    select distinct s.id, s.numero, s.estado, s.creado_por, o.docnum
    from adq_solicitudes s
    join sap_oc o on not o.cancelada
     and (coalesce(o.comentarios, '') || ' ' || coalesce(o.referencia, ''))
         ~* ('(^|[^0-9a-z])sc[ -]*(n[°º.]?[ ]*)?0*' || s.numero || '([^0-9]|$)')
    where s.estado in ('aprobada', 'oc_emitida')
      and not exists (select 1 from adq_oc x where x.solicitud_id = s.id and x.docnum = o.docnum)
  loop
    insert into adq_oc (solicitud_id, docnum, automatica) values (r.id, r.docnum, true) on conflict do nothing;
    update adq_solicitudes set estado = 'oc_emitida' where id = r.id and estado = 'aprobada';
    insert into adq_bitacora (solicitud_id, user_id, texto) values (r.id, null, 'OC SAP N° ' || r.docnum || ' vinculada automáticamente (comentario de la OC)');
    perform adq_avisar(array[r.creado_por], r.id, 'OC emitida: SC-' || r.numero || ' · OC SAP ' || r.docnum,
      'Se emitió la OC N° ' || r.docnum || ' para tu solicitud SC-' || r.numero);
    v_vinculadas := v_vinculadas + 1;
  end loop;

  for r in
    select s.id, s.numero, s.titulo, s.creado_por
    from adq_solicitudes s
    where s.estado = 'oc_emitida'
      and not exists (                         -- toda OC vinculada esta en SAP, sin pendiente
        select 1 from adq_oc x
        where x.solicitud_id = s.id
          and not exists (select 1 from sap_oc o where o.docnum = x.docnum and not o.cancelada
                          and o.cantidad_total > 0 and o.cantidad_pendiente = 0))
  loop
    update adq_solicitudes set estado = 'recibida', fecha_cierre = now() where id = r.id;
    insert into adq_bitacora (solicitud_id, user_id, texto) values (r.id, null, 'Recibida completa según SAP');
    perform adq_avisar(array[r.creado_por], r.id, 'Recibida: SC-' || r.numero || ' · ' || r.titulo,
      'Tu solicitud de compra SC-' || r.numero || ' fue recibida');
    v_recibidas := v_recibidas + 1;
  end loop;
  return jsonb_build_object('vinculadas', v_vinculadas, 'recibidas', v_recibidas);
end $$;

-- p = { proveedores: [{codigo,nombre,rut,telefono,email,activo}], articulos: [{codigo,nombre,unidad,grupo,
--       ultimo_precio,ultima_compra}], oc: [{doc_entry,docnum,proveedor_codigo,proveedor_nombre,fecha,
--       fecha_entrega,abierta,cancelada,total,iva,moneda,referencia,comentarios}],
--       lineas: [{doc_entry,linea,articulo_codigo,descripcion,cantidad,pendiente,precio,total,unidad,bodega,abierta}] }
create or replace function public.sap_compras_sincronizar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prov int; v_art int; v_oc int;
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

  delete from sap_oc where true;   -- en cascada, sap_oc_lineas
  insert into sap_oc (doc_entry, docnum, proveedor_codigo, proveedor_nombre, fecha, fecha_entrega, abierta, cancelada,
                      total, iva, moneda, referencia, comentarios)
  select (f ->> 'doc_entry')::int, (f ->> 'docnum')::int, nullif(f ->> 'proveedor_codigo', ''), nullif(f ->> 'proveedor_nombre', ''),
         (f ->> 'fecha')::date, (f ->> 'fecha_entrega')::date, coalesce((f ->> 'abierta')::boolean, false),
         coalesce((f ->> 'cancelada')::boolean, false), coalesce((f ->> 'total')::numeric, 0), coalesce((f ->> 'iva')::numeric, 0),
         nullif(f ->> 'moneda', ''), nullif(f ->> 'referencia', ''), nullif(f ->> 'comentarios', '')
  from jsonb_array_elements(p -> 'oc') f;

  insert into sap_oc_lineas (doc_entry, linea, articulo_codigo, descripcion, cantidad, pendiente, precio, total, unidad, bodega, abierta)
  select (f ->> 'doc_entry')::int, (f ->> 'linea')::int, nullif(f ->> 'articulo_codigo', ''), nullif(f ->> 'descripcion', ''),
         coalesce((f ->> 'cantidad')::numeric, 0), coalesce((f ->> 'pendiente')::numeric, 0), coalesce((f ->> 'precio')::numeric, 0),
         coalesce((f ->> 'total')::numeric, 0), nullif(f ->> 'unidad', ''), nullif(f ->> 'bodega', ''),
         coalesce((f ->> 'abierta')::boolean, true)
  from jsonb_array_elements(coalesce(p -> 'lineas', '[]')) f
  where exists (select 1 from sap_oc o where o.doc_entry = (f ->> 'doc_entry')::int);

  update sap_oc o set cantidad_total = l.total, cantidad_pendiente = l.pendiente
  from (select doc_entry, sum(cantidad) as total, sum(pendiente) as pendiente from sap_oc_lineas group by doc_entry) l
  where l.doc_entry = o.doc_entry;

  select count(*) into v_prov from sap_proveedores;
  select count(*) into v_art from sap_articulos;
  select count(*) into v_oc from sap_oc;
  insert into sap_compras_estado (id, sincronizado_en, proveedores, articulos, oc)
  values (true, now(), v_prov, v_art, v_oc)
  on conflict (id) do update set sincronizado_en = excluded.sincronizado_en, proveedores = excluded.proveedores,
                                 articulos = excluded.articulos, oc = excluded.oc;
  v_adq := adq_sap_actualizar();
  return jsonb_build_object('proveedores', v_prov, 'articulos', v_art, 'oc', v_oc) || v_adq;
end $$;

-- ---------------------------------------------------------------- vistas
-- Sin security_invoker a proposito: cuentan cosas y leen sap_oc, que quien solicita no lee directo.
-- El filtro de filas lo hace adq_ve().

drop view if exists public.adq_solicitudes_v;
create view public.adq_solicitudes_v as
select s.*,
  adq_nombre(s.creado_por) as creado_por_nombre,
  adq_nombre(s.cerrado_por) as cerrado_por_nombre,
  p.nombre as proyecto_nombre,
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
  oc.recepcion_pct
from adq_solicitudes s
left join proyectos p on p.id = s.proyecto_id
left join adq_cotizaciones e on e.id = s.cotizacion_id
left join lateral (
  select count(*) as n, sum(x.cantidad * x.precio_estimado) as estimado from adq_items x where x.solicitud_id = s.id
) i on true
left join lateral (select count(*) as n from adq_cotizaciones x where x.solicitud_id = s.id) c on true
left join lateral (
  select string_agg(x.docnum::text, ', ' order by x.docnum) as docnums,
         case when sum(o.cantidad_total) > 0
              then round(100 * (sum(o.cantidad_total) - sum(o.cantidad_pendiente)) / sum(o.cantidad_total)) end::int as recepcion_pct
  from adq_oc x left join sap_oc o on o.docnum = x.docnum and not o.cancelada
  where x.solicitud_id = s.id
) oc on true
where adq_ve_fila(s.creado_por, s.sucursal);

drop view if exists public.adq_oc_v;
create view public.adq_oc_v as
select x.solicitud_id, x.docnum, x.automatica, x.created_at, adq_nombre(x.vinculado_por) as vinculado_por_nombre,
  o.doc_entry, o.proveedor_nombre, o.fecha, o.fecha_entrega, o.abierta, o.cancelada, o.total, o.iva, o.moneda,
  o.cantidad_total, o.cantidad_pendiente,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  (o.doc_entry is not null) as en_sap
from adq_oc x left join sap_oc o on o.docnum = x.docnum
where adq_ve(x.solicitud_id);

drop view if exists public.adq_aprobaciones_v;
create view public.adq_aprobaciones_v as
select a.*, adq_nombre(a.user_id) as usuario_nombre, n.nombre as nivel_nombre
from adq_aprobaciones a left join adq_niveles n on n.nivel = a.nivel
where adq_ve(a.solicitud_id);

drop view if exists public.adq_bitacora_v;
create view public.adq_bitacora_v as
select b.*, adq_nombre(b.user_id) as usuario_nombre
from adq_bitacora b
where adq_ve(b.solicitud_id);

-- OC de SAP con la SC vinculada, para la pantalla de Compras
drop view if exists public.adq_sap_oc_v;
create view public.adq_sap_oc_v as
select o.*,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc o
where adq_es_compras();

-- ---------------------------------------------------------------- RLS

alter table public.adq_niveles      enable row level security;
alter table public.adq_solicitudes  enable row level security;
alter table public.adq_items        enable row level security;
alter table public.adq_cotizaciones enable row level security;
alter table public.adq_aprobaciones enable row level security;
alter table public.adq_oc           enable row level security;
alter table public.adq_archivos     enable row level security;
alter table public.adq_bitacora     enable row level security;
alter table public.adq_correos      enable row level security;
alter table public.sap_proveedores  enable row level security;
alter table public.sap_articulos    enable row level security;
alter table public.sap_oc           enable row level security;
alter table public.sap_oc_lineas    enable row level security;
alter table public.sap_compras_estado enable row level security;

drop policy if exists adq_niveles_select on public.adq_niveles;
create policy adq_niveles_select on public.adq_niveles for select to authenticated using (adq_tiene_acceso());

-- adq_solicitudes. El SELECT usa las columnas de la fila (el INSERT ... RETURNING revisa esta
-- politica sobre la fila nueva, que una consulta dentro de adq_ve() todavia no ve).
drop policy if exists adq_solicitudes_select on public.adq_solicitudes;
create policy adq_solicitudes_select on public.adq_solicitudes for select to authenticated
  using (adq_ve_fila(creado_por, sucursal));
drop policy if exists adq_solicitudes_insert on public.adq_solicitudes;
create policy adq_solicitudes_insert on public.adq_solicitudes for insert to authenticated
  with check (adq_tiene('solicitante') or adq_es_compras());
drop policy if exists adq_solicitudes_update on public.adq_solicitudes;
create policy adq_solicitudes_update on public.adq_solicitudes for update to authenticated
  using (estado = 'cotizando' and (creado_por = (select auth.uid()) or adq_compras_de(sucursal)))
  with check (creado_por = (select auth.uid()) or adq_compras_de(sucursal));

drop policy if exists adq_items_select on public.adq_items;
create policy adq_items_select on public.adq_items for select to authenticated using (adq_ve(solicitud_id));
drop policy if exists adq_items_insert on public.adq_items;
create policy adq_items_insert on public.adq_items for insert to authenticated with check (adq_puede_editar(solicitud_id));
drop policy if exists adq_items_update on public.adq_items;
create policy adq_items_update on public.adq_items for update to authenticated
  using (adq_puede_editar(solicitud_id)) with check (adq_puede_editar(solicitud_id));
drop policy if exists adq_items_delete on public.adq_items;
create policy adq_items_delete on public.adq_items for delete to authenticated using (adq_puede_editar(solicitud_id));

drop policy if exists adq_cotizaciones_select on public.adq_cotizaciones;
create policy adq_cotizaciones_select on public.adq_cotizaciones for select to authenticated using (adq_ve(solicitud_id));
drop policy if exists adq_cotizaciones_insert on public.adq_cotizaciones;
create policy adq_cotizaciones_insert on public.adq_cotizaciones for insert to authenticated
  with check (adq_puede_cotizar(solicitud_id) and creado_por = (select auth.uid()));
drop policy if exists adq_cotizaciones_update on public.adq_cotizaciones;
create policy adq_cotizaciones_update on public.adq_cotizaciones for update to authenticated
  using (adq_puede_cotizar(solicitud_id)) with check (adq_puede_cotizar(solicitud_id));
drop policy if exists adq_cotizaciones_delete on public.adq_cotizaciones;
create policy adq_cotizaciones_delete on public.adq_cotizaciones for delete to authenticated using (adq_puede_cotizar(solicitud_id));

drop policy if exists adq_aprobaciones_select on public.adq_aprobaciones;
create policy adq_aprobaciones_select on public.adq_aprobaciones for select to authenticated using (adq_ve(solicitud_id));
drop policy if exists adq_oc_select on public.adq_oc;
create policy adq_oc_select on public.adq_oc for select to authenticated using (adq_ve(solicitud_id));

drop policy if exists adq_archivos_select on public.adq_archivos;
create policy adq_archivos_select on public.adq_archivos for select to authenticated using (adq_ve(solicitud_id));
drop policy if exists adq_archivos_insert on public.adq_archivos;
create policy adq_archivos_insert on public.adq_archivos for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and case
      when cotizacion_id is null then path like solicitud_id::text || '/docs/%'
      else path like solicitud_id::text || '/cot/' || cotizacion_id::text || '/%'
    end
    and adq_puede_adjuntar(solicitud_id, cotizacion_id));
drop policy if exists adq_archivos_delete on public.adq_archivos;
create policy adq_archivos_delete on public.adq_archivos for delete to authenticated
  using (adq_puede_borrar_archivo(solicitud_id, subido_por));

drop policy if exists adq_bitacora_select on public.adq_bitacora;
create policy adq_bitacora_select on public.adq_bitacora for select to authenticated using (adq_ve(solicitud_id));
drop policy if exists adq_bitacora_insert on public.adq_bitacora;
create policy adq_bitacora_insert on public.adq_bitacora for insert to authenticated
  with check (tipo = 'comentario' and user_id = (select auth.uid()) and adq_ve(solicitud_id));

-- Maestros de SAP: para buscar proveedor y articulo, cualquiera con acceso al portal. Las OC, Compras.
drop policy if exists sap_proveedores_select on public.sap_proveedores;
create policy sap_proveedores_select on public.sap_proveedores for select to authenticated using (adq_tiene_acceso());
drop policy if exists sap_articulos_select on public.sap_articulos;
create policy sap_articulos_select on public.sap_articulos for select to authenticated using (adq_tiene_acceso());
drop policy if exists sap_oc_select on public.sap_oc;
create policy sap_oc_select on public.sap_oc for select to authenticated using (adq_es_compras());
drop policy if exists sap_oc_lineas_select on public.sap_oc_lineas;
create policy sap_oc_lineas_select on public.sap_oc_lineas for select to authenticated
  using (adq_es_compras() or adq_ve_oc_sap(doc_entry));
drop policy if exists sap_compras_estado_select on public.sap_compras_estado;
create policy sap_compras_estado_select on public.sap_compras_estado for select to authenticated using (adq_tiene_acceso());

-- adq_correos: sin politicas, nadie la lee desde la web

-- ---------------------------------------------------------------- privilegios

revoke all on public.adq_niveles, public.adq_solicitudes, public.adq_items, public.adq_cotizaciones,
              public.adq_aprobaciones, public.adq_oc, public.adq_archivos, public.adq_bitacora, public.adq_correos,
              public.sap_proveedores, public.sap_articulos, public.sap_oc, public.sap_oc_lineas, public.sap_compras_estado,
              public.adq_solicitudes_v, public.adq_oc_v, public.adq_aprobaciones_v, public.adq_bitacora_v, public.adq_sap_oc_v
  from anon, authenticated;
grant select on public.adq_niveles, public.adq_aprobaciones, public.adq_oc,
                public.sap_proveedores, public.sap_articulos, public.sap_oc, public.sap_oc_lineas, public.sap_compras_estado,
                public.adq_solicitudes_v, public.adq_oc_v, public.adq_aprobaciones_v, public.adq_bitacora_v, public.adq_sap_oc_v
  to authenticated;
grant select, insert, update on public.adq_solicitudes to authenticated;
grant select, insert, update, delete on public.adq_items, public.adq_cotizaciones to authenticated;
grant select, insert, delete on public.adq_archivos to authenticated;
grant select, insert on public.adq_bitacora to authenticated;

-- Todas las funciones: fuera de public y anon. Las que usan la RLS, las vistas y los triggers BEFORE
-- (que corren como el usuario) quedan para authenticated; responden solo por quien llama.
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
  public.adq_ancla_id(), public.adq_es_admin(uuid), public.adq_tiene(text), public.adq_tiene_acceso(uuid), public.adq_mi_nivel(),
  public.adq_es_compras(), public.adq_en_sucursal(text), public.adq_compras_de(text), public.adq_ve_fila(uuid, text),
  public.adq_ve(uuid), public.adq_puede_editar(uuid), public.adq_puede_cotizar(uuid), public.adq_puede_adjuntar(uuid, uuid),
  public.adq_puede_borrar_archivo(uuid, uuid), public.adq_puede_aprobar(uuid), public.adq_ve_oc_sap(int), public.adq_ve_objeto(text),
  public.adq_puede_subir_objeto(text), public.adq_puede_borrar_objeto(text, text), public.adq_nivel_para(numeric),
  public.adq_hoy(), public.adq_uuid(text), public.adq_nombre(uuid), public.adq_clp(numeric), public.adq_html(text),
  public.adq_solicitud_antes(), public.adq_cotizacion_antes(),
  public.adq_enviar_aprobacion(uuid, uuid), public.adq_aprobar(uuid, text), public.adq_rechazar(uuid, text, boolean),
  public.adq_vincular_oc(uuid, int), public.adq_desvincular_oc(uuid, int), public.adq_marcar_recibida(uuid, text),
  public.adq_anular(uuid, text), public.adq_guardar_niveles(jsonb)
  to authenticated;
-- internas: avisar a cualquiera, preguntar por otros usuarios, escribir desde SAP
revoke execute on function
  public.adq_usuario_tiene(text, uuid), public.adq_usuario_nivel(uuid), public.adq_usuario_en_sucursal(uuid, text),
  public.adq_usuarios_con(text, text), public.adq_aprobadores(int, text), public.adq_compras_ids(text),
  public.adq_encolar(uuid[], text, text), public.adq_avisar(uuid[], uuid, text, text, text), public.adq_resumen_html(uuid),
  public.adq_correo_html(text, text, uuid), public.adq_solicitud_despues(), public.adq_cotizacion_bitacora(),
  public.adq_archivo_bitacora(), public.adq_sap_actualizar()
  from authenticated;
revoke all on function public.sap_compras_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_compras_sincronizar(jsonb), public.adq_sap_actualizar() to service_role;

-- ---------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adquisiciones', 'adquisiciones', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists adq_objects_select on storage.objects;
create policy adq_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'adquisiciones' and public.adq_ve_objeto(name));
drop policy if exists adq_objects_insert on storage.objects;
create policy adq_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'adquisiciones' and public.adq_puede_subir_objeto(name));
drop policy if exists adq_objects_delete on storage.objects;
create policy adq_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'adquisiciones' and public.adq_puede_borrar_objeto(name, owner_id));

notify pgrst, 'reload schema';

commit;

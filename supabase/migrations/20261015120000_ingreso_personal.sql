-- Portal Ingreso de Personal (/personal): solicitudes de ingreso de nuevo personal.
--
-- Flujo: el area que pide a la persona crea la solicitud (ya viene aprobada) -> el coordinador de
-- la sucursal carga los documentos del trabajador -> cada area completa su tarea (TI, Bodega,
-- Prevencion, RRHH, jefatura) -> RRHH cierra el ingreso con el id de la ficha en BUK.
--
-- Accesos: como SSO, un pseudo-proyecto ancla propio (slug 'ingreso-personal', tipo 'sistema').
-- Un rol por fila de permisos: modulo_key 'ing:<rol>', accion 'ver'. Roles:
--   solicitante  crea solicitudes y ve las suyas
--   coordinador  ve las de su sucursal (profiles.sucursal; sin sucursal, ambas), carga documentos,
--                edita la solicitud y completa cualquier tarea salvo el contrato
--   ti, bodega, prevencion   ven los ingresos con tareas de su area (en su sucursal) y las completan
--   rrhh         ve todo, incluida la renta; contrato, cierre y anulacion
-- Los admin del hub (rol admin, super admin, root) tienen todos los roles.
--
-- Lo que es solo de RRHH vive en tablas o carpetas aparte, no en columnas ocultas por el front:
--   ing_remuneracion        renta ofrecida y pretension de renta (el solicitante la puede escribir
--                           al crear la solicitud, pero no leerla)
--   documentos personales   solo RRHH y el coordinador de la sucursal
--   evidencia del contrato  solo RRHH
--
-- Correos: los triggers dejan los avisos en ing_correos y la tarea TP-Correos-Ingreso
-- (21-ingreso-personal.ps1) los manda cada 5 minutos por el mailer del servidor.
--
-- Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla de accesos

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('5d3f8a2e-7b41-4c69-a0d2-9e6b1f4c8a17', 'Ingreso de Personal (sistema)', 'ingreso-personal', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del portal Ingreso de Personal. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.ing_ancla_id()
returns uuid language sql immutable as $$
  select '5d3f8a2e-7b41-4c69-a0d2-9e6b1f4c8a17'::uuid
$$;

-- Direccion publica del portal, para los enlaces de los correos
create or replace function public.ing_url_base()
returns text language sql immutable as $$
  select 'https://portal.tecnopanel.cl:8080'
$$;

-- ---------------------------------------------------------------- roles

create or replace function public.ing_usuario_tiene(p_rol text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = ing_ancla_id() and pe.modulo_key = 'ing:' || p_rol
  )
$$;

create or replace function public.ing_tiene(p_rol text)
returns boolean language sql stable security definer set search_path = public as $$
  select ing_usuario_tiene(p_rol, auth.uid())
$$;

create or replace function public.ing_tiene_acceso(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe where pe.user_id = p_user_id and pe.proyecto_id = ing_ancla_id() and pe.modulo_key like 'ing:%'
  )
$$;

-- Mismo criterio que has_sucursal(), pero para cualquier usuario (destinatarios de los correos)
create or replace function public.ing_usuario_en_sucursal(p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id
      and (p.sucursal is null or p.sucursal = p_sucursal
           or coalesce(p.is_super_admin, false) or coalesce(p.is_root, false)
           or p.rol in ('admin', 'gerente_general', 'gerente_ventas'))
  )
$$;

create or replace function public.ing_en_sucursal(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select ing_usuario_en_sucursal(auth.uid(), p_sucursal)
$$;

-- Personas con un rol explicito (sin los admin implicitos, para no llenarles el correo).
-- p_sucursal null: todas las sucursales.
create or replace function public.ing_usuarios_con(p_rol text, p_sucursal text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct pe.user_id
  from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
  where pe.proyecto_id = ing_ancla_id() and pe.modulo_key = 'ing:' || p_rol
    and (p_sucursal is null or p.sucursal is null or p.sucursal = p_sucursal)
$$;

-- ---------------------------------------------------------------- utilidades

create or replace function public.ing_hoy()
returns date language sql stable as $$
  select (now() at time zone 'America/Santiago')::date
$$;

-- '12.345.678-k' -> '12345678-K'; null si no tiene forma de RUT
create or replace function public.ing_rut_normalizar(p text)
returns text language sql immutable as $$
  select case when x ~ '^[0-9]{6,8}[0-9K]$' then left(x, -1) || '-' || right(x, 1) end
  from (select upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')) as x) s
$$;

create or replace function public.ing_rut_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  n text := ing_rut_normalizar(p);
  c text;
  s int := 0;
  m int := 2;
  r int;
begin
  if n is null then return false; end if;
  c := split_part(n, '-', 1);
  for i in reverse length(c)..1 loop
    s := s + substr(c, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (s % 11);
  return split_part(n, '-', 2) = case r when 11 then '0' when 10 then 'K' else r::text end;
end $$;

create or replace function public.ing_uuid(p text)
returns uuid language sql immutable as $$
  select case when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

create or replace function public.ing_html(p text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.ing_nombre(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email)
  from profiles p where p.id = p_user_id
$$;

-- Tareas que genera cada requerimiento de la solicitud. El contrato se pide siempre.
create or replace function public.ing_catalogo_tareas()
returns table (tipo text, area text, titulo text, evidencia boolean, orden int)
language sql immutable as $$
  values
    ('contrato',  'rrhh',       'Contrato y anexos firmados',                 true,  1),
    ('ti',        'ti',         'Crear correo y accesos, entregar equipo',    false, 2),
    ('epp',       'bodega',     'Entregar EPP con acta de entrega firmada',   true,  3),
    ('uniforme',  'bodega',     'Entregar uniforme',                          false, 4),
    ('induccion', 'prevencion', 'Inducción de seguridad con registro firmado', true, 5),
    ('vehiculo',  'jefatura',   'Verificar licencia y autorizar conducción',  true,  6)
$$;

create or replace function public.ing_tipos_requeridos(p_ti boolean, p_epp boolean, p_uniforme boolean, p_induccion boolean, p_vehiculo boolean)
returns text[] language sql immutable as $$
  select array['contrato']
    || case when p_ti then array['ti'] else '{}'::text[] end
    || case when p_epp then array['epp'] else '{}'::text[] end
    || case when p_uniforme then array['uniforme'] else '{}'::text[] end
    || case when p_induccion then array['induccion'] else '{}'::text[] end
    || case when p_vehiculo then array['vehiculo'] else '{}'::text[] end
$$;

-- Documentos del trabajador sin los que no se puede cerrar el ingreso
create or replace function public.ing_docs_requeridos(p_vehiculo boolean)
returns text[] language sql immutable as $$
  select array['cedula', 'antecedentes', 'afp', 'salud']
    || case when p_vehiculo then array['licencia'] else '{}'::text[] end
$$;

create or replace function public.ing_doc_label(p_tipo text)
returns text language sql immutable as $$
  select case p_tipo
    when 'cedula' then 'Cédula de identidad'
    when 'antecedentes' then 'Certificado de antecedentes'
    when 'afp' then 'Certificado de afiliación AFP'
    when 'salud' then 'Certificado Fonasa o Isapre'
    when 'estudios' then 'Certificado de estudios o título'
    when 'residencia' then 'Certificado de residencia'
    when 'licencia' then 'Licencia de conducir y hoja de vida del conductor'
    else 'Otro documento' end
$$;

-- ---------------------------------------------------------------- tablas

create table if not exists public.ing_ingresos (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'ingresado', 'anulado')),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  area text not null check (btrim(area) <> ''),            -- area que pide a la persona
  cargo text not null check (btrim(cargo) <> ''),
  fecha_ingreso date not null,
  tipo_contrato text not null check (tipo_contrato in ('plazo_fijo', 'indefinido', 'obra_faena')),
  jornada text not null check (btrim(jornada) <> ''),
  nombre text not null check (btrim(nombre) <> ''),
  rut text not null,                                        -- normalizado: 12345678-5
  telefono text,
  email text,
  tallas text,
  req_ti boolean not null default false,
  req_epp boolean not null default false,
  req_uniforme boolean not null default false,
  req_induccion boolean not null default false,
  req_vehiculo boolean not null default false,
  observacion text,
  buk_id text,                                              -- ficha del trabajador en BUK (al cerrar)
  motivo_anulacion text,
  aviso_listo_at timestamptz,                               -- ya se aviso a RRHH que esta completo
  creado_por uuid not null default auth.uid() references auth.users(id),
  cerrado_por uuid references auth.users(id),
  fecha_cierre timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((estado = 'en_proceso') = (fecha_cierre is null))
);
-- Un RUT no puede tener dos ingresos abiertos a la vez
create unique index if not exists ing_ingresos_rut_abierto on public.ing_ingresos (rut) where estado = 'en_proceso';
create index if not exists ing_ingresos_estado_idx on public.ing_ingresos (estado, sucursal);

-- Solo RRHH la lee. Va aparte para que la RLS la cubra entera (no hay RLS por columna).
create table if not exists public.ing_remuneracion (
  ingreso_id uuid primary key references public.ing_ingresos(id) on delete cascade,
  renta_ofrecida numeric(12, 0) check (renta_ofrecida is null or renta_ofrecida >= 0),     -- bruta mensual
  pretension_renta numeric(12, 0) check (pretension_renta is null or pretension_renta >= 0), -- liquida que pide la persona
  observacion text,
  actualizado_por uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ing_tareas (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references public.ing_ingresos(id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'ti', 'epp', 'uniforme', 'induccion', 'vehiculo')),
  area text not null check (area in ('rrhh', 'ti', 'bodega', 'prevencion', 'jefatura')),
  titulo text not null,
  requiere_evidencia boolean not null default false,
  orden int not null default 0,
  hecha boolean not null default false,
  hecha_por uuid references auth.users(id),
  fecha_hecha timestamptz,
  comentario text,
  created_at timestamptz not null default now(),
  unique (ingreso_id, tipo),
  check (hecha = (fecha_hecha is not null))
);
create index if not exists ing_tareas_ingreso_idx on public.ing_tareas (ingreso_id);

-- Documentos del trabajador (tipo_doc) y evidencias de las tareas (tarea_id), en el bucket
-- 'ingreso-personal': <ingreso_id>/docs/<archivo> y <ingreso_id>/tareas/<tarea_id>/<archivo>
create table if not exists public.ing_archivos (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references public.ing_ingresos(id) on delete cascade,
  tarea_id uuid references public.ing_tareas(id) on delete cascade,
  tipo_doc text check (tipo_doc in ('cedula', 'antecedentes', 'afp', 'salud', 'estudios', 'residencia', 'licencia', 'otro')),
  path text not null unique,
  nombre text not null,
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check ((tarea_id is null) = (tipo_doc is not null))
);
create index if not exists ing_archivos_ingreso_idx on public.ing_archivos (ingreso_id);
create index if not exists ing_archivos_tarea_idx on public.ing_archivos (tarea_id);

create table if not exists public.ing_bitacora (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references public.ing_ingresos(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id),
  tipo text not null default 'evento' check (tipo in ('evento', 'comentario')),
  texto text not null check (btrim(texto) <> ''),
  -- clock_timestamp: varios eventos de una misma transaccion quedan en orden
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists ing_bitacora_ingreso_idx on public.ing_bitacora (ingreso_id, created_at);

-- Cola de correos. Nadie la lee desde la web: la vacia la tarea TP-Correos-Ingreso.
create table if not exists public.ing_correos (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  asunto text not null,
  html text not null,
  intentos int not null default 0,
  error text,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ing_correos_pendientes_idx on public.ing_correos (created_at) where enviado_at is null;

-- ---------------------------------------------------------------- quien ve y hace que

-- Area con tareas en el ingreso (TI, Bodega, Prevencion), en su sucursal
create or replace function public.ing_area_ve(p_ingreso_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select ing_en_sucursal(p_sucursal) and exists (
    select 1 from ing_tareas t
    where t.ingreso_id = p_ingreso_id and t.area in ('ti', 'bodega', 'prevencion') and ing_tiene(t.area))
$$;

create or replace function public.ing_ve(p_ingreso_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_ingresos i
    where i.id = p_ingreso_id
      and (ing_tiene('rrhh')
           or i.creado_por = auth.uid()
           or (ing_tiene('coordinador') and ing_en_sucursal(i.sucursal))
           or ing_area_ve(i.id, i.sucursal)))
$$;

-- RRHH, o el coordinador de la sucursal mientras el ingreso esta abierto
create or replace function public.ing_gestiona_docs(p_ingreso_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_ingresos i
    where i.id = p_ingreso_id and i.estado = 'en_proceso'
      and (ing_tiene('rrhh') or (ing_tiene('coordinador') and ing_en_sucursal(i.sucursal))))
$$;

create or replace function public.ing_puede_tarea(p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_tareas t join ing_ingresos i on i.id = t.ingreso_id
    where t.id = p_tarea_id and i.estado = 'en_proceso'
      and (ing_tiene('rrhh')
           or (t.area <> 'rrhh' and ing_tiene('coordinador') and ing_en_sucursal(i.sucursal))
           or (t.area in ('ti', 'bodega', 'prevencion') and ing_tiene(t.area) and ing_en_sucursal(i.sucursal))
           or (t.area = 'jefatura' and i.creado_por = auth.uid())))
$$;

-- Documentos: RRHH y coordinador de la sucursal. Evidencias: quien ve el ingreso, salvo la del
-- contrato (trae la renta), que es solo de RRHH.
create or replace function public.ing_ve_archivo(p_ingreso_id uuid, p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_ingreso_id is null then false
    when p_tarea_id is null then exists (
      select 1 from ing_ingresos i
      where i.id = p_ingreso_id and (ing_tiene('rrhh') or (ing_tiene('coordinador') and ing_en_sucursal(i.sucursal))))
    else exists (
      select 1 from ing_tareas t
      where t.id = p_tarea_id and t.ingreso_id = p_ingreso_id
        and case when t.area = 'rrhh' then ing_tiene('rrhh') else ing_ve(p_ingreso_id) end)
  end
$$;

create or replace function public.ing_puede_subir_evidencia(p_ingreso_id uuid, p_tarea_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_tareas t
    where t.id = p_tarea_id and t.ingreso_id = p_ingreso_id and not t.hecha and ing_puede_tarea(t.id))
$$;

create or replace function public.ing_puede_borrar_archivo(p_ingreso_id uuid, p_tarea_id uuid, p_subido_por uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_ingresos i
    where i.id = p_ingreso_id and i.estado = 'en_proceso'
      and (ing_tiene('rrhh') or p_subido_por = auth.uid())
      and (p_tarea_id is null or exists (select 1 from ing_tareas t where t.id = p_tarea_id and not t.hecha)))
$$;

-- Storage: la ruta dice de que ingreso y tarea es el objeto
create or replace function public.ing_ve_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_name, '/', 2)
    when 'docs' then ing_ve_archivo(ing_uuid(split_part(p_name, '/', 1)), null)
    when 'tareas' then coalesce(ing_uuid(split_part(p_name, '/', 3)) is not null
                                and ing_ve_archivo(ing_uuid(split_part(p_name, '/', 1)), ing_uuid(split_part(p_name, '/', 3))), false)
    else false end
$$;

create or replace function public.ing_puede_subir_objeto(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case split_part(p_name, '/', 2)
    when 'docs' then coalesce(ing_gestiona_docs(ing_uuid(split_part(p_name, '/', 1))), false)
    when 'tareas' then coalesce(ing_puede_subir_evidencia(ing_uuid(split_part(p_name, '/', 1)), ing_uuid(split_part(p_name, '/', 3))), false)
    else false end
$$;

create or replace function public.ing_puede_borrar_objeto(p_name text, p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ing_ingresos i
    where i.id = ing_uuid(split_part(p_name, '/', 1)) and i.estado = 'en_proceso'
      and (ing_tiene('rrhh') or p_owner = auth.uid()::text))
$$;

-- Documentos requeridos cargados y todas las tareas hechas
create or replace function public.ing_completo(p_ingreso_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from ing_tareas t where t.ingreso_id = i.id and not t.hecha)
     and not exists (
       select 1 from unnest(ing_docs_requeridos(i.req_vehiculo)) d(tipo)
       where not exists (select 1 from ing_archivos a where a.ingreso_id = i.id and a.tipo_doc = d.tipo))
  from ing_ingresos i where i.id = p_ingreso_id
$$;

-- ---------------------------------------------------------------- correos

create or replace function public.ing_encolar(p_destinatarios uuid[], p_asunto text, p_html text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into ing_correos (para, asunto, html)
  select distinct lower(btrim(p.email)), p_asunto, p_html
  from profiles p
  where p.id = any (p_destinatarios)
    and p.id is distinct from auth.uid()          -- no se avisa a quien hizo la accion
    and coalesce(p.activo, true)
    and coalesce(btrim(p.email), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.ing_correo_html(p_titulo text, p_cuerpo text, p_ingreso_id uuid)
returns text language sql immutable as $$
  select '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">'
    || '<h2 style="margin:0 0 16px;font-size:19px">' || ing_html(p_titulo) || '</h2>'
    || '<div style="margin:0 0 20px;line-height:1.55">' || p_cuerpo || '</div>'
    || '<p style="margin:0 0 20px"><a href="' || ing_url_base() || '/personal/' || p_ingreso_id
    || '" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Abrir el ingreso</a></p>'
    || '<p style="margin:0;font-size:12px;color:#6b7280">Aviso automático del portal Ingreso de Personal · Tecnopanel</p>'
    || '</div></body></html>'
$$;

-- Bloque con los datos del ingreso para el cuerpo de los correos (sin renta)
create or replace function public.ing_resumen_html(p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select '<b>' || ing_html(i.nombre) || '</b> · ' || ing_html(i.cargo) || '<br>'
    || 'Sucursal ' || ing_html(i.sucursal) || ' · ingresa el ' || to_char(i.fecha_ingreso, 'DD-MM-YYYY') || '<br>'
    || 'Pedido por ' || ing_html(coalesce(ing_nombre(i.creado_por), '')) || ' (' || ing_html(i.area) || ')'
  from ing_ingresos i where i.id = p_ingreso_id
$$;

-- ---------------------------------------------------------------- tareas segun la solicitud

-- Crea las tareas que pide la solicitud y avisa a cada area; quita las que ya no se piden si no
-- tienen avance (ni hechas ni con evidencia).
create or replace function public.ing_sincronizar_tareas(p_ingreso_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i ing_ingresos%rowtype;
  t record;
  v_tipos text[];
begin
  select * into i from ing_ingresos where id = p_ingreso_id;
  if not found then return; end if;
  v_tipos := ing_tipos_requeridos(i.req_ti, i.req_epp, i.req_uniforme, i.req_induccion, i.req_vehiculo);

  delete from ing_tareas x
  where x.ingreso_id = i.id and not x.hecha and x.tipo <> all (v_tipos)
    and not exists (select 1 from ing_archivos a where a.tarea_id = x.id);

  for t in
    insert into ing_tareas (ingreso_id, tipo, area, titulo, requiere_evidencia, orden)
    select i.id, c.tipo, c.area, c.titulo, c.evidencia, c.orden
    from ing_catalogo_tareas() c
    where c.tipo = any (v_tipos)
    on conflict (ingreso_id, tipo) do nothing
    returning area, titulo
  loop
    if t.area in ('ti', 'bodega', 'prevencion') then
      perform ing_encolar(
        array(select ing_usuarios_con(t.area, i.sucursal)),
        'Tarea de ingreso N° ' || i.numero || ': ' || t.titulo,
        ing_correo_html('Tienes una tarea para el ingreso N° ' || i.numero,
          '<p style="margin:0 0 12px">' || ing_html(t.titulo) || '</p>' || ing_resumen_html(i.id), i.id));
    end if;
  end loop;
end $$;

-- Avisa a RRHH una vez cuando el ingreso queda completo; si deja de estarlo, vuelve a avisar
-- la proxima vez que se complete.
create or replace function public.ing_revisar_listo(p_ingreso_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i ing_ingresos%rowtype;
  v_completo boolean;
begin
  select * into i from ing_ingresos where id = p_ingreso_id;
  if not found or i.estado <> 'en_proceso' then return; end if;
  v_completo := ing_completo(i.id);
  if v_completo and i.aviso_listo_at is null then
    update ing_ingresos set aviso_listo_at = now() where id = i.id;
    perform ing_encolar(
      array(select ing_usuarios_con('rrhh', null)),
      'Ingreso N° ' || i.numero || ' listo para cerrar: ' || i.nombre,
      ing_correo_html('Ingreso N° ' || i.numero || ' listo para cerrar',
        '<p style="margin:0 0 12px">Están todos los documentos y tareas. Falta crear la ficha en BUK y cerrar el ingreso.</p>'
        || ing_resumen_html(i.id), i.id));
  elsif not v_completo and i.aviso_listo_at is not null then
    update ing_ingresos set aviso_listo_at = null where id = i.id;
  end if;
end $$;

-- ---------------------------------------------------------------- triggers

-- BEFORE: SECURITY INVOKER a proposito, para que current_user sea 'authenticated' cuando viene de
-- la web y el dueno cuando viene de las funciones de cierre/anulacion (igual que en SSO).
create or replace function public.ing_ingreso_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.rut := coalesce(ing_rut_normalizar(new.rut), new.rut);
  if not ing_rut_valido(new.rut) then
    raise exception 'El RUT % no es válido', new.rut using errcode = '22023';
  end if;
  new.nombre := btrim(new.nombre);
  new.cargo := btrim(new.cargo);
  new.area := btrim(new.area);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.estado := 'en_proceso';
      new.creado_por := auth.uid();
      new.buk_id := null;
      new.motivo_anulacion := null;
      new.aviso_listo_at := null;
      new.cerrado_por := null;
      new.fecha_cierre := null;
      if new.fecha_ingreso < ing_hoy() then
        raise exception 'La fecha de ingreso no puede ser anterior a hoy' using errcode = '22023';
      end if;
    else
      if old.estado <> 'en_proceso' then
        raise exception 'El ingreso ya está cerrado o anulado' using errcode = '42501';
      end if;
      if new.estado is distinct from old.estado
         or new.buk_id is distinct from old.buk_id
         or new.motivo_anulacion is distinct from old.motivo_anulacion
         or new.aviso_listo_at is distinct from old.aviso_listo_at
         or new.cerrado_por is distinct from old.cerrado_por
         or new.fecha_cierre is distinct from old.fecha_cierre
         or new.creado_por is distinct from old.creado_por
         or new.created_at is distinct from old.created_at then
        raise exception 'El estado se cambia con Cerrar ingreso o Anular' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ing_ingreso_antes on public.ing_ingresos;
create trigger ing_ingreso_antes before insert or update on public.ing_ingresos
  for each row execute function public.ing_ingreso_antes();

create or replace function public.ing_ingreso_despues()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ing_bitacora (ingreso_id, user_id, texto) values (new.id, auth.uid(), 'Solicitud creada');
    perform ing_encolar(
      array(select ing_usuarios_con('coordinador', new.sucursal)) || array(select ing_usuarios_con('rrhh', null)),
      'Nueva solicitud de ingreso N° ' || new.numero || ': ' || new.nombre || ' · ' || new.sucursal,
      ing_correo_html('Nueva solicitud de ingreso N° ' || new.numero, ing_resumen_html(new.id), new.id));
    perform ing_sincronizar_tareas(new.id);
    return new;
  end if;

  if (new.req_ti, new.req_epp, new.req_uniforme, new.req_induccion, new.req_vehiculo)
     is distinct from (old.req_ti, old.req_epp, old.req_uniforme, old.req_induccion, old.req_vehiculo) then
    perform ing_sincronizar_tareas(new.id);
  end if;
  if (new.sucursal, new.area, new.cargo, new.fecha_ingreso, new.tipo_contrato, new.jornada, new.nombre, new.rut,
      new.telefono, new.email, new.tallas, new.observacion,
      new.req_ti, new.req_epp, new.req_uniforme, new.req_induccion, new.req_vehiculo)
     is distinct from
     (old.sucursal, old.area, old.cargo, old.fecha_ingreso, old.tipo_contrato, old.jornada, old.nombre, old.rut,
      old.telefono, old.email, old.tallas, old.observacion,
      old.req_ti, old.req_epp, old.req_uniforme, old.req_induccion, old.req_vehiculo) then
    insert into ing_bitacora (ingreso_id, user_id, texto) values (new.id, auth.uid(), 'Datos de la solicitud actualizados');
    perform ing_revisar_listo(new.id);
  end if;
  return new;
end $$;
drop trigger if exists ing_ingreso_despues on public.ing_ingresos;
create trigger ing_ingreso_despues after insert or update on public.ing_ingresos
  for each row execute function public.ing_ingreso_despues();

create or replace function public.ing_remuneracion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.actualizado_por := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ing_remuneracion_antes on public.ing_remuneracion;
create trigger ing_remuneracion_antes before insert or update on public.ing_remuneracion
  for each row execute function public.ing_remuneracion_antes();

create or replace function public.ing_archivo_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a ing_archivos%rowtype;
  v_que text;
begin
  if tg_op = 'DELETE' then a := old; else a := new; end if;
  -- al anular o borrar en cascada no hay nada que registrar
  if not exists (select 1 from ing_ingresos where id = a.ingreso_id) then return a; end if;
  if a.tarea_id is null then
    v_que := ing_doc_label(a.tipo_doc);
  else
    select 'evidencia de «' || t.titulo || '»' into v_que from ing_tareas t where t.id = a.tarea_id;
  end if;
  insert into ing_bitacora (ingreso_id, user_id, texto)
  values (a.ingreso_id, auth.uid(), case when tg_op = 'DELETE' then 'Eliminado: ' else 'Cargado: ' end || coalesce(v_que, 'archivo'));
  perform ing_revisar_listo(a.ingreso_id);
  return a;
end $$;
drop trigger if exists ing_archivo_bitacora on public.ing_archivos;
create trigger ing_archivo_bitacora after insert or delete on public.ing_archivos
  for each row execute function public.ing_archivo_bitacora();

-- ---------------------------------------------------------------- acciones (RPC)

create or replace function public.ing_completar_tarea(p_tarea_id uuid, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t ing_tareas%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into t from ing_tareas where id = p_tarea_id for update;
  if not found or not ing_puede_tarea(p_tarea_id) then
    raise exception 'No puedes completar esta tarea' using errcode = '42501';
  end if;
  if t.hecha then raise exception 'La tarea ya está hecha' using errcode = 'P0001'; end if;
  if t.requiere_evidencia and not exists (select 1 from ing_archivos a where a.tarea_id = t.id) then
    raise exception 'Adjunta la evidencia firmada antes de marcarla como hecha' using errcode = 'P0001';
  end if;
  update ing_tareas set hecha = true, hecha_por = auth.uid(), fecha_hecha = now(),
    comentario = nullif(btrim(coalesce(p_comentario, '')), '')
  where id = t.id;
  insert into ing_bitacora (ingreso_id, user_id, texto)
  values (t.ingreso_id, auth.uid(), 'Tarea hecha: ' || t.titulo || coalesce(' · ' || nullif(btrim(coalesce(p_comentario, '')), ''), ''));
  perform ing_revisar_listo(t.ingreso_id);
end $$;

create or replace function public.ing_reabrir_tarea(p_tarea_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t ing_tareas%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select * into t from ing_tareas where id = p_tarea_id for update;
  if not found or not ing_puede_tarea(p_tarea_id) then
    raise exception 'No puedes reabrir esta tarea' using errcode = '42501';
  end if;
  if not t.hecha then return; end if;
  update ing_tareas set hecha = false, hecha_por = null, fecha_hecha = null, comentario = null where id = t.id;
  insert into ing_bitacora (ingreso_id, user_id, texto) values (t.ingreso_id, auth.uid(), 'Tarea reabierta: ' || t.titulo);
  perform ing_revisar_listo(t.ingreso_id);
end $$;

create or replace function public.ing_cerrar(p_ingreso_id uuid, p_buk_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i ing_ingresos%rowtype;
  v_buk text := nullif(btrim(coalesce(p_buk_id, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not ing_tiene('rrhh') then raise exception 'Solo RRHH puede cerrar el ingreso' using errcode = '42501'; end if;
  select * into i from ing_ingresos where id = p_ingreso_id for update;
  if not found then raise exception 'Ingreso no encontrado' using errcode = 'P0002'; end if;
  if i.estado <> 'en_proceso' then raise exception 'El ingreso ya está cerrado o anulado' using errcode = 'P0001'; end if;
  if not ing_completo(i.id) then
    raise exception 'Faltan documentos o tareas por completar' using errcode = 'P0001';
  end if;
  update ing_ingresos set estado = 'ingresado', buk_id = v_buk, cerrado_por = auth.uid(), fecha_cierre = now()
  where id = i.id;
  insert into ing_bitacora (ingreso_id, user_id, texto)
  values (i.id, auth.uid(), 'Ingreso cerrado' || coalesce(' · ficha BUK ' || v_buk, ''));
  perform ing_encolar(
    array[i.creado_por] || array(select ing_usuarios_con('coordinador', i.sucursal)),
    'Ingreso N° ' || i.numero || ' cerrado: ' || i.nombre,
    ing_correo_html('Ingreso N° ' || i.numero || ' cerrado',
      '<p style="margin:0 0 12px">RRHH cerró el ingreso. La ficha del trabajador queda en BUK.</p>' || ing_resumen_html(i.id), i.id));
end $$;

create or replace function public.ing_anular(p_ingreso_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare i ing_ingresos%rowtype;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación' using errcode = 'P0001'; end if;
  select * into i from ing_ingresos where id = p_ingreso_id for update;
  if not found then raise exception 'Ingreso no encontrado' using errcode = 'P0002'; end if;
  if not (ing_tiene('rrhh') or (ing_tiene('coordinador') and ing_en_sucursal(i.sucursal)) or i.creado_por = auth.uid()) then
    raise exception 'No puedes anular este ingreso' using errcode = '42501';
  end if;
  if i.estado <> 'en_proceso' then raise exception 'El ingreso ya está cerrado o anulado' using errcode = 'P0001'; end if;
  update ing_ingresos set estado = 'anulado', motivo_anulacion = btrim(p_motivo), cerrado_por = auth.uid(), fecha_cierre = now()
  where id = i.id;
  insert into ing_bitacora (ingreso_id, user_id, texto) values (i.id, auth.uid(), 'Ingreso anulado · ' || btrim(p_motivo));
  perform ing_encolar(
    array[i.creado_por] || array(select ing_usuarios_con('coordinador', i.sucursal)) || array(select ing_usuarios_con('rrhh', null)),
    'Ingreso N° ' || i.numero || ' anulado: ' || i.nombre,
    ing_correo_html('Ingreso N° ' || i.numero || ' anulado',
      '<p style="margin:0 0 12px">Motivo: ' || ing_html(btrim(p_motivo)) || '</p>' || ing_resumen_html(i.id), i.id));
end $$;

-- ---------------------------------------------------------------- vistas
-- Sin security_invoker a proposito: cuentan documentos y tareas que la persona quizas no puede
-- leer (un area no ve los documentos personales, pero si cuantos faltan). El filtro de filas lo
-- hace ing_ve(); solo exponen conteos y nombres, nunca la renta ni los archivos.

drop view if exists public.ing_ingresos_v;
create view public.ing_ingresos_v as
select i.*,
  ing_nombre(i.creado_por) as creado_por_nombre,
  ing_nombre(i.cerrado_por) as cerrado_por_nombre,
  coalesce(t.total, 0)::int as tareas_total,
  coalesce(t.hechas, 0)::int as tareas_hechas,
  coalesce(t.mias, 0)::int as tareas_mias,
  cardinality(ing_docs_requeridos(i.req_vehiculo)) as docs_requeridos,
  (select count(distinct a.tipo_doc)::int from ing_archivos a
   where a.ingreso_id = i.id and a.tipo_doc = any (ing_docs_requeridos(i.req_vehiculo))) as docs_ok,
  case when i.estado = 'en_proceso' and ing_completo(i.id) then 'listo' else i.estado end as situacion
from ing_ingresos i
left join lateral (
  select count(*) as total,
         count(*) filter (where x.hecha) as hechas,
         count(*) filter (where not x.hecha and ing_puede_tarea(x.id)) as mias
  from ing_tareas x where x.ingreso_id = i.id
) t on true
where ing_ve(i.id);

drop view if exists public.ing_tareas_v;
create view public.ing_tareas_v as
select t.*,
  ing_nombre(t.hecha_por) as hecha_por_nombre,
  ing_puede_tarea(t.id) as puedo
from ing_tareas t
where ing_ve(t.ingreso_id);

drop view if exists public.ing_bitacora_v;
create view public.ing_bitacora_v as
select b.*, ing_nombre(b.user_id) as usuario_nombre
from ing_bitacora b
where ing_ve(b.ingreso_id);

-- ---------------------------------------------------------------- RLS

alter table public.ing_ingresos     enable row level security;
alter table public.ing_remuneracion enable row level security;
alter table public.ing_tareas       enable row level security;
alter table public.ing_archivos     enable row level security;
alter table public.ing_bitacora     enable row level security;
alter table public.ing_correos      enable row level security;

-- ing_ingresos. El SELECT usa las columnas de la fila y no ing_ve(id): el INSERT ... RETURNING
-- revisa esta politica sobre la fila nueva, que una consulta dentro de ing_ve() todavia no ve.
drop policy if exists ing_ingresos_select on public.ing_ingresos;
create policy ing_ingresos_select on public.ing_ingresos for select to authenticated
  using (ing_tiene('rrhh') or creado_por = (select auth.uid())
         or (ing_tiene('coordinador') and ing_en_sucursal(sucursal))
         or ing_area_ve(id, sucursal));
drop policy if exists ing_ingresos_insert on public.ing_ingresos;
create policy ing_ingresos_insert on public.ing_ingresos for insert to authenticated
  with check (ing_tiene('solicitante') or ing_tiene('coordinador') or ing_tiene('rrhh'));
drop policy if exists ing_ingresos_update on public.ing_ingresos;
create policy ing_ingresos_update on public.ing_ingresos for update to authenticated
  using (ing_tiene('rrhh') or (ing_tiene('coordinador') and ing_en_sucursal(sucursal)))
  with check (ing_tiene('rrhh') or (ing_tiene('coordinador') and ing_en_sucursal(sucursal)));

-- ing_remuneracion: solo RRHH la lee y la edita; quien crea la solicitud puede dejarla al crearla
drop policy if exists ing_remuneracion_select on public.ing_remuneracion;
create policy ing_remuneracion_select on public.ing_remuneracion for select to authenticated
  using (ing_tiene('rrhh'));
drop policy if exists ing_remuneracion_insert on public.ing_remuneracion;
create policy ing_remuneracion_insert on public.ing_remuneracion for insert to authenticated
  with check (ing_tiene('rrhh') or exists (
    select 1 from public.ing_ingresos i
    where i.id = ingreso_id and i.creado_por = (select auth.uid()) and i.estado = 'en_proceso'));
drop policy if exists ing_remuneracion_update on public.ing_remuneracion;
create policy ing_remuneracion_update on public.ing_remuneracion for update to authenticated
  using (ing_tiene('rrhh')) with check (ing_tiene('rrhh'));

-- ing_tareas: se leen; se crean, completan y reabren solo por funciones
drop policy if exists ing_tareas_select on public.ing_tareas;
create policy ing_tareas_select on public.ing_tareas for select to authenticated
  using (ing_ve(ingreso_id));

-- ing_archivos: la ruta tiene que caer en la carpeta del ingreso (y de la tarea)
drop policy if exists ing_archivos_select on public.ing_archivos;
create policy ing_archivos_select on public.ing_archivos for select to authenticated
  using (ing_ve_archivo(ingreso_id, tarea_id));
drop policy if exists ing_archivos_insert on public.ing_archivos;
create policy ing_archivos_insert on public.ing_archivos for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and case
      when tarea_id is null then path like ingreso_id::text || '/docs/%' and ing_gestiona_docs(ingreso_id)
      else path like ingreso_id::text || '/tareas/' || tarea_id::text || '/%' and ing_puede_subir_evidencia(ingreso_id, tarea_id)
    end);
drop policy if exists ing_archivos_delete on public.ing_archivos;
create policy ing_archivos_delete on public.ing_archivos for delete to authenticated
  using (ing_ve_archivo(ingreso_id, tarea_id) and ing_puede_borrar_archivo(ingreso_id, tarea_id, subido_por));

-- ing_bitacora: los eventos los escriben las funciones; las personas solo agregan comentarios
drop policy if exists ing_bitacora_select on public.ing_bitacora;
create policy ing_bitacora_select on public.ing_bitacora for select to authenticated
  using (ing_ve(ingreso_id));
drop policy if exists ing_bitacora_insert on public.ing_bitacora;
create policy ing_bitacora_insert on public.ing_bitacora for insert to authenticated
  with check (tipo = 'comentario' and user_id = (select auth.uid()) and ing_ve(ingreso_id));

-- ing_correos: sin politicas, nadie la lee desde la web

-- ---------------------------------------------------------------- privilegios

revoke all on public.ing_ingresos, public.ing_remuneracion, public.ing_tareas, public.ing_archivos,
              public.ing_bitacora, public.ing_correos,
              public.ing_ingresos_v, public.ing_tareas_v, public.ing_bitacora_v from anon;
revoke all on public.ing_correos from authenticated;
revoke delete, truncate on public.ing_ingresos, public.ing_remuneracion from authenticated;
revoke insert, update, delete, truncate on public.ing_tareas from authenticated;
revoke update, truncate on public.ing_archivos from authenticated;
revoke update, delete, truncate on public.ing_bitacora from authenticated;
revoke insert, update, delete, truncate on public.ing_ingresos_v, public.ing_tareas_v, public.ing_bitacora_v from authenticated;
grant select on public.ing_ingresos_v, public.ing_tareas_v, public.ing_bitacora_v to authenticated;

-- Todas las funciones: fuera de public y anon. Las que usan la RLS, las vistas y el trigger
-- BEFORE (que corre como el usuario) quedan para authenticated; responden solo por quien llama.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'ing\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function
  public.ing_tiene(text), public.ing_tiene_acceso(uuid), public.ing_en_sucursal(text),
  public.ing_area_ve(uuid, text), public.ing_ve(uuid), public.ing_gestiona_docs(uuid),
  public.ing_puede_tarea(uuid), public.ing_ve_archivo(uuid, uuid), public.ing_puede_subir_evidencia(uuid, uuid),
  public.ing_puede_borrar_archivo(uuid, uuid, uuid), public.ing_ve_objeto(text), public.ing_puede_subir_objeto(text),
  public.ing_puede_borrar_objeto(text, text), public.ing_completo(uuid), public.ing_docs_requeridos(boolean),
  public.ing_nombre(uuid), public.ing_rut_normalizar(text), public.ing_rut_valido(text), public.ing_hoy(),
  public.ing_completar_tarea(uuid, text), public.ing_reabrir_tarea(uuid), public.ing_cerrar(uuid, text),
  public.ing_anular(uuid, text)
  to authenticated;
-- internas: avisar a cualquiera, crear tareas o preguntar por otros usuarios
revoke execute on function
  public.ing_usuario_tiene(text, uuid), public.ing_usuario_en_sucursal(uuid, text), public.ing_usuarios_con(text, text),
  public.ing_encolar(uuid[], text, text), public.ing_sincronizar_tareas(uuid), public.ing_revisar_listo(uuid),
  public.ing_resumen_html(uuid), public.ing_ingreso_despues(), public.ing_archivo_bitacora()
  from authenticated;

-- ---------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ingreso-personal', 'ingreso-personal', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ing_objects_select on storage.objects;
create policy ing_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'ingreso-personal' and public.ing_ve_objeto(name));
drop policy if exists ing_objects_insert on storage.objects;
create policy ing_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ingreso-personal' and public.ing_puede_subir_objeto(name));
drop policy if exists ing_objects_delete on storage.objects;
create policy ing_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ingreso-personal' and public.ing_puede_borrar_objeto(name, owner_id));

notify pgrst, 'reload schema';

commit;

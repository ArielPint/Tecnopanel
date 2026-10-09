-- Modulo SSO / Prevencion de Riesgos (PLAN_SSO_PREVENCION.md, paso 1).
--
-- Modulo TRANSVERSAL a la empresa: los hallazgos no pertenecen a ningun proyecto. Vive en la
-- seccion Gestion del hub (/sso) con accesos propios.
--
-- Accesos: permisos.proyecto_id es NOT NULL, asi que igual que Gestion se cuelga de un
-- pseudo-proyecto tipo 'sistema' (invisible en toda lista de obras). Es uno PROPIO, slug 'sso',
-- y no el de Gestion ('sistema'), porque:
--   - syncPermisosGestion reemplaza todas las filas del usuario en 'sistema' (borraria las de SSO)
--   - tieneGestion se activa con cualquier fila en 'sistema' (el usuario SSO veria Gestion)
--
-- permisos.accion solo admite ver/crear/editar/eliminar/aprobar/exportar/avanzar, asi que
-- (modulo_key = 'sso' sobre el ancla):
--   ver      -> ver hallazgos
--   crear    -> reportar una NC y subir fotos de deteccion
--   editar   -> (encargado) cargar accion correctiva + fotos de cierre, enviar a verificacion
--   aprobar  -> (Prevencion / jefatura) validar el cierre, rechazar, editar el hallazgo, configurar areas
--   eliminar -> borrar hallazgos
--   exportar -> exportar a Excel / PDF (lo controla el front)
-- Los admin del portal (es_admin_portal) pueden todo.
--
-- Re-ejecutable. Hay que volver a correrlo despues de cada 05-resincronizar-datos.ps1, que vacia
-- public y storage.buckets (se pierden el ancla y el bucket). Lo hace 06-sso.ps1.
-- Los cambios de estado no se hacen por UPDATE directo sino por sso_cambiar_estado().

-- El archivo es UTF-8 y tiene textos con tilde. psql en Windows toma la codificacion de la consola
-- si no se le dice, y los guarda mal ("PrevenciÃ³n"). Esto lo fija sea cual sea el cliente.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- ancla de accesos

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('9cb074b8-9085-4b96-9600-0b7fde3d036e', 'Prevención de Riesgos (sistema)', 'sso', 'sistema', 'activo',
        '#64748b', 'Ancla de accesos del modulo SSO. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.sso_ancla_id()
returns uuid language sql immutable as $$
  select '9cb074b8-9085-4b96-9600-0b7fde3d036e'::uuid
$$;

-- El usuario indicado (por defecto el que llama) puede hacer p_accion en SSO.
-- Security definer: hace falta para preguntar por otros usuarios (permisos solo muestra los propios).
create or replace function public.sso_usuario_puede(p_accion text default 'ver', p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and coalesce(p.activo, true)
      and (coalesce(p.is_super_admin, false) or coalesce(p.is_root, false) or p.rol = 'admin')
  ) or exists (
    select 1 from permisos pe
    where pe.user_id = p_user_id and pe.proyecto_id = sso_ancla_id()
      and pe.modulo_key = 'sso' and pe.accion = p_accion
  )
$$;

create or replace function public.sso_puede(p_accion text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select sso_usuario_puede(p_accion, auth.uid())
$$;

-- ---------------------------------------------------------------- tipos y utilidades

do $$ begin
  create type public.sso_estado as enum ('abierto','en_proceso','pend_verificacion','cerrado');
exception when duplicate_object then null; end $$;

-- "Hoy" en Chile, independiente de la zona horaria del servidor.
create or replace function public.sso_hoy()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santiago')::date
$$;

-- ---------------------------------------------------------------- tablas

-- area -> encargado: habilita la asignacion automatica del responsable
create table if not exists public.sso_areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  encargado_user_id uuid references auth.users(id) on delete set null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sso_hallazgos (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,  -- correlativo de la empresa; el cliente no lo fija
  area_id uuid references public.sso_areas(id) on delete set null,
  ubicacion text not null,
  descripcion text not null,
  fecha_deteccion date not null default public.sso_hoy(),
  reportado_por uuid not null default auth.uid() references auth.users(id),
  responsable_user_id uuid not null references auth.users(id),  -- default: encargado del area
  fecha_compromiso date not null,
  estado public.sso_estado not null default 'abierto',
  accion_correctiva text,
  cerrado_por uuid references auth.users(id),
  fecha_cierre timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_compromiso >= fecha_deteccion),
  check ((estado = 'cerrado') = (fecha_cierre is not null))
);

-- foto de la condicion (deteccion) y de la correccion (cierre) en una sola tabla
create table if not exists public.sso_evidencias (
  id uuid primary key default gen_random_uuid(),
  hallazgo_id uuid not null references public.sso_hallazgos(id) on delete cascade,
  tipo text not null check (tipo in ('deteccion','cierre')),
  path text not null unique,                        -- objeto en el bucket 'sso'
  nombre text,
  subido_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sso_bitacora (
  id uuid primary key default gen_random_uuid(),
  hallazgo_id uuid not null references public.sso_hallazgos(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id),
  evento text not null default 'comentario'
    check (evento in ('creado','estado','responsable','plazo','accion_correctiva','evidencia','comentario')),
  estado_anterior public.sso_estado,
  estado_nuevo public.sso_estado,
  comentario text,
  -- clock_timestamp: varios eventos de una misma transaccion quedan en orden
  created_at timestamptz not null default clock_timestamp()
);

-- misma forma que solicitudes_notificaciones, mas el vinculo al hallazgo
create table if not exists public.sso_notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  hallazgo_id uuid references public.sso_hallazgos(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sso_hallazgos_estado_idx    on public.sso_hallazgos (estado);
create index if not exists sso_hallazgos_resp_est_idx  on public.sso_hallazgos (responsable_user_id, estado);
create index if not exists sso_hallazgos_area_idx      on public.sso_hallazgos (area_id);
create index if not exists sso_evidencias_hallazgo_idx on public.sso_evidencias (hallazgo_id);
create index if not exists sso_bitacora_hallazgo_idx   on public.sso_bitacora (hallazgo_id, created_at);
create index if not exists sso_notificaciones_user_idx on public.sso_notificaciones (user_id, leida);

-- Vencido / dias de atraso / cumplimiento de plazo se calculan, no se guardan.
-- security_invoker: la vista respeta la RLS de sso_hallazgos.
-- drop + create (no "or replace"): h.* fija las columnas al crear la vista, y las fases siguientes
-- agregan columnas a sso_hallazgos (ej. origen_inspeccion_id); "or replace" fallaria al re-correr.
drop view if exists public.sso_hallazgos_v;
create view public.sso_hallazgos_v with (security_invoker = true) as
select h.*,
  (h.estado <> 'cerrado' and h.fecha_compromiso < public.sso_hoy())            as vencido,
  case when h.estado = 'cerrado'
       then greatest(((h.fecha_cierre at time zone 'America/Santiago')::date - h.fecha_compromiso), 0)
       else greatest(public.sso_hoy() - h.fecha_compromiso, 0) end              as dias_atraso,
  case when h.estado = 'cerrado'
       then (h.fecha_cierre at time zone 'America/Santiago')::date <= h.fecha_compromiso end
                                                                               as cerrado_en_plazo
from public.sso_hallazgos h;

-- Personas con acceso SSO, para elegir responsable / encargado en el front y para las
-- notificaciones (paso 4). Solo la ve quien tiene acceso al modulo.
create or replace function public.sso_usuarios(p_accion text default 'ver')
returns table (id uuid, nombre text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), p.email
  from profiles p
  where sso_puede('ver') and coalesce(p.activo, true) and sso_usuario_puede(p_accion, p.id)
  order by 2
$$;

-- ---------------------------------------------------------------- triggers de sso_hallazgos

-- Los dos triggers BEFORE son SECURITY INVOKER a proposito: current_user tiene que ser el del
-- que llama ('authenticated' desde PostgREST, el dueno cuando viene de sso_cambiar_estado()).
-- Con security definer current_user seria siempre el dueno y los resguardos no se activarian.

-- BEFORE INSERT: responsable por defecto y valores que el usuario no fija
create or replace function public.sso_hallazgo_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    new.estado := 'abierto';
    new.reportado_por := auth.uid();
    new.accion_correctiva := null;
    new.cerrado_por := null;
    new.fecha_cierre := null;
  end if;

  if new.responsable_user_id is null and new.area_id is not null then
    select a.encargado_user_id into new.responsable_user_id
    from sso_areas a where a.id = new.area_id;
  end if;
  if new.responsable_user_id is null then
    raise exception 'Falta el responsable: elige uno o asigna un encargado al area' using errcode = '23502';
  end if;

  return new;
end $$;

-- BEFORE INSERT/UPDATE: el responsable tiene que poder ver el modulo, o nunca veria su hallazgo.
-- Aparte y security definer porque sso_usuario_puede() no es ejecutable por authenticated.
-- Corre despues de sso_hallazgo_before_insert (orden alfabetico), con el responsable ya resuelto.
create or replace function public.sso_hallazgo_validar_responsable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not sso_usuario_puede('ver', new.responsable_user_id) then
    raise exception 'El responsable no tiene acceso al modulo de Prevencion' using errcode = '22023';
  end if;
  return new;
end $$;

-- BEFORE UPDATE: que cada rol toque solo lo suyo. El estado, el cierre y los datos de
-- origen solo cambian desde sso_cambiar_estado() (security definer, current_user <> authenticated).
create or replace function public.sso_hallazgo_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();

  if current_user not in ('authenticated','anon') then
    return new;
  end if;

  if new.estado is distinct from old.estado
     or new.cerrado_por is distinct from old.cerrado_por
     or new.fecha_cierre is distinct from old.fecha_cierre
     or new.reportado_por is distinct from old.reportado_por
     or new.fecha_deteccion is distinct from old.fecha_deteccion then
    raise exception 'El estado y el cierre se cambian con sso_cambiar_estado()' using errcode = '42501';
  end if;

  if old.estado = 'cerrado' then
    raise exception 'El hallazgo esta cerrado' using errcode = '42501';
  end if;

  if not sso_puede('aprobar') then
    -- el encargado solo carga la accion correctiva, y mientras el hallazgo sigue en sus manos
    if new.ubicacion is distinct from old.ubicacion
       or new.descripcion is distinct from old.descripcion
       or new.area_id is distinct from old.area_id
       or new.responsable_user_id is distinct from old.responsable_user_id
       or new.fecha_compromiso is distinct from old.fecha_compromiso then
      raise exception 'Solo Prevencion o jefatura puede editar el hallazgo' using errcode = '42501';
    end if;
    if old.estado not in ('abierto','en_proceso') then
      raise exception 'El hallazgo esta en verificacion' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

-- AFTER INSERT/UPDATE: trazabilidad. Ningun camino de la app se salta la bitacora.
-- El comentario de un cambio de estado llega por la variable de transaccion sso.comentario.
create or replace function public.sso_hallazgo_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into sso_bitacora (hallazgo_id, user_id, evento, estado_nuevo)
    values (new.id, auth.uid(), 'creado', new.estado);
    return new;
  end if;

  if new.estado is distinct from old.estado then
    insert into sso_bitacora (hallazgo_id, user_id, evento, estado_anterior, estado_nuevo, comentario)
    values (new.id, auth.uid(), 'estado', old.estado, new.estado,
            nullif(current_setting('sso.comentario', true), ''));
  end if;
  if new.responsable_user_id is distinct from old.responsable_user_id then
    insert into sso_bitacora (hallazgo_id, user_id, evento, comentario)
    values (new.id, auth.uid(), 'responsable',
            'Responsable: ' || coalesce((select nombre from profiles where id = old.responsable_user_id), old.responsable_user_id::text)
            || ' -> ' || coalesce((select nombre from profiles where id = new.responsable_user_id), new.responsable_user_id::text));
  end if;
  if new.fecha_compromiso is distinct from old.fecha_compromiso then
    insert into sso_bitacora (hallazgo_id, user_id, evento, comentario)
    values (new.id, auth.uid(), 'plazo',
            'Plazo: ' || to_char(old.fecha_compromiso, 'DD-MM-YYYY') || ' -> ' || to_char(new.fecha_compromiso, 'DD-MM-YYYY'));
  end if;
  if new.accion_correctiva is distinct from old.accion_correctiva then
    insert into sso_bitacora (hallazgo_id, user_id, evento, comentario)
    values (new.id, auth.uid(), 'accion_correctiva', new.accion_correctiva);
  end if;
  return new;
end $$;

drop trigger if exists sso_hallazgo_before_insert on public.sso_hallazgos;
create trigger sso_hallazgo_before_insert before insert on public.sso_hallazgos
  for each row execute function public.sso_hallazgo_before_insert();

drop trigger if exists sso_hallazgo_before_update on public.sso_hallazgos;
create trigger sso_hallazgo_before_update before update on public.sso_hallazgos
  for each row execute function public.sso_hallazgo_before_update();

drop trigger if exists sso_hallazgo_validar_responsable on public.sso_hallazgos;
create trigger sso_hallazgo_validar_responsable before insert or update of responsable_user_id on public.sso_hallazgos
  for each row execute function public.sso_hallazgo_validar_responsable();

drop trigger if exists sso_hallazgo_bitacora on public.sso_hallazgos;
create trigger sso_hallazgo_bitacora after insert or update on public.sso_hallazgos
  for each row execute function public.sso_hallazgo_bitacora();

-- evidencias: tambien quedan en la bitacora
create or replace function public.sso_evidencia_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sso_bitacora (hallazgo_id, user_id, evento, comentario)
  values (new.hallazgo_id, auth.uid(), 'evidencia',
          'Foto de ' || new.tipo || coalesce(': ' || new.nombre, ''));
  return new;
end $$;

drop trigger if exists sso_evidencia_bitacora on public.sso_evidencias;
create trigger sso_evidencia_bitacora after insert on public.sso_evidencias
  for each row execute function public.sso_evidencia_bitacora();

-- ---------------------------------------------------------------- maquina de estados

-- Transiciones permitidas:
--   abierto            -> en_proceso         encargado (editar) o validador (aprobar)
--   abierto/en_proceso -> pend_verificacion  encargado o validador; exige accion correctiva y >= 1 foto de cierre
--   pend_verificacion  -> cerrado            validador (requisito 10)
--   pend_verificacion  -> en_proceso         validador, rechazo con comentario obligatorio
-- Un hallazgo cerrado no se reabre: queda como registro historico (requisito 12).
create or replace function public.sso_cambiar_estado(
  p_hallazgo_id uuid, p_estado public.sso_estado, p_comentario text default null)
returns public.sso_estado language plpgsql security definer set search_path = public as $$
declare
  h sso_hallazgos%rowtype;
  v_validador boolean;
  v_encargado boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into h from sso_hallazgos where id = p_hallazgo_id for update;
  if not found or not sso_puede('ver') then
    raise exception 'Hallazgo no encontrado' using errcode = 'P0002';
  end if;

  v_validador := sso_puede('aprobar');
  v_encargado := h.responsable_user_id = auth.uid() and sso_puede('editar');

  if h.estado = 'abierto' and p_estado = 'en_proceso' then
    if not (v_encargado or v_validador) then
      raise exception 'Solo el responsable puede tomar el hallazgo' using errcode = '42501';
    end if;

  elsif h.estado in ('abierto','en_proceso') and p_estado = 'pend_verificacion' then
    if not (v_encargado or v_validador) then
      raise exception 'Solo el responsable puede enviar a verificacion' using errcode = '42501';
    end if;
    if coalesce(btrim(h.accion_correctiva), '') = '' then
      raise exception 'Falta registrar la accion correctiva' using errcode = 'P0001';
    end if;
    if not exists (select 1 from sso_evidencias e where e.hallazgo_id = h.id and e.tipo = 'cierre') then
      raise exception 'Falta al menos una foto que evidencie la correccion' using errcode = 'P0001';
    end if;

  elsif h.estado = 'pend_verificacion' and p_estado = 'cerrado' then
    if not v_validador then
      raise exception 'Solo Prevencion o jefatura puede validar el cierre' using errcode = '42501';
    end if;

  elsif h.estado = 'pend_verificacion' and p_estado = 'en_proceso' then
    if not v_validador then
      raise exception 'Solo Prevencion o jefatura puede rechazar el cierre' using errcode = '42501';
    end if;
    if coalesce(btrim(p_comentario), '') = '' then
      raise exception 'Indica el motivo del rechazo' using errcode = 'P0001';
    end if;

  else
    raise exception 'Transicion no permitida: % -> %', h.estado, p_estado using errcode = '22023';
  end if;

  perform set_config('sso.comentario', coalesce(p_comentario, ''), true);

  update sso_hallazgos set
    estado = p_estado,
    cerrado_por  = case when p_estado = 'cerrado' then auth.uid() end,
    fecha_cierre = case when p_estado = 'cerrado' then now() end
  where id = h.id;

  perform set_config('sso.comentario', '', true);
  return h.estado;
end $$;

-- ---------------------------------------------------------------- notificaciones (paso 4)
--
-- Solo en la app (campana del hub). El correo queda para cuando RESEND_API_KEY / RESEND_FROM
-- esten configurados en el servidor propio.
--
--   Evento                                   Destinatario
--   hallazgo nuevo o cambio de responsable   responsable
--   enviado a verificacion                   supervisores (quienes validan)
--   cierre rechazado                         responsable, con el motivo
--   hallazgo cerrado                         quien lo reporto y el responsable
--   faltan 3 dias para el plazo (diario)     responsable
--   vence hoy (diario)                       responsable + supervisores
--   vencido (diario)                         responsable + supervisores
-- Nunca se notifica a quien hizo la accion.

-- Supervisores = quienes tienen 'aprobar' explicito. Si nadie lo tiene todavia, los admin del
-- portal (sin la cuenta root, que esta oculta), para que el aviso no se pierda.
create or replace function public.sso_supervisores()
returns setof uuid language sql stable security definer set search_path = public as $$
  with explicitos as (
    select distinct pe.user_id
    from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.proyecto_id = sso_ancla_id() and pe.modulo_key = 'sso' and pe.accion = 'aprobar'
  )
  select user_id from explicitos
  union all
  select p.id from profiles p
  where not exists (select 1 from explicitos)
    and coalesce(p.activo, true) and not coalesce(p.is_root, false)
    and (coalesce(p.is_super_admin, false) or p.rol = 'admin')
$$;

create or replace function public.sso_notificar(
  p_destinatarios uuid[], p_hallazgo_id uuid, p_tipo text, p_titulo text, p_mensaje text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into sso_notificaciones (user_id, hallazgo_id, tipo, titulo, mensaje)
  select distinct d, p_hallazgo_id, p_tipo, p_titulo, p_mensaje
  from unnest(p_destinatarios) d
  where d is not null
    and d is distinct from auth.uid()
    and exists (select 1 from profiles p where p.id = d and coalesce(p.activo, true));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.sso_hallazgo_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref text := 'Hallazgo N° ' || new.numero;
  v_resumen text := left(new.descripcion, 140) || ' · ' || new.ubicacion;
begin
  if tg_op = 'INSERT' or new.responsable_user_id is distinct from old.responsable_user_id then
    perform sso_notificar(array[new.responsable_user_id], new.id, 'asignado',
      v_ref || ' asignado a ti · plazo ' || to_char(new.fecha_compromiso, 'DD-MM-YYYY'), v_resumen);
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'pend_verificacion' then
      perform sso_notificar(array(select sso_supervisores()), new.id, 'por_verificar',
        v_ref || ' listo para verificar', left(coalesce(new.accion_correctiva, ''), 200));
    elsif old.estado = 'pend_verificacion' and new.estado = 'en_proceso' then
      perform sso_notificar(array[new.responsable_user_id], new.id, 'rechazado',
        v_ref || ': cierre rechazado', nullif(current_setting('sso.comentario', true), ''));
    elsif new.estado = 'cerrado' then
      perform sso_notificar(array[new.reportado_por, new.responsable_user_id], new.id, 'cerrado',
        v_ref || ' cerrado', v_resumen);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sso_hallazgo_notificar on public.sso_hallazgos;
create trigger sso_hallazgo_notificar after insert or update on public.sso_hallazgos
  for each row execute function public.sso_hallazgo_notificar();

-- Alertas de plazo. La corre una vez al dia la tarea programada TP-SSO-Alertas (06-sso.ps1),
-- que reemplaza al pg_cron del plan: el servidor propio no tiene pg_cron.
-- Idempotente en el dia: si corre dos veces no duplica avisos.
create or replace function public.sso_alertas_diarias()
returns text language plpgsql security definer set search_path = public as $$
declare
  h record;
  v_hoy date := sso_hoy();
  v_supervisores uuid[] := array(select sso_supervisores());
  v_dest uuid[];
  v_tipo text;
  v_titulo text;
  n_por_vencer int := 0;
  n_hoy int := 0;
  n_vencido int := 0;
  v_n int;
begin
  for h in
    select * from sso_hallazgos
    where estado <> 'cerrado'
      and (fecha_compromiso = v_hoy + 3 or fecha_compromiso <= v_hoy)
  loop
    if h.fecha_compromiso = v_hoy + 3 then
      v_tipo := 'por_vencer';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vence en 3 días';
      v_dest := array[h.responsable_user_id];
    elsif h.fecha_compromiso = v_hoy then
      v_tipo := 'vence_hoy';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vence hoy';
      v_dest := h.responsable_user_id || v_supervisores;
    else
      v_tipo := 'vencido';
      v_titulo := 'Hallazgo N° ' || h.numero || ' vencido hace ' || (v_hoy - h.fecha_compromiso)
                  || case when v_hoy - h.fecha_compromiso = 1 then ' día' else ' días' end;
      v_dest := h.responsable_user_id || v_supervisores;
    end if;

    -- el mismo aviso ya salio hoy a esa persona: no repetir
    v_dest := array(
      select d from unnest(v_dest) d
      where not exists (
        select 1 from sso_notificaciones n
        where n.user_id = d and n.hallazgo_id = h.id and n.tipo = v_tipo
          and (n.created_at at time zone 'America/Santiago')::date = v_hoy));

    v_n := sso_notificar(v_dest, h.id, v_tipo, v_titulo, left(h.descripcion, 140) || ' · ' || h.ubicacion);
    if v_tipo = 'por_vencer' then n_por_vencer := n_por_vencer + v_n;
    elsif v_tipo = 'vence_hoy' then n_hoy := n_hoy + v_n;
    else n_vencido := n_vencido + v_n; end if;
  end loop;

  return format('avisos por_vencer=%s vence_hoy=%s vencido=%s', n_por_vencer, n_hoy, n_vencido);
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.sso_areas          enable row level security;
alter table public.sso_hallazgos      enable row level security;
alter table public.sso_evidencias     enable row level security;
alter table public.sso_bitacora       enable row level security;
alter table public.sso_notificaciones enable row level security;

-- sso_areas
drop policy if exists sso_areas_select on public.sso_areas;
create policy sso_areas_select on public.sso_areas for select to authenticated
  using (sso_puede('ver'));
drop policy if exists sso_areas_insert on public.sso_areas;
create policy sso_areas_insert on public.sso_areas for insert to authenticated
  with check (sso_puede('aprobar'));
drop policy if exists sso_areas_update on public.sso_areas;
create policy sso_areas_update on public.sso_areas for update to authenticated
  using (sso_puede('aprobar')) with check (sso_puede('aprobar'));
drop policy if exists sso_areas_delete on public.sso_areas;
create policy sso_areas_delete on public.sso_areas for delete to authenticated
  using (sso_puede('aprobar'));

-- sso_hallazgos
drop policy if exists sso_hallazgos_select on public.sso_hallazgos;
create policy sso_hallazgos_select on public.sso_hallazgos for select to authenticated
  using (sso_puede('ver'));
drop policy if exists sso_hallazgos_insert on public.sso_hallazgos;
create policy sso_hallazgos_insert on public.sso_hallazgos for insert to authenticated
  with check (sso_puede('crear'));
drop policy if exists sso_hallazgos_update on public.sso_hallazgos;
create policy sso_hallazgos_update on public.sso_hallazgos for update to authenticated
  using (sso_puede('aprobar') or (responsable_user_id = (select auth.uid()) and sso_puede('editar')))
  with check (sso_puede('aprobar') or (responsable_user_id = (select auth.uid()) and sso_puede('editar')));
drop policy if exists sso_hallazgos_delete on public.sso_hallazgos;
create policy sso_hallazgos_delete on public.sso_hallazgos for delete to authenticated
  using (sso_puede('eliminar'));

-- sso_evidencias: el path debe caer dentro de la carpeta del hallazgo y de su tipo
drop policy if exists sso_evidencias_select on public.sso_evidencias;
create policy sso_evidencias_select on public.sso_evidencias for select to authenticated
  using (sso_puede('ver'));
drop policy if exists sso_evidencias_insert on public.sso_evidencias;
create policy sso_evidencias_insert on public.sso_evidencias for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and exists (
      select 1 from public.sso_hallazgos h
      where h.id = hallazgo_id
        and path like h.id || '/' || tipo || '/%'
        and (
          (tipo = 'deteccion' and h.estado <> 'cerrado' and sso_puede('crear'))
          or (tipo = 'cierre' and h.estado in ('abierto','en_proceso')
              and (sso_puede('aprobar') or (h.responsable_user_id = (select auth.uid()) and sso_puede('editar'))))
        )));
drop policy if exists sso_evidencias_delete on public.sso_evidencias;
create policy sso_evidencias_delete on public.sso_evidencias for delete to authenticated
  using (exists (
    select 1 from public.sso_hallazgos h
    where h.id = hallazgo_id
      and (
        (h.estado in ('abierto','en_proceso') and subido_por = (select auth.uid()))
        or (h.estado <> 'cerrado' and sso_puede('aprobar'))
      )));

-- sso_bitacora: los triggers escriben los eventos; el usuario solo agrega comentarios
drop policy if exists sso_bitacora_select on public.sso_bitacora;
create policy sso_bitacora_select on public.sso_bitacora for select to authenticated
  using (sso_puede('ver'));
drop policy if exists sso_bitacora_insert on public.sso_bitacora;
create policy sso_bitacora_insert on public.sso_bitacora for insert to authenticated
  with check (
    evento = 'comentario' and estado_anterior is null and estado_nuevo is null
    and user_id = (select auth.uid())
    and coalesce(btrim(comentario), '') <> ''
    and sso_puede('ver')
    and exists (select 1 from public.sso_hallazgos h where h.id = hallazgo_id));

-- sso_notificaciones: cada uno ve y marca las suyas; las crean funciones security definer (paso 4)
drop policy if exists sso_notificaciones_select on public.sso_notificaciones;
create policy sso_notificaciones_select on public.sso_notificaciones for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists sso_notificaciones_update on public.sso_notificaciones;
create policy sso_notificaciones_update on public.sso_notificaciones for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- privilegios

revoke all on public.sso_areas, public.sso_hallazgos, public.sso_evidencias, public.sso_bitacora,
              public.sso_notificaciones, public.sso_hallazgos_v from anon;
revoke insert, update, delete, truncate on public.sso_bitacora from authenticated;
grant insert on public.sso_bitacora to authenticated;
revoke insert, delete, truncate on public.sso_notificaciones from authenticated;
revoke truncate on public.sso_areas, public.sso_hallazgos, public.sso_evidencias from authenticated;
revoke insert, update, delete, truncate on public.sso_hallazgos_v from authenticated;

revoke execute on function public.sso_cambiar_estado(uuid, public.sso_estado, text) from public, anon;
grant  execute on function public.sso_cambiar_estado(uuid, public.sso_estado, text) to authenticated;
revoke execute on function public.sso_usuarios(text) from public, anon;
grant  execute on function public.sso_usuarios(text) to authenticated;
revoke execute on function public.sso_puede(text) from public, anon;
grant  execute on function public.sso_puede(text) to authenticated;
-- sso_usuario_puede responde por cualquier usuario: solo para uso interno (triggers, RLS, RPC)
revoke execute on function public.sso_usuario_puede(text, uuid) from public, anon, authenticated;
revoke execute on function public.sso_hallazgo_before_insert(), public.sso_hallazgo_before_update(),
                           public.sso_hallazgo_validar_responsable(),
                           public.sso_hallazgo_bitacora(), public.sso_evidencia_bitacora(),
                           public.sso_hallazgo_notificar()
  from public, anon, authenticated;
-- internas: notificar a cualquiera o disparar las alertas no es algo que haga el usuario
revoke execute on function public.sso_supervisores(), public.sso_notificar(uuid[], uuid, text, text, text),
                           public.sso_alertas_diarias()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sso', 'sso', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: <hallazgo_id>/<deteccion|cierre>/<timestamp>-<nombre>
drop policy if exists sso_objects_select on storage.objects;
create policy sso_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'sso' and public.sso_puede('ver'));

drop policy if exists sso_objects_insert on storage.objects;
create policy sso_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and exists (
    select 1 from public.sso_hallazgos h
    where h.id::text = (storage.foldername(objects.name))[1]
      and (
        ((storage.foldername(objects.name))[2] = 'deteccion' and h.estado <> 'cerrado'
          and public.sso_puede('crear'))
        or ((storage.foldername(objects.name))[2] = 'cierre' and h.estado in ('abierto','en_proceso')
          and (public.sso_puede('aprobar')
               or (h.responsable_user_id = (select auth.uid()) and public.sso_puede('editar'))))
      )));

drop policy if exists sso_objects_delete on storage.objects;
create policy sso_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and exists (
    select 1 from public.sso_hallazgos h
    where h.id::text = (storage.foldername(objects.name))[1]
      and (
        (h.estado in ('abierto','en_proceso') and objects.owner_id = (select auth.uid())::text)
        or (h.estado <> 'cerrado' and public.sso_puede('aprobar'))
        or public.sso_puede('eliminar')   -- al eliminar el hallazgo se borran sus fotos, este en el estado que este
      )));

-- que PostgREST vea los cambios sin reiniciar el servicio
notify pgrst, 'reload schema';

commit;

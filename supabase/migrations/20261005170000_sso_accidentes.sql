-- Portal de Prevencion, fase 6 (PLAN_SSO_PORTAL.md): Accidentes e incidentes.
--
-- Eventos: accidente con tiempo perdido (CTP), sin tiempo perdido (STP), de trayecto, enfermedad
-- profesional, incidente y casi-accidente. Con afectado, lesion, dias perdidos, DIAT/DIEP a la
-- Mutual de Seguridad CChC, investigacion de causas y medidas correctivas (hallazgos con
-- origen_evento_id). Un accidente grave o fatal avisa de inmediato a Prevencion.
--
-- Tasas (Ley 16.744; las calcula el front con sso_eventos_v y sso_dotacion_mensual): se excluyen
-- trayecto, incidentes y casi-accidentes. Dotacion y horas-hombre se ingresan a mano por mes y POR
-- EMPRESA: Tecnopanel y cada contratista se calculan aparte.
--
-- Permisos (modulo 'accidentes'): ver, crear (reportar), editar (investigar y completar cualquier
-- evento), aprobar (cerrar investigaciones y cargar dotacion/HH), eliminar, exportar.
-- Storage: bucket 'sso', carpeta eventos/<evento_id>/...
--
-- Re-ejecutable. Va despues de 20261005160000_sso_inspecciones.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- eventos

create table if not exists public.sso_eventos (
  id uuid primary key default gen_random_uuid(),
  numero int generated always as identity unique,
  tipo text not null check (tipo in ('accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad', 'incidente', 'casi_accidente')),
  gravedad text not null default 'leve' check (gravedad in ('leve', 'grave', 'fatal')),
  ocurrido_en timestamptz not null,
  area_id uuid references public.sso_areas(id) on delete set null,
  lugar text,
  descripcion text not null,
  trabajador_id uuid references public.sso_trabajadores(id) on delete set null,   -- afectado
  empresa_id uuid references public.sso_empresas(id),                            -- para las tasas por empresa
  testigos text,
  -- lesion y atencion
  lesion text,
  parte_cuerpo text,
  dias_perdidos int not null default 0 check (dias_perdidos >= 0),
  fecha_alta date,
  diat_folio text,                                -- DIAT o DIEP ingresada a la Mutual
  diat_fecha date,
  -- grave o fatal: notificacion a la autoridad (Inspeccion del Trabajo y Seremi de Salud)
  autoridad_notificada_en timestamptz,
  -- investigacion
  estado text not null default 'reportado' check (estado in ('reportado', 'en_investigacion', 'cerrado')),
  causas_inmediatas text,
  causas_basicas text,
  investigado_por uuid references auth.users(id),
  cerrado_por uuid references auth.users(id),
  cerrado_en timestamptz,
  reportado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sso_eventos_fecha_idx on public.sso_eventos (ocurrido_en desc);
create index if not exists sso_eventos_trab_idx on public.sso_eventos (trabajador_id);

-- medidas correctivas: hallazgos que nacen del evento
alter table public.sso_hallazgos add column if not exists origen_evento_id uuid references public.sso_eventos(id) on delete set null;

-- sso_hallazgos_v usa h.*: se recrea para que incluya la columna nueva
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
revoke all on public.sso_hallazgos_v from anon;
revoke insert, update, delete, truncate on public.sso_hallazgos_v from authenticated;

create or replace function public.sso_evento_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.ocurrido_en > now() + interval '5 minutes' then
    raise exception 'La fecha del evento no puede ser futura' using errcode = '22023';
  end if;
  -- la empresa sale del afectado (si hay); sin afectado, la elige quien reporta (o Tecnopanel)
  if new.trabajador_id is not null then
    select empresa_id into new.empresa_id from sso_trabajadores where id = new.trabajador_id;
  end if;
  if new.empresa_id is null then
    select id into new.empresa_id from sso_empresas where propia order by created_at limit 1;
  end if;
  if new.tipo not in ('accidente_ctp', 'enfermedad', 'trayecto') then
    new.dias_perdidos := 0;
  end if;
  if new.tipo in ('incidente', 'casi_accidente') then
    new.gravedad := 'leve';
  end if;
  -- cerrar exige la investigacion hecha; reabrir limpia el cierre
  if new.estado = 'cerrado' then
    if coalesce(btrim(new.causas_inmediatas), '') = '' or coalesce(btrim(new.causas_basicas), '') = '' then
      raise exception 'Para cerrar, registra las causas inmediatas y básicas' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' or old.estado <> 'cerrado' then
      new.cerrado_por := auth.uid();
      new.cerrado_en := now();
    end if;
  else
    new.cerrado_por := null;
    new.cerrado_en := null;
  end if;
  return new;
end $$;
drop trigger if exists sso_evento_antes on public.sso_eventos;
create trigger sso_evento_antes before insert or update on public.sso_eventos
  for each row execute function public.sso_evento_antes();

-- Guardas por rol (invoker: current_user es el del que llama). Tienen que correr ANTES que
-- sso_evento_antes (los BEFORE corren en orden alfabetico de nombre de trigger): primero se fija lo
-- que el usuario puede poner (ej. un reporte siempre nace "reportado") y despues se valida el cierre.
create or replace function public.sso_evento_guardas()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.reportado_por := auth.uid();
    if new.estado <> 'reportado' and not sso_puede_modulo('accidentes', 'editar') then
      new.estado := 'reportado';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.estado = 'cerrado' and old.estado <> 'cerrado' and not sso_puede_modulo('accidentes', 'aprobar') then
      raise exception 'Solo Prevención puede cerrar la investigación' using errcode = '42501';
    end if;
    if old.estado = 'cerrado' and new.estado <> 'cerrado' and not sso_puede_modulo('accidentes', 'aprobar') then
      raise exception 'Solo Prevención puede reabrir la investigación' using errcode = '42501';
    end if;
    if old.estado = 'cerrado' and new.estado = 'cerrado' and not sso_puede_modulo('accidentes', 'aprobar') then
      raise exception 'El evento está cerrado' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sso_evento_guardas on public.sso_eventos;
drop trigger if exists sso_evento_0_guardas on public.sso_eventos;
create trigger sso_evento_0_guardas before insert or update on public.sso_eventos
  for each row execute function public.sso_evento_guardas();

create or replace view public.sso_eventos_v with (security_invoker = true) as
select e.*,
  (e.ocurrido_en at time zone 'America/Santiago')::date as fecha,
  em.nombre as empresa,
  em.propia as empresa_propia,
  -- cuenta para las tasas legales (no trayecto, no incidentes)
  (e.tipo in ('accidente_ctp', 'enfermedad')) as con_tiempo_perdido,
  (select count(*) from public.sso_hallazgos h where h.origen_evento_id = e.id) as medidas,
  (select count(*) from public.sso_hallazgos h where h.origen_evento_id = e.id and h.estado <> 'cerrado') as medidas_pendientes
from public.sso_eventos e
left join public.sso_empresas em on em.id = e.empresa_id;

-- ---------------------------------------------------------------- dotacion y horas-hombre (a mano)

create table if not exists public.sso_dotacion_mensual (
  mes date not null check (extract(day from mes) = 1),   -- primer dia del mes
  empresa_id uuid not null references public.sso_empresas(id) on delete cascade,
  trabajadores numeric(8,1) not null check (trabajadores >= 0),   -- dotacion promedio del mes
  horas_hombre numeric(12,1) not null check (horas_hombre >= 0),
  actualizado_por uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (mes, empresa_id)
);

-- ---------------------------------------------------------------- avisos

alter table public.sso_notificaciones add column if not exists evento_id uuid references public.sso_eventos(id) on delete cascade;

-- grave o fatal: aviso inmediato a quienes cierran investigaciones (o a los supervisores de hallazgos)
create or replace function public.sso_evento_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dest uuid[];
begin
  if new.gravedad in ('grave', 'fatal')
     and (tg_op = 'INSERT' or old.gravedad not in ('grave', 'fatal')) then
    v_dest := array(
      select distinct pe.user_id from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
      where pe.proyecto_id = sso_ancla_id() and pe.modulo_key = 'sso:accidentes' and pe.accion = 'aprobar');
    if coalesce(array_length(v_dest, 1), 0) = 0 then v_dest := array(select sso_supervisores()); end if;
    insert into sso_notificaciones (user_id, evento_id, tipo, titulo, mensaje)
    select distinct d, new.id, 'accidente_' || new.gravedad,
           'Accidente ' || new.gravedad || ' N° ' || new.numero || ': notificar a la Inspección del Trabajo y a la Seremi de Salud',
           left(new.descripcion, 160)
    from unnest(v_dest) d
    where d is distinct from auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists sso_evento_notificar on public.sso_eventos;
create trigger sso_evento_notificar after insert or update of gravedad on public.sso_eventos
  for each row execute function public.sso_evento_notificar();

-- ---------------------------------------------------------------- medidas correctivas -> hallazgos

-- Crea un hallazgo (medida correctiva) vinculado al evento. Security definer: quien investiga puede
-- no tener el modulo Hallazgos. El responsable tiene que poder ver Hallazgos (lo valida el trigger).
create or replace function public.sso_evento_agregar_medida(
  p_evento_id uuid, p_descripcion text, p_responsable uuid, p_plazo date)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev record; v_id uuid;
begin
  if not (sso_puede_modulo('accidentes', 'editar') or sso_puede_modulo('accidentes', 'aprobar')) then
    raise exception 'Sin permiso para agregar medidas' using errcode = '42501';
  end if;
  select e.*, a.nombre as area_nombre into ev from sso_eventos e left join sso_areas a on a.id = e.area_id where e.id = p_evento_id;
  if not found then raise exception 'Evento no encontrado' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_descripcion), '') = '' then raise exception 'Describe la medida' using errcode = 'P0001'; end if;
  insert into sso_hallazgos (area_id, ubicacion, descripcion, fecha_deteccion, reportado_por, responsable_user_id, fecha_compromiso, origen_evento_id)
  values (ev.area_id, coalesce(nullif(btrim(ev.lugar), ''), ev.area_nombre, 'Sin ubicación'),
          'Medida correctiva (evento N° ' || ev.numero || '): ' || btrim(p_descripcion),
          sso_hoy(), auth.uid(), p_responsable, p_plazo, p_evento_id)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.sso_eventos          enable row level security;
alter table public.sso_dotacion_mensual enable row level security;

drop policy if exists sso_ev_select on public.sso_eventos;
create policy sso_ev_select on public.sso_eventos for select to authenticated using (sso_puede_modulo('accidentes', 'ver'));
drop policy if exists sso_ev_insert on public.sso_eventos;
create policy sso_ev_insert on public.sso_eventos for insert to authenticated with check (sso_puede_modulo('accidentes', 'crear'));
-- editar: el modulo (investigacion), o quien reporto mientras sigue "reportado"
drop policy if exists sso_ev_update on public.sso_eventos;
create policy sso_ev_update on public.sso_eventos for update to authenticated
  using (sso_puede_modulo('accidentes', 'editar') or sso_puede_modulo('accidentes', 'aprobar')
         or (reportado_por = (select auth.uid()) and estado = 'reportado' and sso_puede_modulo('accidentes', 'crear')))
  with check (sso_puede_modulo('accidentes', 'editar') or sso_puede_modulo('accidentes', 'aprobar')
         or (reportado_por = (select auth.uid()) and estado = 'reportado' and sso_puede_modulo('accidentes', 'crear')));
drop policy if exists sso_ev_delete on public.sso_eventos;
create policy sso_ev_delete on public.sso_eventos for delete to authenticated using (sso_puede_modulo('accidentes', 'eliminar'));

drop policy if exists sso_dot_select on public.sso_dotacion_mensual;
create policy sso_dot_select on public.sso_dotacion_mensual for select to authenticated using (sso_puede_modulo('accidentes', 'ver'));
drop policy if exists sso_dot_write on public.sso_dotacion_mensual;
create policy sso_dot_write on public.sso_dotacion_mensual for all to authenticated
  using (sso_puede_modulo('accidentes', 'aprobar')) with check (sso_puede_modulo('accidentes', 'aprobar'));

revoke all on public.sso_eventos, public.sso_eventos_v, public.sso_dotacion_mensual from anon;
revoke truncate on public.sso_eventos, public.sso_dotacion_mensual from authenticated;
revoke insert, update, delete, truncate on public.sso_eventos_v from authenticated;
revoke execute on function public.sso_evento_antes(), public.sso_evento_guardas(), public.sso_evento_notificar() from public, anon, authenticated;
revoke execute on function public.sso_evento_agregar_medida(uuid, text, uuid, date) from public, anon;
grant  execute on function public.sso_evento_agregar_medida(uuid, text, uuid, date) to authenticated;

-- ---------------------------------------------------------------- Storage: carpeta eventos/

create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp', 'inspecciones') then split_part(p_name, '/', 1)
    when split_part(p_name, '/', 1) = 'eventos' then 'accidentes'
  end
$$;

drop policy if exists sso_objects_ev_insert on storage.objects;
create policy sso_objects_ev_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'eventos' and exists (
    select 1 from public.sso_eventos e where e.id::text = (storage.foldername(name))[2]
      and (public.sso_puede_modulo('accidentes', 'editar') or public.sso_puede_modulo('accidentes', 'aprobar')
           or (e.reportado_por = (select auth.uid()) and public.sso_puede_modulo('accidentes', 'crear')))));
drop policy if exists sso_objects_ev_delete on storage.objects;
create policy sso_objects_ev_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'eventos'
         and (public.sso_puede_modulo('accidentes', 'editar') or public.sso_puede_modulo('accidentes', 'eliminar')));

notify pgrst, 'reload schema';

commit;

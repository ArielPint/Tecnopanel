-- Portal de Prevencion, fase 8 (PLAN_SSO_PORTAL.md): Comite Paritario de Higiene y Seguridad (DS 54).
--
-- Comites (uno por faena si corresponde) con su periodo de 2 años; miembros (trabajadores del
-- modulo Trabajadores) titulares y suplentes por la empresa y por los trabajadores, con presidente y
-- secretario; reuniones ordinarias (una al mes) y extraordinarias, con asistencia, acta (texto y
-- archivo firmado) y quorum (al menos un representante de cada parte); acuerdos con responsable,
-- plazo y seguimiento. El responsable de un acuerdo recibe un aviso y puede informar su avance.
--
-- Permisos (modulo 'comite'): ver, crear (registrar reuniones y acuerdos), editar (corregir todo y
-- administrar comites y miembros), eliminar, exportar.
-- Storage: bucket 'sso', carpeta comite/<reunion_id>/...
--
-- Re-ejecutable. Va despues de 20261005180000_sso_documentos.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- comites y miembros

create table if not exists public.sso_comites (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,                    -- ej. "CPHS Planta Santiago"
  faena text,
  periodo_desde date not null,
  periodo_hasta date not null,                    -- por defecto: 2 años
  activo boolean not null default true,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodo_hasta > periodo_desde)
);

create table if not exists public.sso_comite_miembros (
  id uuid primary key default gen_random_uuid(),
  comite_id uuid not null references public.sso_comites(id) on delete cascade,
  trabajador_id uuid not null references public.sso_trabajadores(id),
  representa text not null check (representa in ('empresa', 'trabajadores')),
  calidad text not null default 'titular' check (calidad in ('titular', 'suplente')),
  cargo text check (cargo in ('presidente', 'secretario')),
  desde date not null,
  hasta date,                                     -- null: sigue en el comite
  curso_orientacion date,                         -- curso de orientacion de la Mutual
  observaciones text,
  created_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
-- una sola vez por comite mientras esta vigente; un presidente y un secretario vigentes
create unique index if not exists sso_comite_miembro_vigente_uq on public.sso_comite_miembros (comite_id, trabajador_id) where hasta is null;
create unique index if not exists sso_comite_cargo_uq on public.sso_comite_miembros (comite_id, cargo) where cargo is not null and hasta is null;

create or replace function public.sso_comite_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sso_comite_antes on public.sso_comites;
create trigger sso_comite_antes before insert or update on public.sso_comites
  for each row execute function public.sso_comite_antes();

create or replace view public.sso_comite_miembros_v with (security_invoker = true) as
select m.*,
  t.nombres || ' ' || t.apellidos as nombre,
  t.rut, t.cargo as cargo_laboral, t.user_id, t.activo as trabajador_activo,
  (m.hasta is null or m.hasta >= public.sso_hoy()) as vigente
from public.sso_comite_miembros m
join public.sso_trabajadores t on t.id = m.trabajador_id;

-- ---------------------------------------------------------------- reuniones

create table if not exists public.sso_comite_reuniones (
  id uuid primary key default gen_random_uuid(),
  comite_id uuid not null references public.sso_comites(id) on delete cascade,
  numero int not null,                            -- correlativo por comite (lo pone la base)
  tipo text not null default 'ordinaria' check (tipo in ('ordinaria', 'extraordinaria')),
  estado text not null default 'realizada' check (estado in ('programada', 'realizada')),
  fecha date not null,
  hora time,
  lugar text,
  temas text,                                     -- tabla
  desarrollo text,                                -- acta: lo tratado
  acta_path text,                                 -- acta firmada (bucket 'sso', carpeta comite/)
  acta_nombre text,
  creado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comite_id, numero)
);
create index if not exists sso_comite_reuniones_fecha_idx on public.sso_comite_reuniones (comite_id, fecha desc);

create table if not exists public.sso_comite_asistencia (
  reunion_id uuid not null references public.sso_comite_reuniones(id) on delete cascade,
  miembro_id uuid not null references public.sso_comite_miembros(id) on delete cascade,
  asistio boolean not null default true,
  primary key (reunion_id, miembro_id)
);

create or replace function public.sso_comite_reunion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.estado = 'realizada' and new.fecha > sso_hoy() then
    raise exception 'Una reunión realizada no puede tener fecha futura' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sso_comite_reunion_antes on public.sso_comite_reuniones;
create trigger sso_comite_reunion_antes before insert or update on public.sso_comite_reuniones
  for each row execute function public.sso_comite_reunion_antes();

-- correlativo por comite (definer: lo calcula sobre todas las reuniones del comite)
create or replace function public.sso_comite_reunion_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.comite_id <> old.comite_id then
    perform pg_advisory_xact_lock(hashtext('sso_comite_reunion:' || new.comite_id));
    select coalesce(max(numero), 0) + 1 into new.numero from sso_comite_reuniones where comite_id = new.comite_id;
  else
    new.numero := old.numero;
  end if;
  return new;
end $$;
drop trigger if exists sso_comite_reunion_numero on public.sso_comite_reuniones;
create trigger sso_comite_reunion_numero before insert or update on public.sso_comite_reuniones
  for each row execute function public.sso_comite_reunion_numero();

-- la asistencia es de miembros del mismo comite
create or replace function public.sso_comite_asistencia_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sso_comite_reuniones r join sso_comite_miembros m on m.comite_id = r.comite_id
                 where r.id = new.reunion_id and m.id = new.miembro_id) then
    raise exception 'El miembro no pertenece al comité de la reunión' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists sso_comite_asistencia_antes on public.sso_comite_asistencia;
create trigger sso_comite_asistencia_antes before insert or update on public.sso_comite_asistencia
  for each row execute function public.sso_comite_asistencia_antes();

-- ---------------------------------------------------------------- acuerdos

create table if not exists public.sso_comite_acuerdos (
  id uuid primary key default gen_random_uuid(),
  comite_id uuid not null references public.sso_comites(id) on delete cascade,
  reunion_id uuid references public.sso_comite_reuniones(id) on delete cascade,
  descripcion text not null,
  responsable_user_id uuid references auth.users(id) on delete set null,
  responsable_nombre text,                        -- si el responsable no tiene cuenta (ej. "Gerencia")
  fecha_compromiso date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'cumplido', 'anulado')),
  fecha_cumplimiento date,
  avance text,                                    -- lo que informa el responsable
  creado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sso_comite_acuerdos_idx on public.sso_comite_acuerdos (comite_id, estado);
create index if not exists sso_comite_acuerdos_resp_idx on public.sso_comite_acuerdos (responsable_user_id, estado);

create or replace function public.sso_acuerdo_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.responsable_nombre := nullif(btrim(new.responsable_nombre), '');
  if new.estado = 'cumplido' then
    new.fecha_cumplimiento := coalesce(new.fecha_cumplimiento, sso_hoy());
    if new.fecha_cumplimiento > sso_hoy() then
      raise exception 'La fecha de cumplimiento no puede ser futura' using errcode = '22023';
    end if;
  else
    new.fecha_cumplimiento := null;
  end if;
  return new;
end $$;
drop trigger if exists sso_acuerdo_antes on public.sso_comite_acuerdos;
create trigger sso_acuerdo_antes before insert or update on public.sso_comite_acuerdos
  for each row execute function public.sso_acuerdo_antes();

-- Guardas por rol (invoker; corre antes que sso_acuerdo_antes por orden alfabetico). Quien no puede
-- editar el acuerdo completo (el responsable) solo informa avance: estado, avance y fecha.
create or replace function public.sso_acuerdo_guardas()
returns trigger language plpgsql set search_path = public as $$
declare v_libres text[] := array['estado', 'avance', 'fecha_cumplimiento', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    return new;
  end if;
  if sso_puede_modulo('comite', 'editar') or (old.creado_por = auth.uid() and sso_puede_modulo('comite', 'crear')) then
    return new;
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Como responsable solo puedes informar el avance del acuerdo' using errcode = '42501';
  end if;
  if new.estado = 'anulado' and old.estado <> 'anulado' then
    raise exception 'Solo el comité puede anular un acuerdo' using errcode = '42501';
  end if;
  if old.estado = 'anulado' then
    raise exception 'El acuerdo está anulado' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists sso_acuerdo_0_guardas on public.sso_comite_acuerdos;
create trigger sso_acuerdo_0_guardas before insert or update on public.sso_comite_acuerdos
  for each row execute function public.sso_acuerdo_guardas();

-- validaciones que necesitan funciones internas (definer): responsable con acceso al modulo y la
-- reunion del mismo comite
create or replace function public.sso_acuerdo_validar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.responsable_user_id is null and new.responsable_nombre is null then
    raise exception 'Indica el responsable del acuerdo' using errcode = '23514';
  end if;
  if new.responsable_user_id is not null
     and (tg_op = 'INSERT' or new.responsable_user_id is distinct from old.responsable_user_id)
     and not sso_usuario_puede_modulo('comite', 'ver', new.responsable_user_id) then
    raise exception 'El responsable no tiene acceso al Comité Paritario' using errcode = '23514';
  end if;
  if new.reunion_id is not null and not exists (select 1 from sso_comite_reuniones r where r.id = new.reunion_id and r.comite_id = new.comite_id) then
    raise exception 'La reunión es de otro comité' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists sso_acuerdo_validar on public.sso_comite_acuerdos;
create trigger sso_acuerdo_validar before insert or update on public.sso_comite_acuerdos
  for each row execute function public.sso_acuerdo_validar();

-- aviso al responsable (con cuenta) cuando se le asigna
alter table public.sso_notificaciones add column if not exists acuerdo_id uuid references public.sso_comite_acuerdos(id) on delete cascade;

create or replace function public.sso_acuerdo_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.responsable_user_id is not null and new.responsable_user_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.responsable_user_id is distinct from old.responsable_user_id) then
    insert into sso_notificaciones (user_id, acuerdo_id, tipo, titulo, mensaje)
    values (new.responsable_user_id, new.id, 'acuerdo_asignado',
            'Comité Paritario: se te asignó un acuerdo' || coalesce(' (plazo ' || to_char(new.fecha_compromiso, 'DD-MM-YYYY') || ')', ''),
            left(new.descripcion, 160));
  end if;
  return new;
end $$;
drop trigger if exists sso_acuerdo_notificar on public.sso_comite_acuerdos;
create trigger sso_acuerdo_notificar after insert or update of responsable_user_id on public.sso_comite_acuerdos
  for each row execute function public.sso_acuerdo_notificar();

-- ---------------------------------------------------------------- vistas

create or replace view public.sso_comite_acuerdos_v with (security_invoker = true) as
select a.*,
  r.numero as reunion_numero, r.fecha as reunion_fecha,
  (a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < public.sso_hoy()) as vencido,
  case when a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < public.sso_hoy()
       then public.sso_hoy() - a.fecha_compromiso else 0 end as dias_atraso
from public.sso_comite_acuerdos a
left join public.sso_comite_reuniones r on r.id = a.reunion_id;

-- quorum (DS 54): al menos un representante de la empresa y uno de los trabajadores presentes
create or replace view public.sso_comite_reuniones_v with (security_invoker = true) as
select r.*,
  coalesce(s.presentes, 0) as presentes,
  coalesce(s.empresa, 0) as presentes_empresa,
  coalesce(s.trabajadores, 0) as presentes_trabajadores,
  (coalesce(s.empresa, 0) > 0 and coalesce(s.trabajadores, 0) > 0) as quorum,
  (select count(*) from public.sso_comite_acuerdos a where a.reunion_id = r.id) as acuerdos,
  (select count(*) from public.sso_comite_acuerdos a where a.reunion_id = r.id and a.estado in ('pendiente', 'en_proceso')) as acuerdos_pendientes
from public.sso_comite_reuniones r
left join lateral (
  select count(*) as presentes,
         count(*) filter (where m.representa = 'empresa') as empresa,
         count(*) filter (where m.representa = 'trabajadores') as trabajadores
  from public.sso_comite_asistencia x join public.sso_comite_miembros m on m.id = x.miembro_id
  where x.reunion_id = r.id and x.asistio
) s on true;

-- resumen por comite: integrantes vigentes, ultima reunion ordinaria, acuerdos abiertos
create or replace view public.sso_comites_v with (security_invoker = true) as
select c.*,
  (c.periodo_hasta < public.sso_hoy()) as periodo_vencido,
  (select count(*) from public.sso_comite_miembros m where m.comite_id = c.id and (m.hasta is null or m.hasta >= public.sso_hoy())
     and m.calidad = 'titular' and m.representa = 'empresa') as titulares_empresa,
  (select count(*) from public.sso_comite_miembros m where m.comite_id = c.id and (m.hasta is null or m.hasta >= public.sso_hoy())
     and m.calidad = 'titular' and m.representa = 'trabajadores') as titulares_trabajadores,
  (select max(r.fecha) from public.sso_comite_reuniones r where r.comite_id = c.id and r.tipo = 'ordinaria' and r.estado = 'realizada') as ultima_ordinaria,
  (select min(r.fecha) from public.sso_comite_reuniones r where r.comite_id = c.id and r.estado = 'programada' and r.fecha >= public.sso_hoy()) as proxima_reunion,
  (select count(*) from public.sso_comite_acuerdos a where a.comite_id = c.id and a.estado in ('pendiente', 'en_proceso')) as acuerdos_pendientes,
  (select count(*) from public.sso_comite_acuerdos a where a.comite_id = c.id and a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < public.sso_hoy()) as acuerdos_vencidos
from public.sso_comites c;

-- personas que pueden ser responsables de un acuerdo (las que ven el modulo)
create or replace function public.sso_usuarios_modulo(p_modulo text)
returns table (id uuid, nombre text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), p.email
  from profiles p
  where sso_tiene_acceso() and coalesce(p.activo, true) and not coalesce(p.is_root, false)
    and sso_usuario_puede_modulo(p_modulo, 'ver', p.id)
  order by 2
$$;

-- ---------------------------------------------------------------- RLS

alter table public.sso_comites          enable row level security;
alter table public.sso_comite_miembros  enable row level security;
alter table public.sso_comite_reuniones enable row level security;
alter table public.sso_comite_asistencia enable row level security;
alter table public.sso_comite_acuerdos  enable row level security;

drop policy if exists sso_com_select on public.sso_comites;
create policy sso_com_select on public.sso_comites for select to authenticated using (sso_puede_modulo('comite', 'ver'));
drop policy if exists sso_com_write on public.sso_comites;
create policy sso_com_write on public.sso_comites for all to authenticated
  using (sso_puede_modulo('comite', 'editar')) with check (sso_puede_modulo('comite', 'editar'));

drop policy if exists sso_comm_select on public.sso_comite_miembros;
create policy sso_comm_select on public.sso_comite_miembros for select to authenticated using (sso_puede_modulo('comite', 'ver'));
drop policy if exists sso_comm_write on public.sso_comite_miembros;
create policy sso_comm_write on public.sso_comite_miembros for all to authenticated
  using (sso_puede_modulo('comite', 'editar')) with check (sso_puede_modulo('comite', 'editar'));

drop policy if exists sso_comr_select on public.sso_comite_reuniones;
create policy sso_comr_select on public.sso_comite_reuniones for select to authenticated using (sso_puede_modulo('comite', 'ver'));
drop policy if exists sso_comr_insert on public.sso_comite_reuniones;
create policy sso_comr_insert on public.sso_comite_reuniones for insert to authenticated with check (sso_puede_modulo('comite', 'crear'));
drop policy if exists sso_comr_update on public.sso_comite_reuniones;
create policy sso_comr_update on public.sso_comite_reuniones for update to authenticated
  using (sso_puede_modulo('comite', 'editar') or (creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear')))
  with check (sso_puede_modulo('comite', 'editar') or (creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear')));
drop policy if exists sso_comr_delete on public.sso_comite_reuniones;
create policy sso_comr_delete on public.sso_comite_reuniones for delete to authenticated using (sso_puede_modulo('comite', 'eliminar'));

drop policy if exists sso_coma_select on public.sso_comite_asistencia;
create policy sso_coma_select on public.sso_comite_asistencia for select to authenticated using (sso_puede_modulo('comite', 'ver'));
drop policy if exists sso_coma_write on public.sso_comite_asistencia;
create policy sso_coma_write on public.sso_comite_asistencia for all to authenticated
  using (sso_puede_modulo('comite', 'editar') or exists (
    select 1 from public.sso_comite_reuniones r where r.id = reunion_id and r.creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear')))
  with check (sso_puede_modulo('comite', 'editar') or exists (
    select 1 from public.sso_comite_reuniones r where r.id = reunion_id and r.creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear')));

drop policy if exists sso_comac_select on public.sso_comite_acuerdos;
create policy sso_comac_select on public.sso_comite_acuerdos for select to authenticated using (sso_puede_modulo('comite', 'ver'));
drop policy if exists sso_comac_insert on public.sso_comite_acuerdos;
create policy sso_comac_insert on public.sso_comite_acuerdos for insert to authenticated with check (sso_puede_modulo('comite', 'crear'));
-- editar: el modulo, quien lo registro (con crear) o el responsable (solo avance: lo limita la guarda)
drop policy if exists sso_comac_update on public.sso_comite_acuerdos;
create policy sso_comac_update on public.sso_comite_acuerdos for update to authenticated
  using (sso_puede_modulo('comite', 'editar')
         or (creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear'))
         or (responsable_user_id = (select auth.uid()) and sso_puede_modulo('comite', 'ver')))
  with check (sso_puede_modulo('comite', 'editar')
         or (creado_por = (select auth.uid()) and sso_puede_modulo('comite', 'crear'))
         or (responsable_user_id = (select auth.uid()) and sso_puede_modulo('comite', 'ver')));
drop policy if exists sso_comac_delete on public.sso_comite_acuerdos;
create policy sso_comac_delete on public.sso_comite_acuerdos for delete to authenticated using (sso_puede_modulo('comite', 'eliminar'));

revoke all on public.sso_comites, public.sso_comite_miembros, public.sso_comite_reuniones, public.sso_comite_asistencia,
  public.sso_comite_acuerdos, public.sso_comites_v, public.sso_comite_miembros_v, public.sso_comite_reuniones_v,
  public.sso_comite_acuerdos_v from anon;
revoke truncate on public.sso_comites, public.sso_comite_miembros, public.sso_comite_reuniones, public.sso_comite_asistencia,
  public.sso_comite_acuerdos from authenticated;
revoke insert, update, delete, truncate on public.sso_comites_v, public.sso_comite_miembros_v, public.sso_comite_reuniones_v,
  public.sso_comite_acuerdos_v from authenticated;
revoke execute on function public.sso_comite_antes(), public.sso_comite_reunion_antes(), public.sso_comite_reunion_numero(),
  public.sso_comite_asistencia_antes(), public.sso_acuerdo_antes(), public.sso_acuerdo_guardas(), public.sso_acuerdo_validar(),
  public.sso_acuerdo_notificar() from public, anon, authenticated;
revoke execute on function public.sso_usuarios_modulo(text) from public, anon;
grant  execute on function public.sso_usuarios_modulo(text) to authenticated;

-- ---------------------------------------------------------------- Storage: carpeta comite/

create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp', 'inspecciones', 'documentos', 'comite') then split_part(p_name, '/', 1)
    when split_part(p_name, '/', 1) = 'eventos' then 'accidentes'
  end
$$;

drop policy if exists sso_objects_com_insert on storage.objects;
create policy sso_objects_com_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'comite' and exists (
    select 1 from public.sso_comite_reuniones r where r.id::text = (storage.foldername(name))[2]
      and (public.sso_puede_modulo('comite', 'editar')
           or (r.creado_por = (select auth.uid()) and public.sso_puede_modulo('comite', 'crear')))));
drop policy if exists sso_objects_com_delete on storage.objects;
create policy sso_objects_com_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'comite'
         and (public.sso_puede_modulo('comite', 'editar') or public.sso_puede_modulo('comite', 'eliminar')
              or exists (select 1 from public.sso_comite_reuniones r where r.id::text = (storage.foldername(name))[2]
                           and r.creado_por = (select auth.uid()) and public.sso_puede_modulo('comite', 'crear'))));

notify pgrst, 'reload schema';

commit;

-- Portal de Prevencion, fase 5 (PLAN_SSO_PORTAL.md): Inspecciones programadas.
--
-- Plantillas de checklist (items, periodicidad, plazo para corregir) asignadas a areas. Cada
-- inspeccion responde los items (cumple / no cumple / no aplica, observacion, foto). Cada item que
-- no cumple genera un hallazgo con sso_inspeccion_generar_hallazgos(): responsable = encargado del
-- area o, si no hay, un supervisor de Prevencion. El hallazgo guarda su origen (origen_inspeccion_id).
-- sso_programa_inspecciones dice, por plantilla y area, cuando toca la proxima y si esta atrasada.
--
-- Permisos (modulo 'inspecciones'): ver, crear (realizar inspecciones y editar las propias),
-- editar (cualquiera), aprobar (gestionar plantillas y su programa), eliminar, exportar.
-- Storage: bucket 'sso', carpeta inspecciones/<inspeccion_id>/...
--
-- Re-ejecutable. Va despues de 20261005150000_sso_epp.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- plantillas

create table if not exists public.sso_checklists (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  periodicidad_dias int check (periodicidad_dias is null or periodicidad_dias > 0),   -- null: a demanda
  plazo_hallazgo_dias int not null default 7 check (plazo_hallazgo_dias between 1 and 365),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sso_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.sso_checklists(id) on delete cascade,
  orden int not null default 0,
  texto text not null,
  activo boolean not null default true
);
create index if not exists sso_checklist_items_idx on public.sso_checklist_items (checklist_id, orden);

-- en que areas se aplica (sin filas: plantilla general, una sola programacion)
create table if not exists public.sso_checklist_areas (
  checklist_id uuid not null references public.sso_checklists(id) on delete cascade,
  area_id uuid not null references public.sso_areas(id) on delete cascade,
  primary key (checklist_id, area_id)
);

-- ---------------------------------------------------------------- inspecciones

create table if not exists public.sso_inspecciones (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.sso_checklists(id),
  area_id uuid references public.sso_areas(id) on delete set null,
  fecha date not null,
  ubicacion text,
  observaciones text,
  inspector uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sso_inspecciones_idx on public.sso_inspecciones (checklist_id, area_id, fecha desc);

create table if not exists public.sso_inspeccion_respuestas (
  inspeccion_id uuid not null references public.sso_inspecciones(id) on delete cascade,
  item_id uuid not null references public.sso_checklist_items(id),
  texto text not null,                            -- copia del item: la plantilla puede cambiar despues
  resultado text not null check (resultado in ('cumple', 'no_cumple', 'na')),
  observacion text,
  foto_path text,                                 -- bucket 'sso', carpeta inspecciones/
  hallazgo_id uuid references public.sso_hallazgos(id) on delete set null,
  primary key (inspeccion_id, item_id)
);

-- el hallazgo recuerda de que inspeccion salio
alter table public.sso_hallazgos add column if not exists origen_inspeccion_id uuid references public.sso_inspecciones(id) on delete set null;

-- sso_hallazgos_v usa h.*: se recrea para que incluya la columna nueva (misma definicion que la fase 1)
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

create or replace function public.sso_inspeccion_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.fecha > sso_hoy() then
    raise exception 'La fecha de la inspección no puede ser futura' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sso_inspeccion_antes on public.sso_inspecciones;
create trigger sso_inspeccion_antes before insert or update on public.sso_inspecciones
  for each row execute function public.sso_inspeccion_antes();

create or replace view public.sso_inspecciones_v with (security_invoker = true) as
select i.*,
  c.nombre as checklist,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'cumple') as cumple,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'no_cumple') as no_cumple,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'na') as no_aplica,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.hallazgo_id is not null) as hallazgos
from public.sso_inspecciones i
join public.sso_checklists c on c.id = i.checklist_id;

-- Programa: por plantilla periodica y area asignada (o general), ultima inspeccion y proxima.
create or replace view public.sso_programa_inspecciones with (security_invoker = true) as
with destinos as (
  select c.id as checklist_id, ca.area_id
  from public.sso_checklists c join public.sso_checklist_areas ca on ca.checklist_id = c.id
  where c.activo and c.periodicidad_dias is not null
  union all
  select c.id, null::uuid
  from public.sso_checklists c
  where c.activo and c.periodicidad_dias is not null
    and not exists (select 1 from public.sso_checklist_areas ca where ca.checklist_id = c.id)
)
select d.checklist_id, d.area_id, c.nombre as checklist, c.periodicidad_dias,
  u.fecha as ultima, u.id as ultima_id,
  coalesce(u.fecha + c.periodicidad_dias, public.sso_hoy()) as proxima,
  case
    when u.fecha is null then 'nunca'
    when u.fecha + c.periodicidad_dias < public.sso_hoy() then 'atrasada'
    when u.fecha + c.periodicidad_dias <= public.sso_hoy() + 7 then 'proxima'
    else 'al_dia'
  end as situacion,
  case when u.fecha is not null then greatest(public.sso_hoy() - (u.fecha + c.periodicidad_dias), 0) end as dias_atraso
from destinos d
join public.sso_checklists c on c.id = d.checklist_id
left join lateral (
  select i.id, i.fecha from public.sso_inspecciones i
  where i.checklist_id = d.checklist_id and i.area_id is not distinct from d.area_id
  order by i.fecha desc, i.created_at desc limit 1
) u on true;

-- ---------------------------------------------------------------- hallazgos desde la inspeccion

create or replace function public.sso_inspeccion_puede_editar(p_inspector uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_puede_modulo('inspecciones', 'editar') or (p_inspector = auth.uid() and sso_puede_modulo('inspecciones', 'crear'))
$$;

-- Crea un hallazgo por cada item "no cumple" que todavia no tenga. Devuelve cuantos creo.
-- Security definer: el inspector puede no tener el modulo Hallazgos; igual queda como quien reporto.
create or replace function public.sso_inspeccion_generar_hallazgos(p_inspeccion_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  ins record;
  r record;
  v_resp uuid;
  v_id uuid;
  v_n int := 0;
begin
  select i.*, c.nombre as checklist, c.plazo_hallazgo_dias, a.nombre as area_nombre, a.encargado_user_id
    into ins
  from sso_inspecciones i
  join sso_checklists c on c.id = i.checklist_id
  left join sso_areas a on a.id = i.area_id
  where i.id = p_inspeccion_id;
  if not found then
    raise exception 'Inspección no encontrada' using errcode = 'P0002';
  end if;
  if not sso_inspeccion_puede_editar(ins.inspector) then
    raise exception 'Sin permiso sobre esta inspección' using errcode = '42501';
  end if;

  -- responsable: el encargado del area si tiene acceso a Hallazgos; si no, un supervisor de Prevencion
  v_resp := case when ins.encargado_user_id is not null and sso_usuario_puede('ver', ins.encargado_user_id)
                 then ins.encargado_user_id end;
  if v_resp is null then
    select s into v_resp from sso_supervisores() s limit 1;
  end if;
  if v_resp is null then
    raise exception 'No hay a quién asignar los hallazgos: el área no tiene encargado y nadie valida hallazgos' using errcode = 'P0001';
  end if;

  for r in
    select * from sso_inspeccion_respuestas
    where inspeccion_id = p_inspeccion_id and resultado = 'no_cumple' and hallazgo_id is null
  loop
    insert into sso_hallazgos (area_id, ubicacion, descripcion, fecha_deteccion, reportado_por, responsable_user_id,
                               fecha_compromiso, origen_inspeccion_id)
    values (ins.area_id,
            coalesce(nullif(btrim(ins.ubicacion), ''), ins.area_nombre, 'Sin ubicación'),
            'Inspección "' || ins.checklist || '": ' || r.texto || coalesce('. ' || nullif(btrim(r.observacion), ''), ''),
            ins.fecha, coalesce(ins.inspector, auth.uid()), v_resp,
            greatest(sso_hoy(), ins.fecha) + ins.plazo_hallazgo_dias, p_inspeccion_id)
    returning id into v_id;
    update sso_inspeccion_respuestas set hallazgo_id = v_id where inspeccion_id = p_inspeccion_id and item_id = r.item_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.sso_checklists            enable row level security;
alter table public.sso_checklist_items       enable row level security;
alter table public.sso_checklist_areas       enable row level security;
alter table public.sso_inspecciones          enable row level security;
alter table public.sso_inspeccion_respuestas enable row level security;

-- plantillas: las ve el modulo, las gestiona 'aprobar'
drop policy if exists sso_chk_select on public.sso_checklists;
create policy sso_chk_select on public.sso_checklists for select to authenticated using (sso_puede_modulo('inspecciones', 'ver'));
drop policy if exists sso_chk_write on public.sso_checklists;
create policy sso_chk_write on public.sso_checklists for all to authenticated
  using (sso_puede_modulo('inspecciones', 'aprobar')) with check (sso_puede_modulo('inspecciones', 'aprobar'));
drop policy if exists sso_chk_items_select on public.sso_checklist_items;
create policy sso_chk_items_select on public.sso_checklist_items for select to authenticated using (sso_puede_modulo('inspecciones', 'ver'));
drop policy if exists sso_chk_items_write on public.sso_checklist_items;
create policy sso_chk_items_write on public.sso_checklist_items for all to authenticated
  using (sso_puede_modulo('inspecciones', 'aprobar')) with check (sso_puede_modulo('inspecciones', 'aprobar'));
drop policy if exists sso_chk_areas_select on public.sso_checklist_areas;
create policy sso_chk_areas_select on public.sso_checklist_areas for select to authenticated using (sso_puede_modulo('inspecciones', 'ver'));
drop policy if exists sso_chk_areas_write on public.sso_checklist_areas;
create policy sso_chk_areas_write on public.sso_checklist_areas for all to authenticated
  using (sso_puede_modulo('inspecciones', 'aprobar')) with check (sso_puede_modulo('inspecciones', 'aprobar'));

drop policy if exists sso_insp_select on public.sso_inspecciones;
create policy sso_insp_select on public.sso_inspecciones for select to authenticated using (sso_puede_modulo('inspecciones', 'ver'));
drop policy if exists sso_insp_insert on public.sso_inspecciones;
create policy sso_insp_insert on public.sso_inspecciones for insert to authenticated with check (sso_puede_modulo('inspecciones', 'crear'));
drop policy if exists sso_insp_update on public.sso_inspecciones;
create policy sso_insp_update on public.sso_inspecciones for update to authenticated
  using (sso_inspeccion_puede_editar(inspector)) with check (sso_inspeccion_puede_editar(inspector));
drop policy if exists sso_insp_delete on public.sso_inspecciones;
create policy sso_insp_delete on public.sso_inspecciones for delete to authenticated using (sso_puede_modulo('inspecciones', 'eliminar'));

drop policy if exists sso_insp_resp_select on public.sso_inspeccion_respuestas;
create policy sso_insp_resp_select on public.sso_inspeccion_respuestas for select to authenticated using (sso_puede_modulo('inspecciones', 'ver'));
drop policy if exists sso_insp_resp_write on public.sso_inspeccion_respuestas;
create policy sso_insp_resp_write on public.sso_inspeccion_respuestas for all to authenticated
  using (exists (select 1 from public.sso_inspecciones i where i.id = inspeccion_id and sso_inspeccion_puede_editar(i.inspector)))
  with check (exists (select 1 from public.sso_inspecciones i where i.id = inspeccion_id and sso_inspeccion_puede_editar(i.inspector)));

revoke all on public.sso_checklists, public.sso_checklist_items, public.sso_checklist_areas, public.sso_inspecciones,
              public.sso_inspeccion_respuestas, public.sso_inspecciones_v, public.sso_programa_inspecciones from anon;
revoke truncate on public.sso_checklists, public.sso_checklist_items, public.sso_checklist_areas, public.sso_inspecciones,
                   public.sso_inspeccion_respuestas from authenticated;
revoke insert, update, delete, truncate on public.sso_inspecciones_v, public.sso_programa_inspecciones from authenticated;
revoke execute on function public.sso_inspeccion_antes() from public, anon, authenticated;
revoke execute on function public.sso_inspeccion_puede_editar(uuid), public.sso_inspeccion_generar_hallazgos(uuid) from public, anon;
grant  execute on function public.sso_inspeccion_puede_editar(uuid), public.sso_inspeccion_generar_hallazgos(uuid) to authenticated;

-- ---------------------------------------------------------------- Storage: carpeta inspecciones/

create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp', 'inspecciones') then split_part(p_name, '/', 1)
  end
$$;

drop policy if exists sso_objects_insp_insert on storage.objects;
create policy sso_objects_insp_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'inspecciones' and exists (
    select 1 from public.sso_inspecciones i
    where i.id::text = (storage.foldername(name))[2] and public.sso_inspeccion_puede_editar(i.inspector)));
drop policy if exists sso_objects_insp_delete on storage.objects;
create policy sso_objects_insp_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'inspecciones' and (
    public.sso_puede_modulo('inspecciones', 'eliminar') or exists (
      select 1 from public.sso_inspecciones i
      where i.id::text = (storage.foldername(name))[2] and public.sso_inspeccion_puede_editar(i.inspector))));

-- ---------------------------------------------------------------- plantillas de partida
-- Referenciales: se ajustan o reemplazan en la pestana Plantillas. Sin areas asignadas (generales).
do $$
declare v uuid;
begin
  if not exists (select 1 from sso_checklists) then
    insert into sso_checklists (nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias)
    values ('Extintores', 'Revisión mensual de extintores (NCh 1430).', 30, 5) returning id into v;
    insert into sso_checklist_items (checklist_id, orden, texto) values
      (v, 1, 'Extintor en su lugar, señalizado y con acceso despejado'),
      (v, 2, 'Manómetro en zona verde (presión correcta)'),
      (v, 3, 'Sello y pasador de seguridad intactos'),
      (v, 4, 'Etiqueta de mantención vigente'),
      (v, 5, 'Manguera y boquilla sin daños'),
      (v, 6, 'Altura de montaje correcta (máx. 1,30 m)');

    insert into sso_checklists (nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias)
    values ('Andamios', 'Revisión antes del uso y semanal (tarjeta verde/roja).', 7, 2) returning id into v;
    insert into sso_checklist_items (checklist_id, orden, texto) values
      (v, 1, 'Base nivelada sobre placas de apoyo'),
      (v, 2, 'Barandas superior e intermedia y rodapié completos'),
      (v, 3, 'Plataformas completas y trabadas'),
      (v, 4, 'Arriostramiento y anclaje a la estructura'),
      (v, 5, 'Acceso seguro (escalera interior)'),
      (v, 6, 'Tarjeta de inspección visible y vigente');

    insert into sso_checklists (nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias)
    values ('Herramientas eléctricas', 'Estado de herramientas eléctricas portátiles.', 30, 3) returning id into v;
    insert into sso_checklist_items (checklist_id, orden, texto) values
      (v, 1, 'Cables y enchufes sin daños ni uniones'),
      (v, 2, 'Protecciones y guardas instaladas'),
      (v, 3, 'Interruptor funciona correctamente'),
      (v, 4, 'Conectada a tablero con protector diferencial');

    insert into sso_checklists (nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias)
    values ('Botiquín', 'Contenido y vencimientos del botiquín de primeros auxilios.', 30, 5) returning id into v;
    insert into sso_checklist_items (checklist_id, orden, texto) values
      (v, 1, 'Botiquín señalizado y accesible'),
      (v, 2, 'Insumos completos según listado'),
      (v, 3, 'Sin productos vencidos');

    insert into sso_checklists (nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias)
    values ('Orden y aseo', 'Recorrido de orden y aseo del área (5S).', 14, 3) returning id into v;
    insert into sso_checklist_items (checklist_id, orden, texto) values
      (v, 1, 'Pasillos y vías de evacuación despejados'),
      (v, 2, 'Materiales apilados en forma estable'),
      (v, 3, 'Residuos en contenedores rotulados'),
      (v, 4, 'Sin derrames de aceite ni líquidos en el piso');
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

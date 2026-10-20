-- Prevencion: separacion por sucursal (Santiago / Puerto Varas) en todo el portal.
--
-- Quien ve que: igual que Produccion e Ingreso de Personal (has_sucursal()). Un usuario con
-- profiles.sucursal asignada solo ve y registra en su sucursal; sin sucursal, o con
-- ve_todas_sucursales() (admin, gerencia), ve y registra en las dos.
--
-- Tienen sucursal propia:
--   sso_areas            cada area es de una sucursal (se cambia en Configuracion > Areas)
--   sso_trabajadores     la de su area; sin area, la que se elija en la ficha
--   sso_hallazgos        la de su area; sin area, la del evento o inspeccion de origen
--   sso_eventos          la de su area; sin area, la del afectado
--   sso_capacitaciones, sso_inspecciones   la de su area; sin area, la que se elija
--   sso_documentos       la de su area; sin area, la que se elija o null = de las dos sucursales
--   sso_comites          un comite paritario por sucursal
--   sso_dotacion_mensual dotacion y horas-hombre por mes, empresa y sucursal (tasas por sucursal)
-- Con area, la sucursal SIEMPRE es la del area (sso_fijar_sucursal); cambiar la sucursal de un area
-- mueve con ella sus trabajadores, hallazgos, eventos, capacitaciones, inspecciones y documentos.
-- Heredan la de su padre (RLS restrictiva): examenes y entregas de EPP (trabajador), asistentes,
-- evidencias y bitacora, respuestas, versiones, miembros, reuniones, asistencia y acuerdos.
-- Un hallazgo lo siguen viendo su responsable y quien lo reporto aunque sea de la otra sucursal.
-- Los catalogos (empresas, EPP, tipos de examen y de capacitacion, plantillas) siguen siendo comunes.
--
-- Lo ya registrado: cada area queda en la sucursal de la ficha de su encargado (Santiago si no
-- tiene; La Chacra en Puerto Varas) y los registros heredan la de su area; lo que no tiene area
-- queda en Santiago.
--
-- Avisos: los resumenes diarios salen por sucursal, solo a quien la ve (sso_alertas_vencimientos);
-- los de hallazgos y accidentes graves tambien (sso_notificar, sso_evento_notificar).
-- sso_pendientes_en(p_sucursal): "Requiere atencion" del Dashboard en la sucursal elegida.
--
-- Va DESPUES de todas las *_sso_*.sql (06-sso.ps1 las corre en orden en cada despliegue: las
-- vistas que esta redefine se recrean con drop + create en las anteriores). Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- columnas

alter table public.sso_areas            add column if not exists sucursal text;
alter table public.sso_trabajadores     add column if not exists sucursal text;
alter table public.sso_hallazgos        add column if not exists sucursal text;
alter table public.sso_eventos          add column if not exists sucursal text;
alter table public.sso_capacitaciones   add column if not exists sucursal text;
alter table public.sso_inspecciones     add column if not exists sucursal text;
alter table public.sso_documentos       add column if not exists sucursal text;
alter table public.sso_comites          add column if not exists sucursal text;
alter table public.sso_dotacion_mensual add column if not exists sucursal text;

-- ---------------------------------------------------------------- lo ya registrado

-- La Chacra (Planta Sur) es de Puerto Varas; el resto se ajusta despues en Configuracion > Areas
update public.sso_areas a
set sucursal = case when a.nombre ilike '%chacra%' then 'Puerto Varas'
                    else coalesce((select p.sucursal from public.profiles p
                                   where p.id = a.encargado_user_id and p.sucursal in ('Santiago', 'Puerto Varas')), 'Santiago') end
where a.sucursal is null;

update public.sso_trabajadores t
set sucursal = coalesce((select a.sucursal from public.sso_areas a where a.id = t.area_id), 'Santiago')
where t.sucursal is null;

update public.sso_eventos e
set sucursal = coalesce((select a.sucursal from public.sso_areas a where a.id = e.area_id),
                        (select t.sucursal from public.sso_trabajadores t where t.id = e.trabajador_id), 'Santiago')
where e.sucursal is null;

update public.sso_inspecciones i
set sucursal = coalesce((select a.sucursal from public.sso_areas a where a.id = i.area_id), 'Santiago')
where i.sucursal is null;

update public.sso_hallazgos h
set sucursal = coalesce((select a.sucursal from public.sso_areas a where a.id = h.area_id),
                        (select e.sucursal from public.sso_eventos e where e.id = h.origen_evento_id),
                        (select i.sucursal from public.sso_inspecciones i where i.id = h.origen_inspeccion_id), 'Santiago')
where h.sucursal is null;

-- sin area: la de la mayoria de los citados
update public.sso_capacitaciones c
set sucursal = coalesce((select a.sucursal from public.sso_areas a where a.id = c.area_id),
                        (select t.sucursal from public.sso_capacitacion_asistentes x join public.sso_trabajadores t on t.id = x.trabajador_id
                         where x.capacitacion_id = c.id group by t.sucursal order by count(*) desc, t.sucursal limit 1), 'Santiago')
where c.sucursal is null;

-- sin area: de las dos sucursales (null)
update public.sso_documentos d
set sucursal = (select a.sucursal from public.sso_areas a where a.id = d.area_id)
where d.sucursal is null and d.area_id is not null;

update public.sso_comites c
set sucursal = case when coalesce(c.faena, '') || ' ' || c.nombre ilike '%varas%' then 'Puerto Varas' else 'Santiago' end
where c.sucursal is null;

update public.sso_dotacion_mensual set sucursal = 'Santiago' where sucursal is null;

-- ---------------------------------------------------------------- restricciones

-- las areas de la siembra (06-sso.ps1) no traen sucursal
alter table public.sso_areas alter column sucursal set default 'Santiago';

alter table public.sso_areas            alter column sucursal set not null;
alter table public.sso_trabajadores     alter column sucursal set not null;
alter table public.sso_hallazgos        alter column sucursal set not null;
alter table public.sso_eventos          alter column sucursal set not null;
alter table public.sso_capacitaciones   alter column sucursal set not null;
alter table public.sso_inspecciones     alter column sucursal set not null;
alter table public.sso_comites          alter column sucursal set not null;
alter table public.sso_dotacion_mensual alter column sucursal set not null;

do $$
declare t text;
begin
  foreach t in array array['sso_areas', 'sso_trabajadores', 'sso_hallazgos', 'sso_eventos', 'sso_capacitaciones',
                           'sso_inspecciones', 'sso_documentos', 'sso_comites', 'sso_dotacion_mensual'] loop
    begin
      execute format('alter table public.%I add constraint %I check (sucursal in (''Santiago'', ''Puerto Varas''))', t, t || '_sucursal_check');
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

create index if not exists sso_trabajadores_sucursal_idx on public.sso_trabajadores (sucursal);
create index if not exists sso_hallazgos_sucursal_idx on public.sso_hallazgos (sucursal);
create index if not exists sso_eventos_sucursal_idx on public.sso_eventos (sucursal, ocurrido_en desc);

-- dotacion: una fila por mes, empresa y sucursal
do $$
begin
  if (select array_length(conkey, 1) from pg_constraint
      where conrelid = 'public.sso_dotacion_mensual'::regclass and contype = 'p') = 2 then
    alter table public.sso_dotacion_mensual drop constraint sso_dotacion_mensual_pkey;
    alter table public.sso_dotacion_mensual add constraint sso_dotacion_mensual_pkey primary key (mes, empresa_id, sucursal);
  end if;
end $$;

-- ---------------------------------------------------------------- quien ve que sucursal

-- Del usuario actual. null = de las dos sucursales (documentos comunes).
create or replace function public.sso_en_sucursal(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_sucursal is null or has_sucursal(p_sucursal)
$$;

-- Mismo criterio que has_sucursal(), para cualquier usuario (destinatarios de los avisos)
create or replace function public.sso_usuario_en_sucursal(p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_sucursal is null or exists (
    select 1 from profiles p
    where p.id = p_user_id
      and (p.sucursal is null or p.sucursal = p_sucursal
           or coalesce(p.is_super_admin, false) or coalesce(p.is_root, false)
           or p.rol in ('admin', 'gerente_general', 'gerente_ventas'))
  )
$$;

create or replace function public.sso_sucursal_area(p_area_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select sucursal from sso_areas where id = p_area_id
$$;

create or replace function public.sso_sucursal_trabajador(p_trabajador_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select sucursal from sso_trabajadores where id = p_trabajador_id
$$;

create or replace function public.sso_sucursal_comite(p_comite_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select sucursal from sso_comites where id = p_comite_id
$$;

-- Hijos: se ven si se ve la sucursal del padre (definer: no depende de los permisos del modulo padre)
create or replace function public.sso_ve_trabajador(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_sucursal(sso_sucursal_trabajador(p_id))
$$;

create or replace function public.sso_ve_hallazgo(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sso_hallazgos h where h.id = p_id
                 and (has_sucursal(h.sucursal) or h.responsable_user_id = auth.uid() or h.reportado_por = auth.uid()))
$$;

create or replace function public.sso_ve_capacitacion(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_sucursal((select sucursal from sso_capacitaciones where id = p_id))
$$;

create or replace function public.sso_ve_entrega(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_ve_trabajador((select trabajador_id from sso_epp_entregas where id = p_id))
$$;

create or replace function public.sso_ve_inspeccion(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_sucursal((select sucursal from sso_inspecciones where id = p_id))
$$;

create or replace function public.sso_ve_documento(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_sucursal((select sucursal from sso_documentos where id = p_id))
$$;

create or replace function public.sso_ve_comite(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_en_sucursal(sso_sucursal_comite(p_id))
$$;

create or replace function public.sso_ve_reunion(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_ve_comite((select comite_id from sso_comite_reuniones where id = p_id))
$$;

-- ---------------------------------------------------------------- la sucursal sale del area

create or replace function public.sso_fijar_sucursal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if new.area_id is not null then
    v := sso_sucursal_area(new.area_id);
  end if;
  if v is null and new.sucursal is null then
    if tg_table_name = 'sso_hallazgos' then
      v := coalesce((select sucursal from sso_eventos where id = new.origen_evento_id),
                    (select sucursal from sso_inspecciones where id = new.origen_inspeccion_id));
    elsif tg_table_name = 'sso_eventos' then
      v := sso_sucursal_trabajador(new.trabajador_id);
    end if;
  end if;
  new.sucursal := coalesce(v, new.sucursal);
  if new.sucursal is null and tg_table_name <> 'sso_documentos' then
    raise exception 'Indica la sucursal (o un área)' using errcode = '23502';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['sso_trabajadores', 'sso_hallazgos', 'sso_eventos', 'sso_capacitaciones', 'sso_inspecciones', 'sso_documentos'] loop
    execute format('drop trigger if exists sso_00_sucursal on public.%I', t);
    execute format('create trigger sso_00_sucursal before insert or update on public.%I for each row execute function public.sso_fijar_sucursal()', t);
  end loop;
end $$;

-- Cambiar la sucursal de un area mueve lo suyo (definer: no lo frena la RLS de cada modulo)
create or replace function public.sso_area_mover_sucursal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update sso_trabajadores   set sucursal = new.sucursal where area_id = new.id and sucursal <> new.sucursal;
  update sso_hallazgos      set sucursal = new.sucursal where area_id = new.id and sucursal <> new.sucursal;
  update sso_eventos        set sucursal = new.sucursal where area_id = new.id and sucursal <> new.sucursal;
  update sso_capacitaciones set sucursal = new.sucursal where area_id = new.id and sucursal <> new.sucursal;
  update sso_inspecciones   set sucursal = new.sucursal where area_id = new.id and sucursal <> new.sucursal;
  update sso_documentos     set sucursal = new.sucursal where area_id = new.id and sucursal is distinct from new.sucursal;
  return new;
end $$;
drop trigger if exists sso_area_mover_sucursal on public.sso_areas;
create trigger sso_area_mover_sucursal after update of sucursal on public.sso_areas
  for each row when (new.sucursal is distinct from old.sucursal) execute function public.sso_area_mover_sucursal();

-- ---------------------------------------------------------------- RLS por sucursal
-- Restrictivas: se suman (AND) a las politicas de permisos de cada modulo, que no cambian.

do $$
declare
  r record;
begin
  for r in select * from (values
    ('sso_areas',                  'sso_en_sucursal(sucursal)'),
    ('sso_trabajadores',           'sso_en_sucursal(sucursal)'),
    ('sso_examenes',               'sso_ve_trabajador(trabajador_id)'),
    ('sso_evidencias',             'sso_ve_hallazgo(hallazgo_id)'),
    ('sso_bitacora',               'sso_ve_hallazgo(hallazgo_id)'),
    ('sso_capacitaciones',         'sso_en_sucursal(sucursal)'),
    ('sso_capacitacion_asistentes','sso_ve_capacitacion(capacitacion_id)'),
    ('sso_epp_entregas',           'sso_ve_trabajador(trabajador_id)'),
    ('sso_epp_entrega_items',      'sso_ve_entrega(entrega_id)'),
    ('sso_inspecciones',           'sso_en_sucursal(sucursal)'),
    ('sso_inspeccion_respuestas',  'sso_ve_inspeccion(inspeccion_id)'),
    ('sso_eventos',                'sso_en_sucursal(sucursal)'),
    ('sso_dotacion_mensual',       'sso_en_sucursal(sucursal)'),
    ('sso_documentos',             'sso_en_sucursal(sucursal)'),
    ('sso_documento_versiones',    'sso_ve_documento(documento_id)'),
    ('sso_comites',                'sso_en_sucursal(sucursal)'),
    ('sso_comite_miembros',        'sso_ve_comite(comite_id)'),
    ('sso_comite_reuniones',       'sso_ve_comite(comite_id)'),
    ('sso_comite_acuerdos',        'sso_ve_comite(comite_id)'),
    ('sso_comite_asistencia',      'sso_ve_reunion(reunion_id)')
  ) x(tabla, expr) loop
    execute format('drop policy if exists %I on public.%I', r.tabla || '_sucursal', r.tabla);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
                   r.tabla || '_sucursal', r.tabla, r.expr, r.expr);
  end loop;
end $$;

-- Hallazgos: su responsable y quien lo reporto lo siguen viendo y respondiendo aunque sea de la
-- otra sucursal; crear y borrar, solo en la propia.
drop policy if exists sso_hallazgos_sucursal on public.sso_hallazgos;
create policy sso_hallazgos_sucursal on public.sso_hallazgos as restrictive for select to authenticated
  using (sso_en_sucursal(sucursal) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()));
drop policy if exists sso_hallazgos_sucursal_ins on public.sso_hallazgos;
create policy sso_hallazgos_sucursal_ins on public.sso_hallazgos as restrictive for insert to authenticated
  with check (sso_en_sucursal(sucursal));
drop policy if exists sso_hallazgos_sucursal_upd on public.sso_hallazgos;
create policy sso_hallazgos_sucursal_upd on public.sso_hallazgos as restrictive for update to authenticated
  using (sso_en_sucursal(sucursal) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()))
  with check (sso_en_sucursal(sucursal) or responsable_user_id = (select auth.uid()) or reportado_por = (select auth.uid()));
drop policy if exists sso_hallazgos_sucursal_del on public.sso_hallazgos;
create policy sso_hallazgos_sucursal_del on public.sso_hallazgos as restrictive for delete to authenticated
  using (sso_en_sucursal(sucursal));

-- ---------------------------------------------------------------- vistas con la sucursal
-- x.* fija las columnas al crear la vista: se recrean para que traigan la columna nueva.

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

drop view if exists public.sso_trabajadores_v;
drop view if exists public.sso_examenes_vigentes;
create view public.sso_examenes_vigentes with (security_invoker = true) as
select distinct on (e.trabajador_id, e.tipo_id)
  e.*,
  case
    when e.vencimiento is null then 'vigente'
    when e.vencimiento < public.sso_hoy() then 'vencido'
    when e.vencimiento <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion,
  public.sso_sucursal_trabajador(e.trabajador_id) as sucursal
from public.sso_examenes e
order by e.trabajador_id, e.tipo_id, e.fecha desc, e.created_at desc;

create view public.sso_trabajadores_v with (security_invoker = true) as
select t.*,
  em.nombre as empresa,
  em.propia as empresa_propia,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.situacion = 'vencido') as examenes_vencidos,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.situacion = 'por_vencer') as examenes_por_vencer,
  (select count(*) from public.sso_examenes_vigentes v where v.trabajador_id = t.id and v.resultado <> 'apto') as examenes_con_restriccion
from public.sso_trabajadores t
join public.sso_empresas em on em.id = t.empresa_id;

drop view if exists public.sso_capacitaciones_v;
create view public.sso_capacitaciones_v with (security_invoker = true) as
select c.*,
  tc.nombre as tipo,
  tc.vigencia_meses,
  (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and a.asistio) as asistentes,
  (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and not a.asistio) as ausentes,
  round(c.duracion_min / 60.0 * (select count(*) from public.sso_capacitacion_asistentes a where a.capacitacion_id = c.id and a.asistio), 1) as horas_hombre
from public.sso_capacitaciones c
join public.sso_tipos_capacitacion tc on tc.id = c.tipo_id;

-- la sucursal del trabajador (a quien le vence el curso), no la de la capacitacion
drop view if exists public.sso_capacitaciones_vigentes;
create view public.sso_capacitaciones_vigentes with (security_invoker = true) as
select distinct on (a.trabajador_id, c.tipo_id)
  a.trabajador_id, c.tipo_id, c.id as capacitacion_id, c.fecha,
  case when tc.vigencia_meses is not null then (c.fecha + make_interval(months => tc.vigencia_meses))::date end as vencimiento,
  case
    when tc.vigencia_meses is null then 'vigente'
    when (c.fecha + make_interval(months => tc.vigencia_meses))::date < public.sso_hoy() then 'vencido'
    when (c.fecha + make_interval(months => tc.vigencia_meses))::date <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion,
  public.sso_sucursal_trabajador(a.trabajador_id) as sucursal
from public.sso_capacitacion_asistentes a
join public.sso_capacitaciones c on c.id = a.capacitacion_id
join public.sso_tipos_capacitacion tc on tc.id = c.tipo_id
where a.asistio
order by a.trabajador_id, c.tipo_id, c.fecha desc;

drop view if exists public.sso_epp_entregas_v;
create view public.sso_epp_entregas_v with (security_invoker = true) as
select e.*,
  (select count(*) from public.sso_epp_entrega_items i where i.entrega_id = e.id) as elementos,
  (select coalesce(sum(i.cantidad), 0) from public.sso_epp_entrega_items i where i.entrega_id = e.id) as unidades,
  public.sso_sucursal_trabajador(e.trabajador_id) as sucursal
from public.sso_epp_entregas e;

drop view if exists public.sso_epp_vigentes;
create view public.sso_epp_vigentes with (security_invoker = true) as
select distinct on (e.trabajador_id, i.epp_id)
  e.trabajador_id, i.epp_id, e.id as entrega_id, e.fecha, i.cantidad, i.talla,
  case when c.vida_util_meses is not null then (e.fecha + make_interval(months => c.vida_util_meses))::date end as reposicion,
  case
    when c.vida_util_meses is null then 'vigente'
    when (e.fecha + make_interval(months => c.vida_util_meses))::date < public.sso_hoy() then 'vencido'
    when (e.fecha + make_interval(months => c.vida_util_meses))::date <= public.sso_hoy() + 15 then 'por_vencer'
    else 'vigente'
  end as situacion,
  public.sso_sucursal_trabajador(e.trabajador_id) as sucursal
from public.sso_epp_entrega_items i
join public.sso_epp_entregas e on e.id = i.entrega_id
join public.sso_epp_catalogo c on c.id = i.epp_id
order by e.trabajador_id, i.epp_id, e.fecha desc, e.created_at desc;

drop view if exists public.sso_inspecciones_v;
create view public.sso_inspecciones_v with (security_invoker = true) as
select i.*,
  c.nombre as checklist,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'cumple') as cumple,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'no_cumple') as no_cumple,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.resultado = 'na') as no_aplica,
  (select count(*) from public.sso_inspeccion_respuestas r where r.inspeccion_id = i.id and r.hallazgo_id is not null) as hallazgos
from public.sso_inspecciones i
join public.sso_checklists c on c.id = i.checklist_id;

-- Plantilla con areas: una fila por area (su sucursal). Sin areas: una fila por sucursal.
drop view if exists public.sso_programa_inspecciones;
create view public.sso_programa_inspecciones with (security_invoker = true) as
with destinos as (
  select c.id as checklist_id, ca.area_id, public.sso_sucursal_area(ca.area_id) as sucursal
  from public.sso_checklists c join public.sso_checklist_areas ca on ca.checklist_id = c.id
  where c.activo and c.periodicidad_dias is not null
  union all
  select c.id, null::uuid, s.sucursal
  from public.sso_checklists c
  cross join (values ('Santiago'), ('Puerto Varas')) s(sucursal)
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
  case when u.fecha is not null then greatest(public.sso_hoy() - (u.fecha + c.periodicidad_dias), 0) end as dias_atraso,
  d.sucursal
from destinos d
join public.sso_checklists c on c.id = d.checklist_id
left join lateral (
  select i.id, i.fecha from public.sso_inspecciones i
  where i.checklist_id = d.checklist_id and i.area_id is not distinct from d.area_id
    and (d.area_id is not null or i.sucursal = d.sucursal)
  order by i.fecha desc, i.created_at desc limit 1
) u on true;

drop view if exists public.sso_eventos_v;
create view public.sso_eventos_v with (security_invoker = true) as
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

drop view if exists public.sso_documentos_v;
create view public.sso_documentos_v with (security_invoker = true) as
select d.*,
  v.id as version_id, v.version, v.fecha_emision, v.vigente_hasta, v.archivo_path, v.archivo_nombre,
  (select count(*) from public.sso_documento_versiones x where x.documento_id = d.id) as versiones,
  case
    when v.id is null then 'sin_version'
    when v.vigente_hasta is null then 'vigente'
    when v.vigente_hasta < public.sso_hoy() then 'vencido'
    when v.vigente_hasta <= public.sso_hoy() + 30 then 'por_vencer'
    else 'vigente'
  end as situacion
from public.sso_documentos d
left join lateral (
  select * from public.sso_documento_versiones x where x.documento_id = d.id
  order by x.fecha_emision desc, x.created_at desc limit 1
) v on true;

drop view if exists public.sso_comite_acuerdos_v;
create view public.sso_comite_acuerdos_v with (security_invoker = true) as
select a.*,
  r.numero as reunion_numero, r.fecha as reunion_fecha,
  (a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < public.sso_hoy()) as vencido,
  case when a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < public.sso_hoy()
       then public.sso_hoy() - a.fecha_compromiso else 0 end as dias_atraso,
  public.sso_sucursal_comite(a.comite_id) as sucursal
from public.sso_comite_acuerdos a
left join public.sso_comite_reuniones r on r.id = a.reunion_id;

drop view if exists public.sso_comites_v;
create view public.sso_comites_v with (security_invoker = true) as
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

revoke all on public.sso_hallazgos_v, public.sso_trabajadores_v, public.sso_examenes_vigentes, public.sso_capacitaciones_v,
  public.sso_capacitaciones_vigentes, public.sso_epp_entregas_v, public.sso_epp_vigentes, public.sso_inspecciones_v,
  public.sso_programa_inspecciones, public.sso_eventos_v, public.sso_documentos_v, public.sso_comite_acuerdos_v,
  public.sso_comites_v from anon;
revoke insert, update, delete, truncate on public.sso_hallazgos_v, public.sso_trabajadores_v, public.sso_examenes_vigentes,
  public.sso_capacitaciones_v, public.sso_capacitaciones_vigentes, public.sso_epp_entregas_v, public.sso_epp_vigentes,
  public.sso_inspecciones_v, public.sso_programa_inspecciones, public.sso_eventos_v, public.sso_documentos_v,
  public.sso_comite_acuerdos_v, public.sso_comites_v from authenticated;
grant select on public.sso_hallazgos_v, public.sso_trabajadores_v, public.sso_examenes_vigentes, public.sso_capacitaciones_v,
  public.sso_capacitaciones_vigentes, public.sso_epp_entregas_v, public.sso_epp_vigentes, public.sso_inspecciones_v,
  public.sso_programa_inspecciones, public.sso_eventos_v, public.sso_documentos_v, public.sso_comite_acuerdos_v,
  public.sso_comites_v to authenticated;

-- ---------------------------------------------------------------- avisos por sucursal

-- Hallazgos: a quien no ve la sucursal no le llega (salvo que sea el responsable o quien reporto)
create or replace function public.sso_notificar(
  p_destinatarios uuid[], p_hallazgo_id uuid, p_tipo text, p_titulo text, p_mensaje text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int; h record;
begin
  select sucursal, responsable_user_id, reportado_por into h from sso_hallazgos where id = p_hallazgo_id;
  insert into sso_notificaciones (user_id, hallazgo_id, tipo, titulo, mensaje)
  select distinct d, p_hallazgo_id, p_tipo, p_titulo, p_mensaje
  from unnest(p_destinatarios) d
  where d is not null
    and d is distinct from auth.uid()
    and exists (select 1 from profiles p where p.id = d and coalesce(p.activo, true))
    and (d = h.responsable_user_id or d = h.reportado_por or sso_usuario_en_sucursal(d, h.sucursal));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Quienes gestionan un modulo en una sucursal (null: en cualquiera). Si nadie de los explicitos ve
-- esa sucursal, los admin (ven las dos), para que el aviso no se pierda.
create or replace function public.sso_destinatarios_en(p_modulo text, p_acciones text[], p_sucursal text)
returns uuid[] language sql stable security definer set search_path = public as $$
  with dest as (
    select d from unnest(sso_destinatarios(p_modulo, p_acciones)) d where sso_usuario_en_sucursal(d, p_sucursal)
  )
  select array(
    select d from dest
    union all
    select p.id from profiles p
    where not exists (select 1 from dest)
      and coalesce(p.activo, true) and not coalesce(p.is_root, false)
      and (coalesce(p.is_super_admin, false) or p.rol = 'admin'))
$$;

create or replace function public.sso_evento_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dest uuid[];
begin
  if new.gravedad in ('grave', 'fatal')
     and (tg_op = 'INSERT' or old.gravedad not in ('grave', 'fatal')) then
    v_dest := array(
      select distinct pe.user_id from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
      where pe.proyecto_id = sso_ancla_id() and pe.modulo_key = 'sso:accidentes' and pe.accion = 'aprobar'
        and sso_usuario_en_sucursal(pe.user_id, new.sucursal));
    if coalesce(array_length(v_dest, 1), 0) = 0 then
      v_dest := array(select s from sso_supervisores() s where sso_usuario_en_sucursal(s, new.sucursal));
    end if;
    if coalesce(array_length(v_dest, 1), 0) = 0 then v_dest := array(select sso_supervisores()); end if;
    insert into sso_notificaciones (user_id, evento_id, tipo, titulo, mensaje)
    select distinct d, new.id, 'accidente_' || new.gravedad,
           'Accidente ' || new.gravedad || ' N° ' || new.numero || ' (' || new.sucursal || '): notificar a la Inspección del Trabajo y a la Seremi de Salud',
           left(new.descripcion, 160)
    from unnest(v_dest) d
    where d is distinct from auth.uid();
  end if;
  return new;
end $$;

-- Resumenes diarios: los mismos de 20261005200000, uno por sucursal y solo a quien la ve. Los
-- documentos de las dos sucursales (sucursal null) van en una vuelta aparte, a todos.
create or replace function public.sso_alertas_vencimientos()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := sso_hoy();
  v_ven int; v_por int; v_ej text; v_n int := 0; v_res text[] := '{}';
  v_s text; v_en text;
  r record;
begin
  create temp table if not exists _sso_docs (clave text, documento_id uuid, situacion text, codigo text, titulo text, responsable uuid, vigente_hasta date) on commit drop;
  create temp table if not exists _sso_diat (clave text, id uuid, numero int, tipo text, descripcion text) on commit drop;
  create temp table if not exists _sso_ac (clave text, id uuid, descripcion text, responsable uuid, plazo date, comite text) on commit drop;
  create temp table if not exists _sso_com (clave text, nombre text, ultima date, titulo text, mensaje text) on commit drop;

  foreach v_s in array array['Santiago', 'Puerto Varas', null]::text[] loop
    v_en := coalesce(' · ' || v_s, '');

    -- 1) examenes ocupacionales (datos de salud: solo a quien tiene trabajadores:aprobar)
    with c as (
      select 'examen:' || v.id || ':' || v.situacion as clave, v.situacion, t.nombres || ' ' || t.apellidos || ' (' || te.nombre || ')' as et
      from sso_examenes_vigentes v
      join sso_trabajadores t on t.id = v.trabajador_id and t.activo
      join sso_tipos_examen te on te.id = v.tipo_id
      where v.situacion in ('vencido', 'por_vencer') and t.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
           string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
    from c join n using (clave);
    if v_ven + v_por > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('trabajadores', array['aprobar'], v_s), 'resumen_vencimientos',
        'Exámenes ocupacionales' || v_en || ': ' || sso_texto_conteo(v_ven, v_por, 'examen', 'exámenes'), left(v_ej, 200), '/prevencion/trabajadores');
      v_res := v_res || ('examenes=' || (v_ven + v_por));
    end if;

    -- 2) cursos con vigencia
    with c as (
      select 'cap:' || v.trabajador_id || ':' || v.tipo_id || ':' || v.vencimiento || ':' || v.situacion as clave, v.situacion,
             t.nombres || ' ' || t.apellidos || ' (' || tc.nombre || ')' as et
      from sso_capacitaciones_vigentes v
      join sso_trabajadores t on t.id = v.trabajador_id and t.activo
      join sso_tipos_capacitacion tc on tc.id = v.tipo_id
      where v.situacion in ('vencido', 'por_vencer') and t.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
           string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
    from c join n using (clave);
    if v_ven + v_por > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('capacitaciones', array['editar'], v_s), 'resumen_vencimientos',
        'Capacitaciones' || v_en || ': ' || sso_texto_conteo(v_ven, v_por, 'curso', 'cursos'), left(v_ej, 200), '/prevencion/capacitaciones/vigencias');
      v_res := v_res || ('cursos=' || (v_ven + v_por));
    end if;

    -- 3) reposicion de EPP
    with c as (
      select 'epp:' || v.trabajador_id || ':' || v.epp_id || ':' || v.reposicion || ':' || v.situacion as clave, v.situacion,
             t.nombres || ' ' || t.apellidos || ' (' || ec.nombre || ')' as et
      from sso_epp_vigentes v
      join sso_trabajadores t on t.id = v.trabajador_id and t.activo
      join sso_epp_catalogo ec on ec.id = v.epp_id
      where v.situacion in ('vencido', 'por_vencer') and t.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
           string_agg(et, ', ' order by situacion desc, et) into v_ven, v_por, v_ej
    from c join n using (clave);
    if v_ven + v_por > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('epp', array['editar'], v_s), 'resumen_vencimientos',
        'EPP por reponer' || v_en || ': ' || sso_texto_conteo(v_ven, v_por, 'elemento', 'elementos'), left(v_ej, 200), '/prevencion/epp/reposiciones');
      v_res := v_res || ('epp=' || (v_ven + v_por));
    end if;

    -- 4) documentos: resumen a quien edita el modulo y aviso al responsable de cada documento
    truncate _sso_docs;
    with c as (
      select 'doc:' || d.version_id || ':' || d.situacion as clave, d.id, d.situacion, d.codigo, d.titulo, d.responsable_user_id, d.vigente_hasta
      from sso_documentos_v d
      where d.activo and d.situacion in ('vencido', 'por_vencer') and d.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    insert into _sso_docs select c.* from c join n using (clave);
    select count(*) filter (where situacion = 'vencido'), count(*) filter (where situacion = 'por_vencer'),
           string_agg(codigo, ', ' order by situacion desc, codigo) into v_ven, v_por, v_ej from _sso_docs;
    if v_ven + v_por > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('documentos', array['editar'], v_s), 'resumen_vencimientos',
        'Revisión de documentos' || v_en || ': ' || sso_texto_conteo(v_ven, v_por, 'documento', 'documentos'), left(v_ej, 200), '/prevencion/documentos');
      for r in select * from _sso_docs where responsable is not null and sso_usuario_puede_modulo('documentos', 'ver', responsable) loop
        v_n := v_n + sso_alertar(array[r.responsable], 'documento_' || r.situacion,
          r.codigo || case when r.situacion = 'vencido' then ': la revisión está vencida' else ': revisión vence el ' || to_char(r.vigente_hasta, 'DD-MM-YYYY') end,
          r.titulo || ' · eres el responsable', '/prevencion/documentos/' || r.documento_id);
      end loop;
      v_res := v_res || ('documentos=' || (v_ven + v_por));
    end if;

    -- 5) inspecciones atrasadas o nunca hechas (una vez por ciclo: la clave lleva la ultima inspeccion)
    with c as (
      select 'insp:' || p.checklist_id || ':' || coalesce(p.area_id::text, '-' || p.sucursal) || ':' || coalesce(p.ultima::text, 'nunca') as clave,
             p.checklist || coalesce(' · ' || a.nombre, '') as et
      from sso_programa_inspecciones p left join sso_areas a on a.id = p.area_id
      where p.situacion in ('atrasada', 'nunca') and p.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    select count(*), string_agg(et, ', ' order by et) into v_ven, v_ej from c join n using (clave);
    if v_ven > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('inspecciones', array['aprobar'], v_s), 'resumen_vencimientos',
        'Inspecciones' || v_en || ': ' || v_ven || case when v_ven = 1 then ' atrasada o pendiente' else ' atrasadas o pendientes' end,
        left(v_ej, 200), '/prevencion/inspecciones');
      v_res := v_res || ('inspecciones=' || v_ven);
    end if;

    -- 6) DIAT/DIEP pendiente: accidente o enfermedad de hace mas de 24 horas sin folio (ultimo año)
    truncate _sso_diat;
    with c as (
      select 'diat:' || e.id as clave, e.id, e.numero, e.tipo, e.descripcion
      from sso_eventos e
      where e.tipo in ('accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad')
        and coalesce(btrim(e.diat_folio), '') = '' and e.ocurrido_en < now() - interval '24 hours'
        and e.ocurrido_en > now() - interval '365 days' and e.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    insert into _sso_diat select c.* from c join n using (clave);
    for r in select * from _sso_diat order by numero loop
      v_n := v_n + sso_alertar(sso_destinatarios_en('accidentes', array['aprobar', 'editar'], v_s), 'diat_pendiente',
        'Evento N° ' || r.numero || v_en || ': falta registrar la ' || case when r.tipo = 'enfermedad' then 'DIEP' else 'DIAT' end || ' a la Mutual',
        left(r.descripcion, 160), null, r.id);
      v_res := v_res || ('diat=' || r.numero);
    end loop;

    -- 7) acuerdos del comite vencidos: aviso al responsable y resumen a la secretaria del comite
    truncate _sso_ac;
    with c as (
      select 'acuerdo:' || a.id || ':vencido:' || a.fecha_compromiso as clave, a.id, a.descripcion, a.responsable_user_id, a.fecha_compromiso, co.nombre
      from sso_comite_acuerdos a join sso_comites co on co.id = a.comite_id and co.activo
      where a.estado in ('pendiente', 'en_proceso') and a.fecha_compromiso < v_hoy and co.sucursal is not distinct from v_s
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    insert into _sso_ac select c.* from c join n using (clave);
    select count(*), string_agg(left(descripcion, 60), ' · ' order by plazo) into v_ven, v_ej from _sso_ac;
    if v_ven > 0 then
      v_n := v_n + sso_alertar(sso_destinatarios_en('comite', array['crear', 'editar'], v_s), 'resumen_vencimientos',
        'Comité Paritario' || v_en || ': ' || v_ven || case when v_ven = 1 then ' acuerdo vencido' else ' acuerdos vencidos' end,
        left(v_ej, 200), '/prevencion/comite/acuerdos');
      for r in select * from _sso_ac where responsable is not null loop
        v_n := v_n + sso_alertar(array[r.responsable], 'acuerdo_vencido',
          'Comité Paritario: venció el plazo de tu acuerdo (' || to_char(r.plazo, 'DD-MM-YYYY') || ')', left(r.descripcion, 160), null, null, r.id);
      end loop;
      v_res := v_res || ('acuerdos=' || v_ven);
    end if;

    -- 8) comite sin reunion ordinaria en mas de un mes (una vez por mes) y periodo por terminar
    truncate _sso_com;
    with c as (
        select 'comite:' || co.id || ':sin_reunion:' || to_char(v_hoy, 'YYYY-MM') as clave, co.nombre, co.ultima_ordinaria,
               'Comité Paritario ' || co.nombre || ': ' || coalesce('sin reunión ordinaria desde el ' || to_char(co.ultima_ordinaria, 'DD-MM-YYYY'), 'no hay reuniones ordinarias registradas') as titulo,
               'Debe reunirse en forma ordinaria una vez al mes.' as mensaje
        from sso_comites_v co
        where co.activo and co.sucursal is not distinct from v_s
          and co.periodo_desde < v_hoy - 31 and (co.ultima_ordinaria is null or co.ultima_ordinaria < v_hoy - 31)
        union all
        select 'comite:' || co.id || ':periodo:' || co.periodo_hasta || ':' || case when co.periodo_hasta < v_hoy then 'vencido' else 'por_vencer' end,
               co.nombre, null,
               'Comité Paritario ' || co.nombre || ': el periodo ' || case when co.periodo_hasta < v_hoy then 'terminó' else 'termina' end || ' el ' || to_char(co.periodo_hasta, 'DD-MM-YYYY'),
               'Corresponde renovar el comité (elección de los representantes de los trabajadores).'
        from sso_comites_v co
        where co.activo and co.sucursal is not distinct from v_s and co.periodo_hasta <= v_hoy + 60
    ), n as (insert into sso_alertas_log (clave) select clave from c on conflict do nothing returning clave)
    insert into _sso_com select c.* from c join n using (clave);
    for r in select * from _sso_com loop
      v_n := v_n + sso_alertar(sso_destinatarios_en('comite', array['crear', 'editar'], v_s), 'comite', r.titulo, r.mensaje, '/prevencion/comite');
      v_res := v_res || 'comite';
    end loop;
  end loop;

  delete from sso_alertas_log where creado_en < now() - interval '400 days';
  return format('vencimientos avisos=%s [%s]', v_n, array_to_string(v_res, ' '));
end $$;

-- ---------------------------------------------------------------- Dashboard: requiere atencion

-- sso_pendientes() en una sucursal (null: las que ve el usuario). Invoker: cada vista aplica su RLS.
create or replace function public.sso_pendientes_en(p_sucursal text)
returns table (modulo text, clave text, etiqueta text, cantidad bigint, nivel text, ruta text)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'hallazgos', 'hallazgos_vencidos', 'Hallazgos con el plazo vencido', count(*), 'critico', '/prevencion/hallazgos'
    from sso_hallazgos_v where sso_puede_modulo('hallazgos', 'ver') and vencido and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'hallazgos', 'por_verificar', 'Cierres de hallazgos por validar', count(*), 'alerta', '/prevencion/hallazgos'
    from sso_hallazgos where sso_puede_modulo('hallazgos', 'aprobar') and estado = 'pend_verificacion' and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'accidentes', 'autoridad', 'Accidentes graves o fatales sin notificación a la autoridad', count(*), 'critico', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and gravedad in ('grave', 'fatal') and autoridad_notificada_en is null
      and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'accidentes', 'diat', 'Accidentes sin DIAT/DIEP registrada', count(*), 'critico', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and tipo in ('accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad')
      and coalesce(btrim(diat_folio), '') = '' and ocurrido_en < now() - interval '24 hours' and ocurrido_en > now() - interval '365 days'
      and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'accidentes', 'investigaciones', 'Investigaciones abiertas hace más de 30 días', count(*), 'alerta', '/prevencion/accidentes'
    from sso_eventos where sso_puede_modulo('accidentes', 'ver') and estado <> 'cerrado' and ocurrido_en < now() - interval '30 days'
      and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'inspecciones', 'atrasadas', 'Inspecciones atrasadas o nunca hechas', count(*), 'alerta', '/prevencion/inspecciones'
    from sso_programa_inspecciones where sso_puede_modulo('inspecciones', 'ver') and situacion in ('atrasada', 'nunca')
      and (case when p_sucursal is null then sso_en_sucursal(sucursal) else sucursal = p_sucursal end)
    union all
    select 'trabajadores', 'examenes', 'Exámenes ocupacionales vencidos', count(*), 'critico', '/prevencion/trabajadores'
    from sso_examenes_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('trabajadores', 'aprobar') and v.situacion = 'vencido' and (p_sucursal is null or t.sucursal = p_sucursal)
    union all
    select 'capacitaciones', 'cursos', 'Cursos vencidos (trabajador × curso)', count(*), 'alerta', '/prevencion/capacitaciones/vigencias'
    from sso_capacitaciones_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('capacitaciones', 'ver') and v.situacion = 'vencido' and (p_sucursal is null or t.sucursal = p_sucursal)
    union all
    select 'epp', 'reposiciones', 'Elementos de EPP por reponer (vencidos)', count(*), 'alerta', '/prevencion/epp/reposiciones'
    from sso_epp_vigentes v join sso_trabajadores t on t.id = v.trabajador_id and t.activo
    where sso_puede_modulo('epp', 'ver') and v.situacion = 'vencido' and (p_sucursal is null or t.sucursal = p_sucursal)
    union all
    select 'documentos', 'documentos', 'Documentos con la revisión vencida', count(*), 'alerta', '/prevencion/documentos'
    from sso_documentos_v where sso_puede_modulo('documentos', 'ver') and activo and situacion = 'vencido'
      and (p_sucursal is null or sucursal is null or sucursal = p_sucursal)
    union all
    select 'comite', 'acuerdos', 'Acuerdos del Comité Paritario vencidos', count(*), 'alerta', '/prevencion/comite/acuerdos'
    from sso_comite_acuerdos_v where sso_puede_modulo('comite', 'ver') and vencido and (p_sucursal is null or sucursal = p_sucursal)
    union all
    select 'comite', 'reunion', 'Comités sin reunión ordinaria en el último mes', count(*), 'alerta', '/prevencion/comite'
    from sso_comites_v where sso_puede_modulo('comite', 'ver') and activo and periodo_desde < sso_hoy() - 31
      and (ultima_ordinaria is null or ultima_ordinaria < sso_hoy() - 31) and (p_sucursal is null or sucursal = p_sucursal)
  ) x(modulo, clave, etiqueta, cantidad, nivel, ruta)
  where cantidad > 0
$$;

-- ---------------------------------------------------------------- permisos de las funciones

revoke execute on function public.sso_en_sucursal(text), public.sso_sucursal_area(uuid), public.sso_sucursal_trabajador(uuid),
  public.sso_sucursal_comite(uuid), public.sso_ve_trabajador(uuid), public.sso_ve_hallazgo(uuid), public.sso_ve_capacitacion(uuid),
  public.sso_ve_entrega(uuid), public.sso_ve_inspeccion(uuid), public.sso_ve_documento(uuid), public.sso_ve_comite(uuid),
  public.sso_ve_reunion(uuid), public.sso_pendientes_en(text)
  from public, anon;
grant execute on function public.sso_en_sucursal(text), public.sso_sucursal_area(uuid), public.sso_sucursal_trabajador(uuid),
  public.sso_sucursal_comite(uuid), public.sso_ve_trabajador(uuid), public.sso_ve_hallazgo(uuid), public.sso_ve_capacitacion(uuid),
  public.sso_ve_entrega(uuid), public.sso_ve_inspeccion(uuid), public.sso_ve_documento(uuid), public.sso_ve_comite(uuid),
  public.sso_ve_reunion(uuid), public.sso_pendientes_en(text)
  to authenticated;
revoke execute on function public.sso_usuario_en_sucursal(uuid, text), public.sso_fijar_sucursal(), public.sso_area_mover_sucursal(),
  public.sso_destinatarios_en(text, text[], text), public.sso_notificar(uuid[], uuid, text, text, text),
  public.sso_evento_notificar(), public.sso_alertas_vencimientos()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

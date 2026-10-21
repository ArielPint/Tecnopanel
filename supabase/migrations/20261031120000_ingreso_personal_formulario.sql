-- Portal Ingreso de Personal: formulario según el Procedimiento de Ingreso de Personal (v1.0) y las
-- observaciones de RRHH.
--
--   - Motivo de la contratación; si es reemplazo, a quién reemplaza.
--   - Jefatura directa del trabajador y quién completa el formulario (ya estaba: creado_por).
--   - Tipo de trabajador: planta o contratista.
--   - Conducción de vehículos: licencia o certificación que pide el cargo.
--   - Jornada con su horario. Las jornadas y su horario se configuran (ing_jornadas, Configuración):
--     al elegir una se copia el horario a la solicitud, donde se puede ajustar.
--   - TI: qué necesita (correo, notebook, pantalla, otros). Sigue siendo una sola tarea de TI.
--   - Tallas por prenda (zapato, polera, pantalón, chaqueta). `tallas` queda para otras tallas.
--   - Inducciones automáticas, ya no se eligen: la de seguridad (Prevención) en todos los ingresos y
--     la de bienvenida (RRHH) en los de planta. req_induccion queda siempre en true.
--
-- Los campos nuevos se exigen al crear la solicitud desde la web. Las solicitudes anteriores se
-- pueden editar sin completarlos (salvo lo que dependa de lo que se cambia).
-- El aviso de 10 días hábiles de anticipación es solo del front (no bloquea).
--
-- Va después de 20261015130000_ingreso_personal_areas.sql. Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- columnas nuevas

alter table public.ing_ingresos
  add column if not exists tipo_trabajador text not null default 'planta',
  add column if not exists motivo text,
  add column if not exists reemplaza_a text,
  add column if not exists jefatura_directa text,
  add column if not exists horario text,
  add column if not exists licencia_requerida text,
  add column if not exists ti_correo boolean not null default false,
  add column if not exists ti_notebook boolean not null default false,
  add column if not exists ti_pantalla boolean not null default false,
  add column if not exists ti_otros text,
  add column if not exists talla_zapato text,
  add column if not exists talla_polera text,
  add column if not exists talla_pantalon text,
  add column if not exists talla_chaqueta text;

alter table public.ing_ingresos drop constraint if exists ing_ingresos_tipo_trabajador_check;
alter table public.ing_ingresos add constraint ing_ingresos_tipo_trabajador_check
  check (tipo_trabajador in ('planta', 'contratista'));
alter table public.ing_ingresos drop constraint if exists ing_ingresos_motivo_check;
alter table public.ing_ingresos add constraint ing_ingresos_motivo_check
  check (motivo is null or motivo in ('reemplazo', 'aumento_dotacion', 'nuevo_cargo', 'proyecto', 'temporada', 'otro'));
alter table public.ing_ingresos drop constraint if exists ing_ingresos_reemplazo_check;
alter table public.ing_ingresos add constraint ing_ingresos_reemplazo_check
  check (motivo is distinct from 'reemplazo' or btrim(coalesce(reemplaza_a, '')) <> '');

-- Nueva tarea: inducción de bienvenida (RRHH)
alter table public.ing_tareas drop constraint if exists ing_tareas_tipo_check;
alter table public.ing_tareas add constraint ing_tareas_tipo_check
  check (tipo in ('contrato', 'bienvenida', 'ti', 'epp', 'uniforme', 'induccion', 'vehiculo'));

-- ---------------------------------------------------------------- jornadas configurables

create table if not exists public.ing_jornadas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  horario text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ing_jornadas_nombre_uq on public.ing_jornadas (lower(btrim(nombre)));

-- Las que antes eran sugerencias fijas en el código. El horario lo completa RRHH en Configuración.
insert into public.ing_jornadas (nombre)
values ('Administrativa'), ('Turno mañana'), ('Turno tarde'), ('Turno noche'), ('Part time')
on conflict ((lower(btrim(nombre)))) do nothing;

create or replace function public.ing_jornada_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nombre := btrim(new.nombre);
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');
  return new;
end $$;
drop trigger if exists ing_jornada_antes on public.ing_jornadas;
create trigger ing_jornada_antes before insert or update on public.ing_jornadas
  for each row execute function public.ing_jornada_antes();

-- ---------------------------------------------------------------- catálogo de tareas

create or replace function public.ing_catalogo_tareas()
returns table (tipo text, area text, titulo text, evidencia boolean, orden int)
language sql immutable as $$
  values
    ('contrato',   'rrhh',       'Contrato y anexos firmados',                  true,  1),
    ('bienvenida', 'rrhh',       'Inducción de bienvenida',                     false, 2),
    ('ti',         'ti',         'Crear correo y accesos, entregar equipo',     false, 3),
    ('epp',        'bodega',     'Entregar EPP con acta de entrega firmada',    true,  4),
    ('uniforme',   'bodega',     'Entregar uniforme',                           false, 5),
    ('induccion',  'prevencion', 'Inducción de seguridad con registro firmado', true,  6),
    ('vehiculo',   'jefatura',   'Verificar licencia y autorizar conducción',   true,  7)
$$;

-- Contrato e inducción de seguridad siempre; bienvenida solo planta; el resto según lo pedido
create or replace function public.ing_tipos_ingreso(p_ingreso_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array['contrato', 'induccion']
    || case when i.tipo_trabajador = 'planta' then array['bienvenida'] else '{}'::text[] end
    || case when i.req_ti then array['ti'] else '{}'::text[] end
    || case when i.req_epp then array['epp'] else '{}'::text[] end
    || case when i.req_uniforme then array['uniforme'] else '{}'::text[] end
    || case when i.req_vehiculo then array['vehiculo'] else '{}'::text[] end
  from ing_ingresos i where i.id = p_ingreso_id
$$;

create or replace function public.ing_motivo_label(p text)
returns text language sql immutable as $$
  select case p
    when 'reemplazo' then 'Reemplazo'
    when 'aumento_dotacion' then 'Aumento de dotación'
    when 'nuevo_cargo' then 'Cargo nuevo'
    when 'proyecto' then 'Proyecto u obra específica'
    when 'temporada' then 'Temporada o peak de producción'
    when 'otro' then 'Otro' end
$$;

-- Lo que el área necesita saber para hacer su tarea (va en el correo)
create or replace function public.ing_detalle_tarea_html(p_tipo text, p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when d.texto is null then '' else '<p style="margin:0 0 12px">' || ing_html(d.texto) || '</p>' end
  from ing_ingresos i
  cross join lateral (select nullif(case p_tipo
    when 'ti' then concat_ws(' · ',
      case when i.ti_correo then 'Correo' end, case when i.ti_notebook then 'Notebook' end,
      case when i.ti_pantalla then 'Pantalla' end, 'Otros: ' || i.ti_otros)
    when 'epp' then concat_ws(' · ', 'Zapato ' || i.talla_zapato, i.tallas)
    when 'uniforme' then concat_ws(' · ', 'Polera ' || i.talla_polera, 'Pantalón ' || i.talla_pantalon,
      'Chaqueta ' || i.talla_chaqueta, i.tallas)
    when 'vehiculo' then 'Licencia o certificación: ' || i.licencia_requerida
    end, '') as texto) d
  where i.id = p_ingreso_id
$$;

-- Datos del ingreso para el cuerpo de los correos (sin renta)
create or replace function public.ing_resumen_html(p_ingreso_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select '<b>' || ing_html(i.nombre) || '</b> · ' || ing_html(i.cargo)
    || case when i.tipo_trabajador = 'contratista' then ' (contratista)' else '' end || '<br>'
    || 'Sucursal ' || ing_html(i.sucursal) || ' · ingresa el ' || to_char(i.fecha_ingreso, 'DD-MM-YYYY')
    || coalesce(' · ' || ing_html(i.jornada) || coalesce(' (' || ing_html(i.horario) || ')', ''), '') || '<br>'
    || coalesce('Motivo: ' || ing_motivo_label(i.motivo) || coalesce(' de ' || ing_html(i.reemplaza_a), '') || '<br>', '')
    || coalesce('Jefatura directa: ' || ing_html(i.jefatura_directa) || '<br>', '')
    || 'Pedido por ' || ing_html(coalesce(ing_nombre(i.creado_por), '')) || ' (' || ing_html(i.area) || ')'
  from ing_ingresos i where i.id = p_ingreso_id
$$;

-- Igual que antes, pero con ing_tipos_ingreso() y el detalle de la tarea en el correo
create or replace function public.ing_sincronizar_tareas(p_ingreso_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i ing_ingresos%rowtype;
  t record;
  v_tipos text[];
begin
  select * into i from ing_ingresos where id = p_ingreso_id;
  if not found then return; end if;
  v_tipos := ing_tipos_ingreso(i.id);

  delete from ing_tareas x
  where x.ingreso_id = i.id and not x.hecha and x.tipo <> all (v_tipos)
    and not exists (select 1 from ing_archivos a where a.tarea_id = x.id);

  for t in
    insert into ing_tareas (ingreso_id, tipo, area, titulo, requiere_evidencia, orden)
    select i.id, c.tipo, c.area, c.titulo, c.evidencia, c.orden
    from ing_catalogo_tareas() c
    where c.tipo = any (v_tipos)
    on conflict (ingreso_id, tipo) do nothing
    returning tipo, area, titulo
  loop
    if t.area in ('ti', 'bodega', 'prevencion') then
      perform ing_encolar(
        array(select ing_usuarios_con(t.area, i.sucursal)),
        'Tarea de ingreso N° ' || i.numero || ': ' || t.titulo,
        ing_correo_html('Tienes una tarea para el ingreso N° ' || i.numero,
          '<p style="margin:0 0 12px">' || ing_html(t.titulo) || '</p>' || ing_detalle_tarea_html(t.tipo, i.id)
          || ing_resumen_html(i.id), i.id));
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- triggers

-- BEFORE, SECURITY INVOKER como ing_ingreso_antes (current_user dice si viene de la web).
-- Corre después de ing_ingreso_antes e ing_ingreso_area (los triggers van por nombre).
create or replace function public.ing_ingreso_formulario()
returns trigger language plpgsql set search_path = public as $$
declare
  v_nuevo boolean := tg_op = 'INSERT';
begin
  new.req_induccion := true;   -- la inducción de seguridad es obligatoria para todos
  new.jefatura_directa := nullif(btrim(coalesce(new.jefatura_directa, '')), '');
  new.horario := nullif(btrim(coalesce(new.horario, '')), '');
  new.reemplaza_a := case when new.motivo = 'reemplazo' then nullif(btrim(coalesce(new.reemplaza_a, '')), '') end;
  new.licencia_requerida := case when new.req_vehiculo then nullif(btrim(coalesce(new.licencia_requerida, '')), '') end;
  new.ti_otros := case when new.req_ti then nullif(btrim(coalesce(new.ti_otros, '')), '') end;
  if not new.req_ti then
    new.ti_correo := false; new.ti_notebook := false; new.ti_pantalla := false;
  end if;
  new.talla_zapato := nullif(btrim(coalesce(new.talla_zapato, '')), '');
  new.talla_polera := nullif(btrim(coalesce(new.talla_polera, '')), '');
  new.talla_pantalon := nullif(btrim(coalesce(new.talla_pantalon, '')), '');
  new.talla_chaqueta := nullif(btrim(coalesce(new.talla_chaqueta, '')), '');

  if current_user in ('authenticated', 'anon') then
    if v_nuevo and new.motivo is null then
      raise exception 'Indica el motivo de la contratación' using errcode = '22023';
    end if;
    if v_nuevo and new.jefatura_directa is null then
      raise exception 'Indica la jefatura directa del trabajador' using errcode = '22023';
    end if;
    if v_nuevo and new.horario is null then
      raise exception 'Indica el horario de la jornada' using errcode = '22023';
    end if;
    if new.motivo = 'reemplazo' and new.reemplaza_a is null then
      raise exception 'Indica a quién reemplaza' using errcode = '22023';
    end if;
    if new.req_vehiculo and new.licencia_requerida is null
       and (v_nuevo or not old.req_vehiculo or old.licencia_requerida is not null) then
      raise exception 'Indica la licencia o certificación que pide la conducción' using errcode = '22023';
    end if;
    if new.req_ti and not (new.ti_correo or new.ti_notebook or new.ti_pantalla or new.ti_otros is not null)
       and (v_nuevo or not old.req_ti or old.ti_correo or old.ti_notebook or old.ti_pantalla or old.ti_otros is not null) then
      raise exception 'Indica qué necesita de TI (correo, notebook, pantalla u otros)' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ing_ingreso_formulario on public.ing_ingresos;
create trigger ing_ingreso_formulario before insert or update on public.ing_ingresos
  for each row execute function public.ing_ingreso_formulario();

-- AFTER: igual que antes, pero resincroniza también si cambia el tipo de trabajador y registra en el
-- historial cualquier cambio de datos (no los de estado, que registran cerrar y anular).
create or replace function public.ing_ingreso_despues()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_estado constant text[] := array['updated_at', 'aviso_listo_at', 'estado', 'buk_id', 'motivo_anulacion', 'cerrado_por', 'fecha_cierre'];
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

  if (new.tipo_trabajador, new.req_ti, new.req_epp, new.req_uniforme, new.req_induccion, new.req_vehiculo)
     is distinct from (old.tipo_trabajador, old.req_ti, old.req_epp, old.req_uniforme, old.req_induccion, old.req_vehiculo) then
    perform ing_sincronizar_tareas(new.id);
  end if;
  if to_jsonb(new) - v_estado is distinct from to_jsonb(old) - v_estado then
    insert into ing_bitacora (ingreso_id, user_id, texto) values (new.id, auth.uid(), 'Datos de la solicitud actualizados');
    perform ing_revisar_listo(new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- ingresos abiertos

-- La inducción de seguridad pasa a ser obligatoria y la de bienvenida se agrega a los de planta.
-- Las tareas nuevas avisan por correo a Prevención como cualquier otra.
update public.ing_ingresos set req_induccion = true where estado = 'en_proceso' and not req_induccion;
do $$ begin perform public.ing_sincronizar_tareas(id) from public.ing_ingresos where estado = 'en_proceso'; end $$;

-- ---------------------------------------------------------------- vista (i.* fija las columnas al crearla)

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

revoke all on public.ing_ingresos_v from anon;
revoke insert, update, delete, truncate on public.ing_ingresos_v from authenticated;
grant select on public.ing_ingresos_v to authenticated;

-- ---------------------------------------------------------------- RLS de jornadas (como ing_areas)

alter table public.ing_jornadas enable row level security;

drop policy if exists ing_jornadas_select on public.ing_jornadas;
create policy ing_jornadas_select on public.ing_jornadas for select to authenticated
  using (ing_tiene_acceso());
drop policy if exists ing_jornadas_insert on public.ing_jornadas;
create policy ing_jornadas_insert on public.ing_jornadas for insert to authenticated
  with check (ing_tiene('rrhh'));
drop policy if exists ing_jornadas_update on public.ing_jornadas;
create policy ing_jornadas_update on public.ing_jornadas for update to authenticated
  using (ing_tiene('rrhh')) with check (ing_tiene('rrhh'));
drop policy if exists ing_jornadas_delete on public.ing_jornadas;
create policy ing_jornadas_delete on public.ing_jornadas for delete to authenticated
  using (ing_tiene('rrhh'));

revoke all on public.ing_jornadas from anon;
revoke truncate on public.ing_jornadas from authenticated;

-- ---------------------------------------------------------------- privilegios de las funciones nuevas

revoke execute on function
  public.ing_jornada_antes(), public.ing_ingreso_formulario(), public.ing_tipos_ingreso(uuid),
  public.ing_motivo_label(text), public.ing_detalle_tarea_html(text, uuid)
  from public, anon;
-- internas: las usan las funciones security definer
revoke execute on function public.ing_tipos_ingreso(uuid), public.ing_detalle_tarea_html(text, uuid) from authenticated;
-- redefinidas con create or replace: conservan sus privilegios, pero por si acaso
revoke execute on function public.ing_sincronizar_tareas(uuid), public.ing_resumen_html(uuid), public.ing_ingreso_despues()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

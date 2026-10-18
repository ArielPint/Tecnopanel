-- Adquisiciones: SLA de primera atencion y comprador asignado (sobre las migraciones *_adquisiciones*.sql
-- anteriores, que van antes). Cuarta entrega de lo que se trae de TP Control Tower.
--
-- SLA: Compras tiene 24 horas desde que se crea la solicitud para atenderla por primera vez. Cuenta como
--   primera atencion la primera accion de Compras de la sucursal en la solicitud: comentario, cotizacion,
--   asignar comprador, marcarla como revisada, enviarla a aprobacion, anularla... (lo que deja bitacora).
--   Si la crea alguien de Compras, queda atendida al crearla.
--   sla_estado: en_plazo, por_vencer (menos de 4 horas), vencido (sin atencion y pasado el plazo),
--   cumplido, atrasado (atendida despues del plazo).
-- Comprador asignado: lo elige Compras de la sucursal entre quienes tienen rol comprador o jefe de compras ahi.
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

alter table public.adq_solicitudes add column if not exists primera_atencion_at timestamptz;
alter table public.adq_solicitudes add column if not exists primera_atencion_por uuid references auth.users(id);
alter table public.adq_solicitudes add column if not exists comprador_id uuid references auth.users(id);

create or replace function public.adq_sla_horas()
returns int language sql immutable as $$ select 24 $$;

create or replace function public.adq_usuario_compras_en(p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_usuario_tiene_en('comprador', p_user_id, p_sucursal) or adq_usuario_tiene_en('jefe_compras', p_user_id, p_sucursal)
$$;

-- Desde la web: el SLA, el comprador y el plan de origen no se tocan a mano (solo las funciones)
create or replace function public.adq_solicitud_sla()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.comprador_id := null;
      new.primera_atencion_por := null;
      new.primera_atencion_at := case when adq_compras_de(new.sucursal) then now() end;
      if new.primera_atencion_at is not null then new.primera_atencion_por := auth.uid(); end if;
    else
      new.primera_atencion_at := old.primera_atencion_at;
      new.primera_atencion_por := old.primera_atencion_por;
      new.comprador_id := old.comprador_id;
      new.plan_id := old.plan_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists adq_solicitud_sla on public.adq_solicitudes;
create trigger adq_solicitud_sla before insert or update on public.adq_solicitudes
  for each row execute function public.adq_solicitud_sla();

-- La primera entrada de bitacora de alguien de Compras de la sucursal es la primera atencion
create or replace function public.adq_bitacora_atencion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    update adq_solicitudes s set primera_atencion_at = new.created_at, primera_atencion_por = new.user_id
    where s.id = new.solicitud_id and s.primera_atencion_at is null and adq_usuario_compras_en(new.user_id, s.sucursal);
  end if;
  return new;
end $$;
drop trigger if exists adq_bitacora_atencion on public.adq_bitacora;
create trigger adq_bitacora_atencion after insert on public.adq_bitacora
  for each row execute function public.adq_bitacora_atencion();

-- Solicitudes existentes: primera atencion segun su bitacora (solo las que no la tienen)
update public.adq_solicitudes s set primera_atencion_at = b.created_at, primera_atencion_por = b.user_id
from (
  select distinct on (x.solicitud_id) x.solicitud_id, x.created_at, x.user_id
  from public.adq_bitacora x join public.adq_solicitudes y on y.id = x.solicitud_id
  where x.user_id is not null and y.primera_atencion_at is null and public.adq_usuario_compras_en(x.user_id, y.sucursal)
  order by x.solicitud_id, x.created_at
) b
where b.solicitud_id = s.id and s.primera_atencion_at is null;

create or replace function public.adq_marcar_revisada(p_solicitud_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s adq_solicitudes%rowtype;
begin
  select * into s from adq_solicitudes where id = p_solicitud_id;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras de la sucursal la marca como revisada' using errcode = '42501'; end if;
  if s.primera_atencion_at is not null then return; end if;
  insert into adq_bitacora (solicitud_id, user_id, texto) values (s.id, auth.uid(), 'Revisada por Compras');
end $$;

-- p_comprador null: la deja sin asignar
create or replace function public.adq_asignar_comprador(p_solicitud_id uuid, p_comprador uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s adq_solicitudes%rowtype;
begin
  select * into s from adq_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras de la sucursal asigna el comprador' using errcode = '42501'; end if;
  if s.estado in ('recibida', 'rechazada', 'anulada') then raise exception 'La solicitud está cerrada' using errcode = 'P0001'; end if;
  if p_comprador is not null and not exists (select 1 from adq_compradores(s.sucursal) c where c.id = p_comprador) then
    raise exception 'Esa persona no es comprador en %', s.sucursal using errcode = '22023';
  end if;
  if p_comprador is not distinct from s.comprador_id then return; end if;
  update adq_solicitudes set comprador_id = p_comprador where id = s.id;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (s.id, auth.uid(), case when p_comprador is null then 'Comprador sin asignar' else 'Comprador asignado: ' || coalesce(adq_nombre(p_comprador), '') end);
  if p_comprador is not null and p_comprador is distinct from auth.uid() then
    perform adq_avisar(array[p_comprador], s.id, 'Te asignaron la SC-' || s.numero || ' · ' || s.titulo,
      'Te asignaron la solicitud de compra SC-' || s.numero);
  end if;
end $$;

-- Compradores y jefes de compras de la sucursal (explicitos, sin los admin implicitos)
create or replace function public.adq_compradores(p_sucursal text)
returns table (id uuid, nombre text) language sql stable security definer set search_path = public as $$
  select u, adq_nombre(u)
  from (select adq_usuarios_con('comprador', p_sucursal) as u union select adq_usuarios_con('jefe_compras', p_sucursal)) x
  where adq_compras_de(p_sucursal)
  order by 2
$$;

-- ---------------------------------------------------------------- vista (igual que en 20261018120000, mas SLA y comprador)

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
  (select n.nombre from adq_niveles n
   where s.estado = 'en_aprobacion' and n.sucursal = s.sucursal and n.nivel = s.nivel_aprobado + 1) as nivel_pendiente_nombre,
  adq_puede_aprobar(s.id) as puedo_aprobar,
  (s.estado = 'cotizando' and adq_compras_de(s.sucursal)) as puedo_cotizar,
  coalesce(oc.docnums, '') as oc_docnums,
  oc.recepcion_pct,
  oc.facturado,
  adq_nombre(s.comprador_id) as comprador_nombre,
  adq_nombre(s.primera_atencion_por) as primera_atencion_por_nombre,
  s.created_at + make_interval(hours => adq_sla_horas()) as sla_vence_at,
  case
    when s.primera_atencion_at is not null then
      case when s.primera_atencion_at <= s.created_at + make_interval(hours => adq_sla_horas()) then 'cumplido' else 'atrasado' end
    when s.estado in ('recibida', 'rechazada', 'anulada') then 'cumplido'
    when now() > s.created_at + make_interval(hours => adq_sla_horas()) then 'vencido'
    when now() > s.created_at + make_interval(hours => adq_sla_horas() - 4) then 'por_vencer'
    else 'en_plazo' end as sla_estado,
  round(extract(epoch from (coalesce(s.primera_atencion_at, now()) - s.created_at)) / 3600, 1) as sla_horas_transcurridas,
  pl.numero as plan_numero
from adq_solicitudes s
left join proyectos p on p.id = s.proyecto_id
left join sap_centros_costo cc on cc.codigo = s.centro_costo
left join adq_cotizaciones e on e.id = s.cotizacion_id
left join adq_planes pl on pl.id = s.plan_id
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

revoke all on public.adq_solicitudes_v from anon, authenticated;
grant select on public.adq_solicitudes_v to authenticated;

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
  public.adq_sla_horas(), public.adq_solicitud_sla(), public.adq_marcar_revisada(uuid),
  public.adq_asignar_comprador(uuid, uuid), public.adq_compradores(text)
  to authenticated;
revoke execute on function public.adq_usuario_compras_en(uuid, text) from authenticated;

notify pgrst, 'reload schema';

commit;

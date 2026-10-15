-- Adquisiciones: roles y vistas por sucursal (sobre 20261016120000 y 20261017120000, que van antes).
--
-- Antes: un rol por fila ('adq:<rol>') y la sucursal salia de la ficha del usuario (profiles.sucursal,
-- vacia = ambas); el jefe de compras y las vistas de control veian las dos sucursales.
-- Ahora: un rol por sucursal: modulo_key 'adq:<rol>:<sucursal>' ('adq:comprador:Santiago',
-- 'adq:aprobador_2:Puerto Varas', ...). Se puede ser comprador en una y aprobador en la otra. La
-- sucursal de la ficha ya no cuenta para Adquisiciones. Los admin del hub tienen todo en ambas.
--
-- Todo queda por sucursal:
--   solicitudes      crear (solicitante/bodega/compras de esa sucursal), ver, cotizar, aprobar
--   jefe de compras  por sucursal: sus presupuestos (CECO de su sucursal) y sus niveles de aprobacion
--   niveles          montos de aprobacion propios de cada sucursal
--   dashboard, reporte, presupuestos: CECO de las sucursales donde compra o aprueba
--   OC de SAP y facturas: OC con lineas de su sucursal (por CECO, o por bodega si la linea no tiene)
--   reposicion       la bodega de su sucursal (B006 Santiago, B007 Puerto Varas)
-- Lo que no tiene sucursal (CECO general, OC sin CECO ni bodega conocida) lo ve cualquiera con ese
-- rol en alguna sucursal.
--
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- accesos viejos -> por sucursal

-- 'adq:<rol>' + sucursal de la ficha (vacia = las dos) -> 'adq:<rol>:<sucursal>'
insert into public.permisos (user_id, proyecto_id, modulo_key, accion)
select pe.user_id, pe.proyecto_id, pe.modulo_key || ':' || s.sucursal, pe.accion
from public.permisos pe
join public.profiles p on p.id = pe.user_id
cross join (values ('Santiago'), ('Puerto Varas')) s(sucursal)
where pe.proyecto_id = public.adq_ancla_id() and pe.modulo_key ~ '^adq:[a-z_0-9]+$'
  and (p.sucursal is null or p.sucursal = s.sucursal)
  and not exists (select 1 from public.permisos x where x.user_id = pe.user_id and x.proyecto_id = pe.proyecto_id
                  and x.modulo_key = pe.modulo_key || ':' || s.sucursal and x.accion = pe.accion);
delete from public.permisos where proyecto_id = public.adq_ancla_id() and modulo_key ~ '^adq:[a-z_0-9]+$';

-- ---------------------------------------------------------------- roles por sucursal

-- p_sucursal null: en cualquier sucursal
create or replace function public.adq_usuario_tiene_en(p_rol text, p_user_id uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_es_admin(p_user_id) or exists (
    select 1 from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
    where pe.user_id = p_user_id and pe.proyecto_id = adq_ancla_id()
      and case when p_sucursal is null then pe.modulo_key like 'adq:' || p_rol || ':%'
               else pe.modulo_key = 'adq:' || p_rol || ':' || p_sucursal end)
$$;

create or replace function public.adq_usuario_tiene(p_rol text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_usuario_tiene_en(p_rol, p_user_id, null)
$$;

create or replace function public.adq_tiene_en(p_rol text, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_usuario_tiene_en(p_rol, auth.uid(), p_sucursal)
$$;

-- Nivel de aprobacion mas alto en la sucursal (null: en cualquiera). 0 = no aprueba.
create or replace function public.adq_usuario_nivel_en(p_user_id uuid, p_sucursal text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when adq_es_admin(p_user_id) then 3
    else coalesce((
      select max(substr(pe.modulo_key, 15, 1)::int)   -- 'adq:aprobador_<n>:<sucursal>'
      from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
      where pe.user_id = p_user_id and pe.proyecto_id = adq_ancla_id() and pe.modulo_key ~ '^adq:aprobador_[1-3]:'
        and (p_sucursal is null or pe.modulo_key like '%:' || p_sucursal)), 0)
  end
$$;

create or replace function public.adq_usuario_nivel(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select adq_usuario_nivel_en(p_user_id, null)
$$;

create or replace function public.adq_mi_nivel_en(p_sucursal text)
returns int language sql stable security definer set search_path = public as $$
  select adq_usuario_nivel_en(auth.uid(), p_sucursal)
$$;

-- Compras (comprador o jefe) de esa sucursal; null: de alguna
create or replace function public.adq_compras_de(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_tiene_en('jefe_compras', p_sucursal) or adq_tiene_en('comprador', p_sucursal)
$$;

create or replace function public.adq_es_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_compras_de(null)
$$;

create or replace function public.adq_puede_solicitar_en(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_tiene_en('solicitante', p_sucursal) or adq_tiene_en('bodega', p_sucursal) or adq_compras_de(p_sucursal)
$$;

-- Control (dashboard, presupuesto, reporte): compras o aprobadores de esa sucursal; null: de alguna
create or replace function public.adq_ve_control_en(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_compras_de(p_sucursal) or adq_mi_nivel_en(p_sucursal) > 0
$$;

create or replace function public.adq_ve_control()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_ve_control_en(null)
$$;

create or replace function public.adq_ve_reposicion_en(p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select adq_compras_de(p_sucursal) or adq_tiene_en('bodega', p_sucursal)
$$;

create or replace function public.adq_ve_reposicion()
returns boolean language sql stable security definer set search_path = public as $$
  select adq_ve_reposicion_en(null)
$$;

-- Personas con el rol explicito en la sucursal (null: en cualquiera), sin los admin implicitos
create or replace function public.adq_usuarios_con(p_rol text, p_sucursal text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct pe.user_id
  from permisos pe join profiles p on p.id = pe.user_id and coalesce(p.activo, true)
  where pe.proyecto_id = adq_ancla_id()
    and case when p_sucursal is null then pe.modulo_key like 'adq:' || p_rol || ':%'
             else pe.modulo_key = 'adq:' || p_rol || ':' || p_sucursal end
$$;

create or replace function public.adq_compras_ids(p_sucursal text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select array(select adq_usuarios_con('comprador', p_sucursal) union select adq_usuarios_con('jefe_compras', p_sucursal))
$$;

-- ---------------------------------------------------------------- quien ve y hace que

create or replace function public.adq_ve_fila(p_creado_por uuid, p_sucursal text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_creado_por = auth.uid() or adq_compras_de(p_sucursal) or adq_mi_nivel_en(p_sucursal) > 0
$$;

create or replace function public.adq_puede_aprobar(p_solicitud_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from adq_solicitudes s
    where s.id = p_solicitud_id and s.estado = 'en_aprobacion'
      and s.creado_por is distinct from auth.uid()
      and adq_mi_nivel_en(s.sucursal) >= s.nivel_aprobado + 1)
$$;

-- OC de SAP: sucursales de sus lineas (por CECO, o por bodega). Sin sucursal: cualquiera de Compras.
alter table public.sap_oc add column if not exists sucursales text[] not null default '{}';

create or replace function public.adq_ve_oc_compras(p_sucursales text[])
returns boolean language sql stable security definer set search_path = public as $$
  select case when cardinality(coalesce(p_sucursales, '{}')) = 0 then adq_es_compras()
              else exists (select 1 from unnest(p_sucursales) x where adq_compras_de(x)) end
$$;

-- Lineas y facturas de una OC: Compras de su sucursal, o quien ve una solicitud vinculada a ella
create or replace function public.adq_ve_oc_doc(p_doc_entry int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sap_oc o where o.doc_entry = p_doc_entry and adq_ve_oc_compras(o.sucursales))
      or adq_ve_oc_sap(p_doc_entry)
$$;

update public.sap_oc o set sucursales = coalesce((
  select array_agg(distinct x order by x) from (
    select coalesce(adq_ceco_sucursal(l.ceco), adq_bodega_sucursal(l.bodega)) as x
    from public.sap_oc_lineas l where l.doc_entry = o.doc_entry) s
  where x is not null), '{}');

-- ---------------------------------------------------------------- niveles por sucursal

alter table public.adq_niveles add column if not exists sucursal text;
update public.adq_niveles set sucursal = 'Santiago' where sucursal is null;
alter table public.adq_niveles alter column sucursal set not null;
do $$ begin
  alter table public.adq_niveles add constraint adq_niveles_sucursal_check check (sucursal in ('Santiago', 'Puerto Varas'));
exception when duplicate_object then null; end $$;
-- la llave pasa de (nivel) a (sucursal, nivel) antes de copiar los niveles a Puerto Varas
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'adq_niveles_pkey'
             and pg_get_constraintdef(oid) not like '%sucursal%') then
    alter table public.adq_niveles drop constraint adq_niveles_pkey;
    alter table public.adq_niveles add constraint adq_niveles_pkey primary key (sucursal, nivel);
  end if;
end $$;
insert into public.adq_niveles (nivel, nombre, monto_desde, activo, sucursal)
select n.nivel, n.nombre, n.monto_desde, n.activo, 'Puerto Varas'
from public.adq_niveles n
where n.sucursal = 'Santiago'
  and not exists (select 1 from public.adq_niveles x where x.sucursal = 'Puerto Varas' and x.nivel = n.nivel);

create or replace function public.adq_nivel_para(p_sucursal text, p_monto numeric)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(nivel), 1) from adq_niveles where sucursal = p_sucursal and activo and monto_desde <= coalesce(p_monto, 0)
$$;

-- p = [{sucursal, nivel, nombre, monto_desde, activo}, ...]: guarda todos juntos y valida al final
create or replace function public.adq_guardar_niveles(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from jsonb_array_elements(p) f where not adq_tiene_en('jefe_compras', f ->> 'sucursal')) then
    raise exception 'Solo el jefe de compras de la sucursal configura sus niveles' using errcode = '42501';
  end if;
  update adq_niveles n
  set nombre = btrim(f ->> 'nombre'),
      monto_desde = case when n.nivel = 1 then 0 else (f ->> 'monto_desde')::numeric end,
      activo = n.nivel = 1 or coalesce((f ->> 'activo')::boolean, true)
  from jsonb_array_elements(p) f
  where n.sucursal = f ->> 'sucursal' and n.nivel = (f ->> 'nivel')::int;
  if exists (select 1 from adq_niveles where btrim(nombre) = '') then
    raise exception 'Cada nivel necesita un nombre' using errcode = 'P0001';
  end if;
  if exists (select 1 from adq_niveles a join adq_niveles b on b.sucursal = a.sucursal and b.nivel > a.nivel
             where a.activo and b.activo and b.monto_desde <= a.monto_desde) then
    raise exception 'Cada nivel tiene que partir en un monto mayor que el anterior' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------- acciones que dependen del nivel

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
  if not adq_compras_de(s.sucursal) then raise exception 'Solo Compras de la sucursal envía a aprobación' using errcode = '42501'; end if;
  if s.estado <> 'cotizando' then raise exception 'La solicitud no está en cotización' using errcode = 'P0001'; end if;
  if not exists (select 1 from adq_items where solicitud_id = s.id) then
    raise exception 'La solicitud no tiene ítems' using errcode = 'P0001';
  end if;
  select * into c from adq_cotizaciones where id = p_cotizacion_id and solicitud_id = s.id;
  if not found then raise exception 'Elige una cotización de esta solicitud' using errcode = 'P0001'; end if;

  v_nivel := adq_nivel_para(s.sucursal, c.monto_neto);
  update adq_solicitudes
  set estado = 'en_aprobacion', cotizacion_id = c.id, monto_aprobacion = c.monto_neto,
      nivel_requerido = v_nivel, nivel_aprobado = 0, ronda = s.ronda + 1
  where id = s.id;
  insert into adq_bitacora (solicitud_id, user_id, texto)
  values (s.id, auth.uid(), 'Enviada a aprobación con ' || c.proveedor_nombre || ' · ' || adq_clp(c.monto_neto)
    || ' neto · requiere ' || (select string_agg(nombre, ', ' order by nivel) from adq_niveles
                               where sucursal = s.sucursal and nivel <= v_nivel and activo));
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
    raise exception 'Tu nivel de aprobación en % no alcanza', s.sucursal using errcode = '42501';
  end if;

  -- aprueba el nivel pendiente y los siguientes que le alcancen en esa sucursal
  v_hasta := least(adq_mi_nivel_en(s.sucursal), s.nivel_requerido);
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

drop function if exists public.adq_nivel_para(numeric);

-- ---------------------------------------------------------------- presupuesto y reposicion por sucursal

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
  where adq_ve_control_en(adq_ceco_sucursal(p_ceco))   -- solo control de la sucursal del CECO
$$;

create or replace function public.adq_presupuesto_solicitud(p_solicitud_id uuid)
returns table (centro_costo text, anio int, presupuesto numeric, ejecutado numeric, comprometido numeric, esta_incluida boolean)
language sql stable security definer set search_path = public as $$
  select s.centro_costo, x.anio, p.presupuesto, p.ejecutado, p.comprometido, s.estado in ('en_aprobacion', 'aprobada')
  from adq_solicitudes s
  cross join lateral (select extract(year from coalesce(s.enviada_at, s.created_at) at time zone 'America/Santiago')::int as anio) x
  cross join lateral adq_presupuesto_ceco(s.centro_costo, x.anio) p
  where s.id = p_solicitud_id and adq_ve(s.id) and adq_ve_control_en(s.sucursal)
$$;

create or replace function public.adq_guardar_presupuestos(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from jsonb_array_elements(p) f
             where not adq_tiene_en('jefe_compras', adq_ceco_sucursal(f ->> 'centro_costo'))) then
    raise exception 'Solo el jefe de compras de la sucursal del centro de costo carga su presupuesto' using errcode = '42501';
  end if;
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

create or replace function public.adq_guardar_reposicion(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from jsonb_array_elements(p) f
             where not adq_ve_reposicion_en(coalesce(adq_bodega_sucursal(f ->> 'bodega_codigo'), '-'))) then
    raise exception 'Solo Compras o Bodega de esa sucursal definen sus mínimos' using errcode = '42501';
  end if;
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

-- ---------------------------------------------------------------- sincronizacion: sucursales de cada OC

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

  update sap_oc o set cantidad_total = l.cantidad, cantidad_pendiente = l.pendiente, neto = l.neto, sucursales = l.sucursales
  from (select doc_entry, sum(cantidad) as cantidad, sum(pendiente) as pendiente, sum(total) as neto,
               coalesce(array_agg(distinct coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega))
                                  order by coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega)))
                        filter (where coalesce(adq_ceco_sucursal(ceco), adq_bodega_sucursal(bodega)) is not null), '{}') as sucursales
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

-- ---------------------------------------------------------------- vistas

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

drop view if exists public.adq_aprobaciones_v;
create view public.adq_aprobaciones_v as
select a.*, adq_nombre(a.user_id) as usuario_nombre, n.nombre as nivel_nombre
from adq_aprobaciones a
join adq_solicitudes s on s.id = a.solicitud_id
left join adq_niveles n on n.sucursal = s.sucursal and n.nivel = a.nivel
where adq_ve(a.solicitud_id);

drop view if exists public.adq_sap_oc_v;
create view public.adq_sap_oc_v as
select o.*,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  case when o.neto > 0 then least(100, round(100 * o.facturado / o.neto))::int end as facturado_pct,
  (select string_agg(distinct l.ceco, ', ') from sap_oc_lineas l where l.doc_entry = o.doc_entry) as cecos,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc o
where adq_ve_oc_compras(o.sucursales);

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
where adq_ve_control_en(coalesce(adq_ceco_sucursal(l.ceco), adq_bodega_sucursal(l.bodega)))
group by 1, 2, 3, 4, 5, 6, 7;

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
where adq_ve_control_en(coalesce(cc.sucursal, adq_ceco_sucursal(k.centro_costo)));

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
  where adq_ve_reposicion_en(adq_bodega_sucursal(k.bodega_codigo))
)
select b.*,
  b.en_stock - b.comprometido + b.pedido + b.en_solicitud as disponible,
  (b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo) as bajo_minimo,
  case when b.minimo is not null and b.en_stock - b.comprometido + b.pedido + b.en_solicitud < b.minimo then
    greatest(coalesce(b.reorden, 0), ceil(b.minimo + b.consumo_mensual - (b.en_stock - b.comprometido + b.pedido + b.en_solicitud)))
  end as sugerido,
  case when b.consumo_mensual > 0 then greatest(0, floor(30 * (b.en_stock - b.comprometido + b.pedido) / b.consumo_mensual))::int end as cobertura_dias
from base b;

-- ---------------------------------------------------------------- RLS

drop policy if exists adq_solicitudes_insert on public.adq_solicitudes;
create policy adq_solicitudes_insert on public.adq_solicitudes for insert to authenticated
  with check (adq_puede_solicitar_en(sucursal));
drop policy if exists adq_solicitudes_update on public.adq_solicitudes;
create policy adq_solicitudes_update on public.adq_solicitudes for update to authenticated
  using (estado = 'cotizando' and (creado_por = (select auth.uid()) or adq_compras_de(sucursal)))
  -- al cambiar el CECO no se puede llevar a una sucursal donde no se tiene rol
  with check (adq_puede_solicitar_en(sucursal) and (creado_por = (select auth.uid()) or adq_compras_de(sucursal)));

drop policy if exists sap_oc_select on public.sap_oc;
create policy sap_oc_select on public.sap_oc for select to authenticated using (adq_ve_oc_compras(sucursales));
drop policy if exists sap_oc_lineas_select on public.sap_oc_lineas;
create policy sap_oc_lineas_select on public.sap_oc_lineas for select to authenticated using (adq_ve_oc_doc(doc_entry));
drop policy if exists sap_oc_facturas_select on public.sap_oc_facturas;
create policy sap_oc_facturas_select on public.sap_oc_facturas for select to authenticated using (adq_ve_oc_doc(oc_doc_entry));
drop policy if exists sap_consumo_select on public.sap_consumo;
create policy sap_consumo_select on public.sap_consumo for select to authenticated
  using (adq_ve_reposicion_en(adq_bodega_sucursal(bodega_codigo)));
drop policy if exists adq_reposicion_select on public.adq_reposicion;
create policy adq_reposicion_select on public.adq_reposicion for select to authenticated
  using (adq_ve_reposicion_en(adq_bodega_sucursal(bodega_codigo)));
drop policy if exists adq_presupuestos_select on public.adq_presupuestos;
create policy adq_presupuestos_select on public.adq_presupuestos for select to authenticated
  using (adq_ve_control_en(adq_ceco_sucursal(centro_costo)));

-- ---------------------------------------------------------------- privilegios

revoke all on public.adq_solicitudes_v, public.adq_aprobaciones_v, public.adq_sap_oc_v, public.adq_gasto_v,
              public.adq_presupuesto_v, public.adq_reposicion_v from anon, authenticated;
grant select on public.adq_solicitudes_v, public.adq_aprobaciones_v, public.adq_sap_oc_v, public.adq_gasto_v,
                public.adq_presupuesto_v, public.adq_reposicion_v to authenticated;

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
  public.adq_tiene_en(text, text), public.adq_mi_nivel_en(text), public.adq_compras_de(text), public.adq_es_compras(),
  public.adq_puede_solicitar_en(text), public.adq_ve_control_en(text), public.adq_ve_control(),
  public.adq_ve_reposicion_en(text), public.adq_ve_reposicion(), public.adq_ve_fila(uuid, text), public.adq_puede_aprobar(uuid),
  public.adq_ve_oc_compras(text[]), public.adq_ve_oc_doc(int), public.adq_nivel_para(text, numeric),
  public.adq_guardar_niveles(jsonb), public.adq_enviar_aprobacion(uuid, uuid), public.adq_aprobar(uuid, text),
  public.adq_presupuesto_ceco(text, int), public.adq_presupuesto_solicitud(uuid),
  public.adq_guardar_presupuestos(jsonb), public.adq_guardar_reposicion(jsonb)
  to authenticated;
revoke execute on function
  public.adq_usuario_tiene_en(text, uuid, text), public.adq_usuario_tiene(text, uuid), public.adq_usuario_nivel_en(uuid, text),
  public.adq_usuario_nivel(uuid), public.adq_usuarios_con(text, text), public.adq_compras_ids(text)
  from authenticated;
revoke all on function public.sap_compras_sincronizar(jsonb) from public, anon, authenticated;
grant execute on function public.sap_compras_sincronizar(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

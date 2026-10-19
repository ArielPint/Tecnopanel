-- Portal Produccion: proyeccion mensual por linea de negocio, valorizada a precio de venta.
--
-- Replica la hoja "RESUMEN" de la planilla de programa de produccion (PROG PROD <MES> SEM_n.xlsx):
--   - por sucursal, mes y linea de negocio (CECO de SAP 11-18) un monto proyectado en pesos
--     (pnl_proy_mes) y los dias habiles de cada semana del mes (pnl_proy_dias; sin fila = lunes a viernes
--     sin feriados fijos, lo calcula la web). Las semanas van de lunes a domingo y se cortan en el
--     limite del mes: la semana del lunes 29-09 tiene una parte en septiembre y otra en octubre.
--   - lo producido de verdad, semana a semana, sobre las lineas de las ordenes de venta de SAP
--     (pnl_proy_avance: cantidad x precio neto de la OV = valor; cantidad x medida por unidad = ml, plg,
--     m2...). Tecno Home va por % de avance acumulado de cada linea (cantidad = avance de la semana x
--     cantidad de la OV). Lo que no tiene OV va como monto manual por linea (pnl_proy_manual).
--   - lo facturado en SAP en el mes por linea (pnl_proy_facturado, desde sap_ventas: solo existe en el
--     servidor; en Supabase devuelve vacio).
--
-- Lineas de OV (pnl_proy_ov): las de todas las lineas de negocio, OV no canceladas abiertas o de los
-- ultimos 12 meses, con precio. Las trae stack\tareas\sincronizar-sap-sip.ps1 con
-- pnl_proy_sincronizar_ov (reemplaza todo). La linea de negocio y la sucursal salen del CECO de la
-- linea (dimension 1: 2 primeros digitos = linea, ultimo 1 = Santiago, 2 = Puerto Varas).
-- La medida por unidad sale de la Estructura de proyecto (@EST_PROY_DET): la maquila del mismo tipo de
-- vivienda + tipo (U_TipoVivienda / U_TipoEstructura de la linea) que este en pnl_proy_medidas
-- (6501140 = ml de panel metalico, 6501137 = pulgadas de cercha, 6501149 = m2 de panel SIP...).
-- Un kit con precio cuyas lineas siguientes vienen a $0 (kit de paneles metalicos) suma la medida de
-- esos componentes por kit. Si no hay medida, se puede escribir a mano (pnl_proy_ov_medida) y si no,
-- cuenta la cantidad de la OV en su unidad.
--
-- Accesos nuevos (permisos.modulo_key):
--   pnl:proyeccion  ver | crear (registrar lo producido) | editar (proyeccion del mes, dias habiles,
--                   medidas y corregir lo producido de otros) | exportar
--
-- Va DESPUES de 20261024120000_produccion_sip_recetas_of.sql. No redefine funciones ni vistas de las
-- migraciones anteriores. Re-ejecutable. Funciona igual en Supabase y en el servidor propio.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- catalogos

create table if not exists public.pnl_proy_lineas (
  codigo text primary key check (codigo ~ '^1[1-8]$'),   -- 2 primeros digitos del CECO
  nombre text not null,                                   -- igual que sap_ventas.linea
  orden int not null default 0
);
insert into public.pnl_proy_lineas (codigo, nombre, orden) values
  ('11', 'SIP', 1), ('12', 'Madera', 2), ('13', 'Acero', 3), ('14', 'Escaleras', 4), ('15', 'Wall', 5),
  ('16', 'Tecno Home', 6), ('17', 'Viv. Ind. Panelizada', 7), ('18', 'Viv. Ind. Modular', 8)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

-- Maquilas de la Estructura de proyecto que dan la medida de lo producido. Si una linea de OV tiene
-- varias, gana la de menor prioridad.
create table if not exists public.pnl_proy_medidas (
  articulo text primary key,                 -- ItemCode de la maquila
  descripcion text not null default '',
  unidad text not null check (btrim(unidad) <> ''),
  prioridad int not null default 100,
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.pnl_proy_medidas (articulo, descripcion, unidad, prioridad) values
  ('6501140', 'MAQUILA FAB.PANEL METAL', 'ml', 10),
  ('6501160', 'MAQUILA FAB. PN METAL EXTERNO RAICES', 'ml', 11),
  ('6501137', 'MAQUILA FAB. CERCHA MADERA', 'plg', 20),
  ('6501138', 'MAQUILA FAB. PANEL MADERA', 'm²', 21),
  ('6501170', 'MAQUILA FAB. PANEL TECNO KIT (M2)', 'm²', 22),
  ('6501173', 'MAQUILA FAB. PANEL TORRES (m2)', 'm²', 23),
  ('6501149', 'MAQUILA CORTE PANEL SIP OSB', 'm²', 30),
  ('6501150', 'MAQUILA CORTE PANEL SIP SP', 'm²', 31),
  ('6501157', 'MAQUILA CORTE PANEL SIP PROYECTO INDIVIDUAL', 'm²', 32)
on conflict (articulo) do nothing;

-- ---------------------------------------------------------------- lineas de OV de SAP

create table if not exists public.pnl_proy_ov (
  doc_entry int not null,                    -- ORDR.DocEntry
  linea int not null,                        -- RDR1.LineNum
  doc_num int not null,                      -- N de la OV
  fecha date,
  estado text,                               -- O abierta | C cerrada
  proyecto_codigo text not null default '',
  proyecto_nombre text,
  cliente text,
  ceco text not null default '',
  linea_codigo text not null references public.pnl_proy_lineas(codigo),
  sucursal text check (sucursal in ('Santiago', 'Puerto Varas')),
  articulo text,
  descripcion text not null default '',
  tipo_vivienda text not null default '',
  tipo_estructura text not null default '',
  unidad text,                               -- unidad de la OV (UNIDAD, PZA...)
  cantidad numeric(18,4) not null default 0,
  entregada numeric(18,4) not null default 0,
  pendiente numeric(18,4) not null default 0,
  precio numeric(18,4) not null,             -- neto por unidad, en pesos (con descuento de cabecera)
  total numeric(18,2) not null default 0,
  medida numeric(18,4),                      -- por unidad, segun la estructura (null = sin medida)
  medida_unidad text,
  medida_origen text check (medida_origen in ('estructura', 'kit')),
  sincronizado_at timestamptz not null default now(),
  primary key (doc_entry, linea)
);
create index if not exists pnl_proy_ov_linea_idx on public.pnl_proy_ov (linea_codigo, sucursal);

-- Medida por unidad escrita a mano (cuando la estructura no la trae o trae otra)
create table if not exists public.pnl_proy_ov_medida (
  doc_entry int not null,
  linea int not null,
  medida numeric(18,4) not null check (medida >= 0),
  unidad text not null check (btrim(unidad) <> ''),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (doc_entry, linea)
);

-- ---------------------------------------------------------------- proyeccion y dias habiles

create table if not exists public.pnl_proy_mes (
  id uuid primary key default gen_random_uuid(),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  mes date not null check (extract(day from mes) = 1),
  linea_codigo text not null references public.pnl_proy_lineas(codigo),
  monto numeric(18,2) not null check (monto >= 0),
  nota text,
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (sucursal, mes, linea_codigo)
);

create table if not exists public.pnl_proy_dias (
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  mes date not null check (extract(day from mes) = 1),
  semana date not null check (extract(isodow from semana) = 1),
  dias numeric(3,1) not null check (dias between 0 and 7),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (sucursal, mes, semana),
  check (semana <= (mes + interval '1 month - 1 day')::date and semana + 6 >= mes)
);

-- ---------------------------------------------------------------- lo producido

create table if not exists public.pnl_proy_avance (
  id uuid primary key default gen_random_uuid(),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  mes date not null check (extract(day from mes) = 1),
  semana date not null check (extract(isodow from semana) = 1),
  doc_entry int not null,
  linea int not null,
  -- copia de la linea de OV al guardar: el registro no cambia si SAP la cierra o la borra
  doc_num int not null,
  proyecto_codigo text not null default '',
  proyecto_nombre text,
  cliente text,
  descripcion text not null default '',
  linea_codigo text not null references public.pnl_proy_lineas(codigo),
  precio numeric(18,4) not null,
  medida numeric(18,4),
  unidad text,
  cantidad numeric(18,4) not null check (cantidad >= 0),
  avance_pct numeric(7,4) check (avance_pct between 0 and 1),   -- % acumulado (Tecno Home)
  valor numeric(18,2) generated always as (round(cantidad * precio, 2)) stored,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (sucursal, mes, semana, doc_entry, linea),
  check (semana <= (mes + interval '1 month - 1 day')::date and semana + 6 >= mes)
);
create index if not exists pnl_proy_avance_mes_idx on public.pnl_proy_avance (mes, sucursal);
create index if not exists pnl_proy_avance_ov_idx on public.pnl_proy_avance (doc_entry, linea);

create table if not exists public.pnl_proy_manual (
  id uuid primary key default gen_random_uuid(),
  sucursal text not null check (sucursal in ('Santiago', 'Puerto Varas')),
  mes date not null check (extract(day from mes) = 1),
  semana date not null check (extract(isodow from semana) = 1),
  linea_codigo text not null references public.pnl_proy_lineas(codigo),
  glosa text not null check (btrim(glosa) <> ''),
  cantidad numeric(18,4) check (cantidad >= 0),
  unidad text,
  monto numeric(18,2) not null check (monto >= 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (semana <= (mes + interval '1 month - 1 day')::date and semana + 6 >= mes),
  check (cantidad is null or nullif(btrim(unidad), '') is not null)
);
create index if not exists pnl_proy_manual_mes_idx on public.pnl_proy_manual (mes, sucursal);

-- ---------------------------------------------------------------- RLS

alter table public.pnl_proy_lineas enable row level security;
alter table public.pnl_proy_medidas enable row level security;
alter table public.pnl_proy_ov enable row level security;
alter table public.pnl_proy_ov_medida enable row level security;
alter table public.pnl_proy_mes enable row level security;
alter table public.pnl_proy_dias enable row level security;
alter table public.pnl_proy_avance enable row level security;
alter table public.pnl_proy_manual enable row level security;

drop policy if exists pnl_proy_lineas_select on public.pnl_proy_lineas;
create policy pnl_proy_lineas_select on public.pnl_proy_lineas for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')));

drop policy if exists pnl_proy_medidas_select on public.pnl_proy_medidas;
create policy pnl_proy_medidas_select on public.pnl_proy_medidas for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')));
drop policy if exists pnl_proy_medidas_write on public.pnl_proy_medidas;
create policy pnl_proy_medidas_write on public.pnl_proy_medidas for all to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'editar')))
  with check ((select pnl_puede_modulo('proyeccion', 'editar')));

-- Lineas de OV sin sucursal (CECO sin el digito) las ve cualquiera con acceso
drop policy if exists pnl_proy_ov_select on public.pnl_proy_ov;
create policy pnl_proy_ov_select on public.pnl_proy_ov for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')) and (sucursal is null or has_sucursal(sucursal)));

drop policy if exists pnl_proy_ov_medida_select on public.pnl_proy_ov_medida;
create policy pnl_proy_ov_medida_select on public.pnl_proy_ov_medida for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')));
-- la escribe pnl_proy_guardar_semana (crear) o el editor

drop policy if exists pnl_proy_mes_select on public.pnl_proy_mes;
create policy pnl_proy_mes_select on public.pnl_proy_mes for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')) and has_sucursal(sucursal));
drop policy if exists pnl_proy_mes_write on public.pnl_proy_mes;
create policy pnl_proy_mes_write on public.pnl_proy_mes for all to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'editar')) and has_sucursal(sucursal))
  with check ((select pnl_puede_modulo('proyeccion', 'editar')) and has_sucursal(sucursal));

drop policy if exists pnl_proy_dias_select on public.pnl_proy_dias;
create policy pnl_proy_dias_select on public.pnl_proy_dias for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')) and has_sucursal(sucursal));
drop policy if exists pnl_proy_dias_write on public.pnl_proy_dias;
create policy pnl_proy_dias_write on public.pnl_proy_dias for all to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'editar')) and has_sucursal(sucursal))
  with check ((select pnl_puede_modulo('proyeccion', 'editar')) and has_sucursal(sucursal));

-- Lo producido se escribe solo con pnl_proy_guardar_semana (security definer, valida permisos)
drop policy if exists pnl_proy_avance_select on public.pnl_proy_avance;
create policy pnl_proy_avance_select on public.pnl_proy_avance for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')) and has_sucursal(sucursal));
drop policy if exists pnl_proy_manual_select on public.pnl_proy_manual;
create policy pnl_proy_manual_select on public.pnl_proy_manual for select to authenticated
  using ((select pnl_puede_modulo('proyeccion', 'ver')) and has_sucursal(sucursal));

revoke insert, update, delete on public.pnl_proy_lineas, public.pnl_proy_ov, public.pnl_proy_ov_medida,
  public.pnl_proy_avance, public.pnl_proy_manual from anon, authenticated;
revoke all on public.pnl_proy_lineas, public.pnl_proy_medidas, public.pnl_proy_ov, public.pnl_proy_ov_medida,
  public.pnl_proy_mes, public.pnl_proy_dias, public.pnl_proy_avance, public.pnl_proy_manual from anon;
grant select on public.pnl_proy_lineas, public.pnl_proy_medidas, public.pnl_proy_ov, public.pnl_proy_ov_medida,
  public.pnl_proy_mes, public.pnl_proy_dias, public.pnl_proy_avance, public.pnl_proy_manual to authenticated;
grant insert, update, delete on public.pnl_proy_medidas, public.pnl_proy_mes, public.pnl_proy_dias to authenticated;

-- ---------------------------------------------------------------- guardar una semana

-- Reemplaza lo producido de una sucursal en una semana del mes: lo que no viene se borra.
-- p_avance: [{doc_entry, linea, cantidad, avance_pct?, medida?, unidad?}]  (medida/unidad = escrita a mano)
-- p_manual: [{linea_codigo, glosa, cantidad?, unidad?, monto}]
-- Con 'crear' solo se tocan los registros propios; con 'editar', los de todos.
create or replace function public.pnl_proy_guardar_semana(p_sucursal text, p_mes date, p_semana date, p_avance jsonb, p_manual jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_editar boolean := pnl_puede_modulo('proyeccion', 'editar');
  v_yo uuid := auth.uid();
  n_av int; n_man int;
begin
  perform pnl_validar_sucursal(p_sucursal);
  if not (v_editar or pnl_puede_modulo('proyeccion', 'crear')) then
    raise exception 'No tienes permiso para registrar lo producido' using errcode = '42501';
  end if;
  if p_mes is null or extract(day from p_mes) <> 1 then
    raise exception 'El mes debe ser el día 1' using errcode = 'P0001';
  end if;
  if p_semana is null or extract(isodow from p_semana) <> 1
     or p_semana > (p_mes + interval '1 month - 1 day')::date or p_semana + 6 < p_mes then
    raise exception 'La semana no es de ese mes' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_avance, '[]')) <> 'array' or jsonb_typeof(coalesce(p_manual, '[]')) <> 'array' then
    raise exception 'Formato inválido' using errcode = 'P0001';
  end if;
  p_avance := coalesce(p_avance, '[]'); p_manual := coalesce(p_manual, '[]');

  if exists (select 1 from jsonb_to_recordset(p_avance) x(doc_entry int, linea int)
             group by x.doc_entry, x.linea having count(*) > 1) then
    raise exception 'Hay una línea de OV repetida' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_avance) x(cantidad numeric, avance_pct numeric, medida numeric)
             where x.cantidad is null or x.cantidad < 0 or x.avance_pct < 0 or x.avance_pct > 1 or x.medida < 0) then
    raise exception 'Las cantidades no pueden ser negativas y el avance va de 0 a 100%%' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_manual) x(linea_codigo text, glosa text, cantidad numeric, unidad text, monto numeric)
             where x.linea_codigo is null or nullif(btrim(x.glosa), '') is null or x.monto is null or x.monto < 0
                or x.cantidad < 0 or (x.cantidad is not null and nullif(btrim(x.unidad), '') is null)) then
    raise exception 'Cada monto manual necesita línea, glosa y monto (y unidad si lleva cantidad)' using errcode = 'P0001';
  end if;

  -- solo los registros que el usuario puede tocar
  if not v_editar and exists (
    select 1 from pnl_proy_avance a
    join jsonb_to_recordset(p_avance) x(doc_entry int, linea int) on x.doc_entry = a.doc_entry and x.linea = a.linea
    where a.sucursal = p_sucursal and a.mes = p_mes and a.semana = p_semana and a.created_by is distinct from v_yo) then
    raise exception 'Una de las líneas ya la registró otra persona: pide a quien corrige la proyección que la cambie' using errcode = '42501';
  end if;

  -- medidas escritas a mano
  insert into pnl_proy_ov_medida (doc_entry, linea, medida, unidad, updated_by, updated_at)
  select x.doc_entry, x.linea, x.medida, btrim(x.unidad), v_yo, now()
  from jsonb_to_recordset(p_avance) x(doc_entry int, linea int, medida numeric, unidad text)
  where x.medida is not null and nullif(btrim(x.unidad), '') is not null
  on conflict (doc_entry, linea) do update set medida = excluded.medida, unidad = excluded.unidad,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at
  where (pnl_proy_ov_medida.medida, pnl_proy_ov_medida.unidad) is distinct from (excluded.medida, excluded.unidad);

  delete from pnl_proy_avance a
  where a.sucursal = p_sucursal and a.mes = p_mes and a.semana = p_semana
    and (v_editar or a.created_by = v_yo)
    and not exists (select 1 from jsonb_to_recordset(p_avance) x(doc_entry int, linea int, cantidad numeric, avance_pct numeric)
                    where x.doc_entry = a.doc_entry and x.linea = a.linea and (x.cantidad > 0 or x.avance_pct is not null));

  -- lineas que ya no estan en SAP: se conserva la copia guardada
  if exists (select 1 from jsonb_to_recordset(p_avance) x(doc_entry int, linea int)
             where not exists (select 1 from pnl_proy_ov o where o.doc_entry = x.doc_entry and o.linea = x.linea)
               and not exists (select 1 from pnl_proy_avance a where a.doc_entry = x.doc_entry and a.linea = x.linea
                               and a.sucursal = p_sucursal and a.mes = p_mes and a.semana = p_semana)) then
    raise exception 'Una de las líneas de OV ya no está en SAP: actualiza la página' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_avance) x(doc_entry int, linea int)
             join pnl_proy_ov o on o.doc_entry = x.doc_entry and o.linea = x.linea
             where o.sucursal is not null and o.sucursal <> p_sucursal) then
    raise exception 'Una de las líneas de OV es de la otra sucursal' using errcode = 'P0001';
  end if;

  update pnl_proy_avance a set cantidad = x.cantidad, avance_pct = x.avance_pct, updated_by = v_yo, updated_at = now(),
    medida = coalesce(m.medida, a.medida), unidad = coalesce(m.unidad, a.unidad)
  from jsonb_to_recordset(p_avance) x(doc_entry int, linea int, cantidad numeric, avance_pct numeric)
  left join pnl_proy_ov_medida m on m.doc_entry = x.doc_entry and m.linea = x.linea
  where a.doc_entry = x.doc_entry and a.linea = x.linea
    and a.sucursal = p_sucursal and a.mes = p_mes and a.semana = p_semana
    and (a.cantidad, a.avance_pct, a.medida, a.unidad) is distinct from (x.cantidad, x.avance_pct, coalesce(m.medida, a.medida), coalesce(m.unidad, a.unidad));

  insert into pnl_proy_avance (sucursal, mes, semana, doc_entry, linea, doc_num, proyecto_codigo, proyecto_nombre, cliente,
                               descripcion, linea_codigo, precio, medida, unidad, cantidad, avance_pct, created_by, updated_by)
  select p_sucursal, p_mes, p_semana, o.doc_entry, o.linea, o.doc_num, o.proyecto_codigo, o.proyecto_nombre, o.cliente,
         o.descripcion, o.linea_codigo, o.precio,
         coalesce(m.medida, o.medida, 1), coalesce(m.unidad, o.medida_unidad, lower(coalesce(o.unidad, 'un'))),
         x.cantidad, x.avance_pct, v_yo, v_yo
  from jsonb_to_recordset(p_avance) x(doc_entry int, linea int, cantidad numeric, avance_pct numeric)
  join pnl_proy_ov o on o.doc_entry = x.doc_entry and o.linea = x.linea
  left join pnl_proy_ov_medida m on m.doc_entry = x.doc_entry and m.linea = x.linea
  where (x.cantidad > 0 or x.avance_pct is not null)
  on conflict (sucursal, mes, semana, doc_entry, linea) do nothing;

  -- montos manuales: se reemplazan los propios (o todos, con editar)
  delete from pnl_proy_manual a
  where a.sucursal = p_sucursal and a.mes = p_mes and a.semana = p_semana and (v_editar or a.created_by = v_yo);
  insert into pnl_proy_manual (sucursal, mes, semana, linea_codigo, glosa, cantidad, unidad, monto, created_by, updated_by)
  select p_sucursal, p_mes, p_semana, x.linea_codigo, btrim(x.glosa), x.cantidad, nullif(btrim(x.unidad), ''), x.monto, v_yo, v_yo
  from jsonb_to_recordset(p_manual) x(linea_codigo text, glosa text, cantidad numeric, unidad text, monto numeric);

  select count(*) into n_av from pnl_proy_avance where sucursal = p_sucursal and mes = p_mes and semana = p_semana;
  select count(*) into n_man from pnl_proy_manual where sucursal = p_sucursal and mes = p_mes and semana = p_semana;
  return jsonb_build_object('avance', n_av, 'manual', n_man);
end $$;
revoke execute on function public.pnl_proy_guardar_semana(text, date, date, jsonb, jsonb) from public, anon;
grant  execute on function public.pnl_proy_guardar_semana(text, date, date, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- facturado en SAP

-- Venta neta del libro de ventas de SAP (sap_ventas: facturas + anticipos - notas de credito) del mes,
-- por linea y sucursal. sap_ventas solo existe en el servidor: en Supabase devuelve vacio.
create or replace function public.pnl_proy_facturado(p_mes date)
returns table (linea_codigo text, sucursal text, monto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not pnl_puede_modulo('proyeccion', 'ver') or to_regclass('public.sap_ventas') is null then
    return;
  end if;
  return query execute $q$
    select left(v.ceco, 2) as linea_codigo, v.sucursal, sum(v.monto_neto)::numeric as monto
    from public.sap_ventas v
    where v.periodo = $1 and left(v.ceco, 2) in (select codigo from public.pnl_proy_lineas)
      and v.sucursal is not null and public.has_sucursal(v.sucursal)
    group by 1, 2
  $q$ using date_trunc('month', p_mes)::date;
end $$;
revoke execute on function public.pnl_proy_facturado(date) from public, anon;
grant  execute on function public.pnl_proy_facturado(date) to authenticated;

-- ---------------------------------------------------------------- sincronizacion desde SAP

-- p: {lineas: [{doc_entry, linea, doc_num, fecha, estado, proyecto_codigo, proyecto_nombre, cliente, ceco,
--     articulo, descripcion, tipo_vivienda, tipo_estructura, unidad, cantidad, entregada, pendiente, total}],
--     estructura: [{proyecto, tipo_vivienda, tipo, articulo, cantidad}]}
-- lineas trae tambien las de $0 (componentes de kit); solo se guardan las de precio > 0 con linea de
-- negocio. Reemplaza todo.
create or replace function public.pnl_proy_sincronizar_ov(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_borradas int; n int; n_medida int;
begin
  if coalesce(jsonb_array_length(p->'lineas'), 0) = 0 then
    raise exception 'La sincronización no trae líneas de OV: no se cambia nada' using errcode = 'P0001';
  end if;

  create temp table _ov on commit drop as
  select (e->>'doc_entry')::int as doc_entry, (e->>'linea')::int as linea, (e->>'doc_num')::int as doc_num,
         (e->>'fecha')::date as fecha, e->>'estado' as estado, coalesce(e->>'proyecto_codigo', '') as proyecto_codigo,
         nullif(e->>'proyecto_nombre', '') as proyecto_nombre, nullif(e->>'cliente', '') as cliente,
         coalesce(e->>'ceco', '') as ceco, e->>'articulo' as articulo, coalesce(e->>'descripcion', '') as descripcion,
         btrim(coalesce(e->>'tipo_vivienda', '')) as tipo_vivienda, btrim(coalesce(e->>'tipo_estructura', '')) as tipo_estructura,
         nullif(e->>'unidad', '') as unidad, coalesce((e->>'cantidad')::numeric, 0) as cantidad,
         coalesce((e->>'entregada')::numeric, 0) as entregada, coalesce((e->>'pendiente')::numeric, 0) as pendiente,
         coalesce((e->>'total')::numeric, 0) as total
  from jsonb_array_elements(p->'lineas') e;

  -- medida directa: la maquila de mayor prioridad del mismo proyecto + tipo de vivienda + tipo
  create temp table _med on commit drop as
  select distinct on (o.doc_entry, o.linea) o.doc_entry, o.linea, (d->>'cantidad')::numeric as medida, m.unidad
  from _ov o
  join jsonb_array_elements(coalesce(p->'estructura', '[]')) d
    on d->>'proyecto' = o.proyecto_codigo and btrim(d->>'tipo_vivienda') = o.tipo_vivienda and btrim(d->>'tipo') = o.tipo_estructura
  join pnl_proy_medidas m on m.articulo = d->>'articulo'
  where o.tipo_estructura <> '' and coalesce((d->>'cantidad')::numeric, 0) > 0
  order by o.doc_entry, o.linea, m.prioridad, m.articulo;

  delete from pnl_proy_ov;
  get diagnostics n_borradas = row_count;

  insert into pnl_proy_ov (doc_entry, linea, doc_num, fecha, estado, proyecto_codigo, proyecto_nombre, cliente, ceco,
                           linea_codigo, sucursal, articulo, descripcion, tipo_vivienda, tipo_estructura, unidad,
                           cantidad, entregada, pendiente, precio, total, medida, medida_unidad, medida_origen, sincronizado_at)
  with g as (
    -- cada linea de $0 pertenece al kit (linea con precio) que la antecede en la misma OV
    select o.*, sum(case when o.total > 0 then 1 else 0 end) over (partition by o.doc_entry order by o.linea) as grupo
    from _ov o
  ), kit as (
    -- medida del kit = suma de sus componentes de $0 con medida, por kit (misma unidad, la mas frecuente)
    select k.doc_entry, k.linea, x.unidad, sum(c.cantidad / nullif(k.cantidad, 0) * x.medida) as medida
    from g k
    join g c on c.doc_entry = k.doc_entry and c.grupo = k.grupo and c.total = 0 and c.linea > k.linea
                and c.tipo_vivienda = k.tipo_vivienda
    join _med x on x.doc_entry = c.doc_entry and x.linea = c.linea
    where k.total > 0
    group by k.doc_entry, k.linea, x.unidad
  ), kit1 as (
    select distinct on (doc_entry, linea) * from kit order by doc_entry, linea, medida desc
  )
  select o.doc_entry, o.linea, o.doc_num, o.fecha, o.estado, o.proyecto_codigo, o.proyecto_nombre, o.cliente, o.ceco,
         left(o.ceco, 2), case right(o.ceco, 1) when '1' then 'Santiago' when '2' then 'Puerto Varas' end,
         o.articulo, o.descripcion, o.tipo_vivienda, o.tipo_estructura, o.unidad,
         o.cantidad, o.entregada, o.pendiente, round(o.total / o.cantidad, 4), o.total,
         round(coalesce(x.medida, k.medida), 4), coalesce(x.unidad, k.unidad),
         case when x.medida is not null then 'estructura' when k.medida is not null then 'kit' end, now()
  from _ov o
  left join _med x on x.doc_entry = o.doc_entry and x.linea = o.linea
  left join kit1 k on k.doc_entry = o.doc_entry and k.linea = o.linea
  where o.total > 0 and o.cantidad > 0 and left(o.ceco, 2) in (select codigo from pnl_proy_lineas);
  get diagnostics n = row_count;
  select count(*) into n_medida from pnl_proy_ov where medida is not null;

  return jsonb_build_object('lineas_proyeccion', n, 'con_medida', n_medida, 'reemplazadas', n_borradas);
end $$;
revoke execute on function public.pnl_proy_sincronizar_ov(jsonb) from public, anon, authenticated;
grant  execute on function public.pnl_proy_sincronizar_ov(jsonb) to service_role;

-- ---------------------------------------------------------------- vistas

-- pnl_nombre_usuario exige ver la produccion SIP: aqui basta con ver la proyeccion
create or replace function public.pnl_proy_nombre_usuario(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email)
  from profiles p where p.id = p_user_id and pnl_puede_modulo('proyeccion', 'ver')
$$;
revoke execute on function public.pnl_proy_nombre_usuario(uuid) from public, anon;
grant  execute on function public.pnl_proy_nombre_usuario(uuid) to authenticated;

create or replace view public.pnl_proy_ov_v with (security_invoker = true) as
select o.*, m.medida as medida_manual, m.unidad as unidad_manual,
       coalesce(m.medida, o.medida) as medida_efectiva,
       coalesce(m.unidad, o.medida_unidad, lower(coalesce(o.unidad, 'un'))) as unidad_efectiva
from public.pnl_proy_ov o
left join public.pnl_proy_ov_medida m on m.doc_entry = o.doc_entry and m.linea = o.linea;

create or replace view public.pnl_proy_avance_v with (security_invoker = true) as
select a.*, round(a.cantidad * coalesce(a.medida, 1), 4) as medida_total,
       pnl_proy_nombre_usuario(a.updated_by) as actualizado_por
from public.pnl_proy_avance a;

create or replace view public.pnl_proy_manual_v with (security_invoker = true) as
select m.*, pnl_proy_nombre_usuario(m.updated_by) as actualizado_por
from public.pnl_proy_manual m;

grant select on public.pnl_proy_ov_v, public.pnl_proy_avance_v, public.pnl_proy_manual_v to authenticated;

notify pgrst, 'reload schema';

commit;

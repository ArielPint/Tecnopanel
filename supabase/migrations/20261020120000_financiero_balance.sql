-- Portal Financiero: Balance general (consolidado, estructura de SAP) y Estado de situación financiera
-- clasificado según IFRS (NIC 1). SOLO EN EL SERVIDOR; va después de 20261019120000_financiero_sap.sql.
--
-- De dónde sale el saldo: SAP cierra el ejercicio dejando TODAS las cuentas en cero (asientos de cierre,
-- TransType -3, el último día del periodo) y las repone al día siguiente (apertura, -2). En 2022 hubo un
-- cierre extra a fines de enero. Por eso el saldo de una cuenta al cierre del mes M es la suma de todos
-- sus movimientos hasta M SIN el asiento de cierre del propio mes M (el de meses anteriores sí, porque
-- la apertura siguiente lo compensa). Con esa regla la suma de todas las cuentas es cero: las de
-- resultado (grupos 4 a 8) suman el resultado del ejercicio aún no cerrado, que va al patrimonio.
--
--   fin_bal_saldos    movimientos por mes, cuenta y clase (normal, apertura, cierre), TODOS los grupos
--   fin_bal_asientos  líneas de asiento de las cuentas de balance (grupos 1 a 3), para ver el mayor
--   fin_ifrs_rubros   rubros del estado de situación financiera clasificado (taxonomía CMF, NIC 1)
--   fin_ifrs_mapeo    cuenta de SAP -> rubro IFRS. La sincronización propone la clasificación de cada
--                     cuenta nueva (fin_ifrs_proponer); quien tenga fin:configurar la corrige en el portal
--                     y la sincronización ya no la toca.
-- Acceso: informe Balance en alguna sucursal (el balance es de toda la empresa; no tiene sucursal).
--
-- Re-ejecutable.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- tablas

create table if not exists public.fin_bal_saldos (
  periodo  date not null,
  cuenta   text not null,
  clase    text not null check (clase in ('normal', 'apertura', 'cierre')),
  debe     numeric(18, 2) not null,
  haber    numeric(18, 2) not null,
  lineas   integer not null,
  primary key (periodo, cuenta, clase)
);

create table if not exists public.fin_bal_asientos (
  trans_id    integer not null,
  linea_id    integer not null,
  periodo     date    not null,
  fecha       date    not null,
  numero      integer,
  tipo_trans  text    not null,
  clase       text    not null check (clase in ('normal', 'apertura', 'cierre')),
  referencia  text,
  glosa       text,
  cuenta      text    not null,
  ceco        text    not null default '',
  proyecto    text    not null default '',
  debe        numeric(16, 2) not null,
  haber       numeric(16, 2) not null,
  primary key (trans_id, linea_id)
);
create index if not exists fin_bal_asientos_cuenta_idx on public.fin_bal_asientos (cuenta, periodo);

create table if not exists public.fin_ifrs_rubros (
  codigo   text primary key,
  nombre   text not null,
  seccion  text not null check (seccion in ('activo_corriente', 'activo_no_corriente', 'pasivo_corriente',
                                            'pasivo_no_corriente', 'patrimonio')),
  orden    integer not null
);

create table if not exists public.fin_ifrs_mapeo (
  cuenta           text primary key,
  rubro            text references public.fin_ifrs_rubros (codigo),
  rubro_propuesto  text references public.fin_ifrs_rubros (codigo),
  revisado         boolean not null default false,   -- true = lo fijó una persona (la sincronización no lo cambia)
  actualizado_por  uuid references auth.users (id) on delete set null,
  actualizado_en   timestamptz not null default now()
);

-- Rubros del estado de situación financiera clasificado (NIC 1 / taxonomía IFRS de la CMF)
insert into public.fin_ifrs_rubros (codigo, nombre, seccion, orden) values
  ('ac_efectivo',       'Efectivo y equivalentes al efectivo',                                   'activo_corriente',    10),
  ('ac_otros_fin',      'Otros activos financieros corrientes',                                  'activo_corriente',    20),
  ('ac_otros_no_fin',   'Otros activos no financieros corrientes',                               'activo_corriente',    30),
  ('ac_deudores',       'Deudores comerciales y otras cuentas por cobrar corrientes',            'activo_corriente',    40),
  ('ac_relacionadas',   'Cuentas por cobrar a entidades relacionadas, corrientes',               'activo_corriente',    50),
  ('ac_inventarios',    'Inventarios corrientes',                                                'activo_corriente',    60),
  ('ac_impuestos',      'Activos por impuestos corrientes, corrientes',                          'activo_corriente',    70),
  ('anc_otros_fin',     'Otros activos financieros no corrientes',                               'activo_no_corriente', 110),
  ('anc_otros_no_fin',  'Otros activos no financieros no corrientes',                            'activo_no_corriente', 120),
  ('anc_cxc',           'Cuentas por cobrar no corrientes',                                      'activo_no_corriente', 130),
  ('anc_inversiones',   'Inversiones contabilizadas utilizando el método de la participación',   'activo_no_corriente', 140),
  ('anc_intangibles',   'Activos intangibles distintos de la plusvalía',                         'activo_no_corriente', 150),
  ('anc_ppe',           'Propiedades, planta y equipo',                                          'activo_no_corriente', 160),
  ('anc_derecho_uso',   'Activos por derecho de uso',                                            'activo_no_corriente', 170),
  ('anc_imp_diferidos', 'Activos por impuestos diferidos',                                       'activo_no_corriente', 180),
  ('pc_otros_fin',      'Otros pasivos financieros corrientes',                                  'pasivo_corriente',    210),
  ('pc_arrendamiento',  'Pasivos por arrendamientos corrientes',                                 'pasivo_corriente',    220),
  ('pc_cxp',            'Cuentas por pagar comerciales y otras cuentas por pagar',               'pasivo_corriente',    230),
  ('pc_relacionadas',   'Cuentas por pagar a entidades relacionadas, corrientes',                'pasivo_corriente',    240),
  ('pc_otras_prov',     'Otras provisiones a corto plazo',                                       'pasivo_corriente',    250),
  ('pc_impuestos',      'Pasivos por impuestos corrientes, corrientes',                          'pasivo_corriente',    260),
  ('pc_beneficios',     'Provisiones corrientes por beneficios a los empleados',                 'pasivo_corriente',    270),
  ('pc_otros_no_fin',   'Otros pasivos no financieros corrientes',                               'pasivo_corriente',    280),
  ('pnc_otros_fin',     'Otros pasivos financieros no corrientes',                               'pasivo_no_corriente', 310),
  ('pnc_arrendamiento', 'Pasivos por arrendamientos no corrientes',                              'pasivo_no_corriente', 320),
  ('pnc_cxp',           'Otras cuentas por pagar no corrientes',                                 'pasivo_no_corriente', 330),
  ('pnc_relacionadas',  'Cuentas por pagar a entidades relacionadas, no corrientes',             'pasivo_no_corriente', 340),
  ('pnc_imp_diferidos', 'Pasivo por impuestos diferidos',                                        'pasivo_no_corriente', 350),
  ('pnc_otros_no_fin',  'Otros pasivos no financieros no corrientes',                            'pasivo_no_corriente', 360),
  ('pat_capital',       'Capital emitido',                                                       'patrimonio',          410),
  ('pat_ganancias',     'Ganancias (pérdidas) acumuladas',                                       'patrimonio',          420),
  ('pat_otras_reservas','Otras reservas',                                                        'patrimonio',          430)
on conflict (codigo) do update set nombre = excluded.nombre, seccion = excluded.seccion, orden = excluded.orden;

-- ---------------------------------------------------------------- clasificación propuesta

-- Rubro IFRS propuesto para una cuenta imputable de balance: por la rama del plan de SAP a la que
-- pertenece (1101000 Disponible, 1208000 Depreciación acumulada, ...) y excepciones por cuenta donde el plan, que
-- viene de la norma chilena antigua, no calza con IFRS:
--   - impuestos diferidos siempre no corrientes (NIC 1.56)
--   - derecho de uso y activos en leasing -> activos por derecho de uso (NIIF 16); su depreciación también
--   - anticipos a proveedores -> activos no financieros; anticipos de clientes e ingresos anticipados ->
--     pasivos no financieros
--   - deterioros de clientes y de anticipos -> restan del activo que deterioran
--   - intereses diferidos por leasing -> restan de la deuda financiera
--   - pasivos por arrendamiento y cuentas con empresas relacionadas -> sus rubros propios
-- null = sin propuesta (queda "sin clasificar" hasta que alguien la clasifique).
create or replace function public.fin_ifrs_proponer(p_cuenta text)
returns text language sql stable set search_path = public as $$
  with recursive arriba as (
    select c.codigo, c.padre, c.nivel from fin_cuentas c where c.codigo = p_cuenta
    union all
    select c.codigo, c.padre, c.nivel from fin_cuentas c join arriba a on c.codigo = a.padre
  ),
  datos as (
    select (select codigo_formato from fin_cuentas where codigo = p_cuenta) as formato,
           (select array_agg(codigo) from arriba) as ramas   -- la cuenta y todos sus padres
  )
  select case
    -- excepciones por cuenta
    when formato in ('1106107', '1106108', '1106113', '1106121') then 'ac_otros_no_fin'
    when formato in ('1106117', '1208111', '1208120') then 'anc_derecho_uso'
    when formato = '1302201' then 'anc_imp_diferidos'
    when formato = '1302301' then 'pnc_otros_fin'
    when formato in ('1302302', '1302303') then 'anc_cxc'
    when formato in ('2105104', '2105105', '2105106', '2105111', '2105117', '2105118', '2105199') then 'pc_relacionadas'
    when formato in ('2105103', '2105109', '2105110') then 'pc_otros_no_fin'
    when formato in ('2105107', '2105108', '2105112', '2105113') then 'pc_arrendamiento'
    when formato = '2105200' then 'pc_otros_fin'
    when formato = '2106101' then 'pc_beneficios'
    when formato in ('2106102', '2106103') then 'ac_deudores'
    when formato = '2106104' then 'ac_impuestos'
    when formato = '2106105' then 'ac_otros_no_fin'
    when formato = '2108101' then 'pnc_imp_diferidos'
    when formato in ('2203101', '2203102') then 'pnc_arrendamiento'
    -- por rama del plan (los nodos más específicos primero: 1111000 y 1112000 cuelgan de 1110000)
    when '1111000' = any (ramas) then 'anc_imp_diferidos'
    when '1112000' = any (ramas) then 'pc_otros_fin'
    when ramas && array['1101000', '1102000'] then 'ac_efectivo'
    when '1103000' = any (ramas) then 'ac_otros_fin'
    when ramas && array['1104000', '1105000', '1106000'] then 'ac_deudores'
    when '1107000' = any (ramas) then 'ac_relacionadas'
    when '1108000' = any (ramas) then 'ac_inventarios'
    when '1109000' = any (ramas) then 'ac_impuestos'
    when '1110000' = any (ramas) then 'ac_otros_no_fin'
    when ramas && array['1201000', '1202000', '1203000', '1204000', '1205000', '1207000', '1208000'] then 'anc_ppe'
    when '1206000' = any (ramas) then 'anc_derecho_uso'
    when '1301000' = any (ramas) then 'anc_inversiones'
    when '1302000' = any (ramas) then 'anc_intangibles'
    when '2101000' = any (ramas) then 'pc_otros_fin'
    when ramas && array['2102000', '2104000', '2105000'] then 'pc_cxp'
    when ramas && array['2103000', '2107000'] then 'pc_impuestos'
    when '2106000' = any (ramas) then 'pc_otras_prov'
    when '2108000' = any (ramas) then 'pc_otros_no_fin'
    when '2201000' = any (ramas) then 'pnc_otros_fin'
    when '2202000' = any (ramas) then 'pnc_relacionadas'
    when '2203000' = any (ramas) then 'pnc_cxp'
    when '3301000' = any (ramas) then 'pat_capital'
    when '3302000' = any (ramas) then 'pat_otras_reservas'
    when '3303000' = any (ramas) then 'pat_ganancias'
  end
  from datos
$$;

-- Propone (o vuelve a proponer) la clasificación de las cuentas imputables de balance. Lo que una
-- persona ya revisó no se cambia: solo se actualiza la propuesta, para mostrar la diferencia.
create or replace function public.fin_ifrs_actualizar_propuestas()
returns integer language plpgsql security definer set search_path = public as $$
declare v_nuevas integer;
begin
  update fin_ifrs_mapeo m set rubro_propuesto = fin_ifrs_proponer(m.cuenta)
  where m.rubro_propuesto is distinct from fin_ifrs_proponer(m.cuenta);
  update fin_ifrs_mapeo m set rubro = m.rubro_propuesto, actualizado_en = now()
  where not m.revisado and m.rubro is distinct from m.rubro_propuesto;
  insert into fin_ifrs_mapeo (cuenta, rubro, rubro_propuesto)
  select c.codigo, fin_ifrs_proponer(c.codigo), fin_ifrs_proponer(c.codigo)
  from fin_cuentas c
  where c.grupo between 1 and 3 and c.imputable
    and not exists (select 1 from fin_ifrs_mapeo m where m.cuenta = c.codigo);
  get diagnostics v_nuevas = row_count;
  return v_nuevas;
end;
$$;

-- ---------------------------------------------------------------- seguridad por fila

alter table public.fin_bal_saldos   enable row level security;
alter table public.fin_bal_asientos enable row level security;
alter table public.fin_ifrs_rubros  enable row level security;
alter table public.fin_ifrs_mapeo   enable row level security;

-- El balance es de toda la empresa: basta el informe Balance en alguna sucursal.
drop policy if exists fin_bal_saldos_select on public.fin_bal_saldos;
create policy fin_bal_saldos_select on public.fin_bal_saldos for select to authenticated
  using (cardinality((select public.fin_sucursales('balance'))) > 0);
drop policy if exists fin_bal_asientos_select on public.fin_bal_asientos;
create policy fin_bal_asientos_select on public.fin_bal_asientos for select to authenticated
  using (cardinality((select public.fin_sucursales('balance'))) > 0);
drop policy if exists fin_ifrs_rubros_select on public.fin_ifrs_rubros;
create policy fin_ifrs_rubros_select on public.fin_ifrs_rubros for select to authenticated
  using ((select public.fin_tiene_acceso()));
drop policy if exists fin_ifrs_mapeo_select on public.fin_ifrs_mapeo;
create policy fin_ifrs_mapeo_select on public.fin_ifrs_mapeo for select to authenticated
  using ((select public.fin_tiene_acceso()));

revoke all on public.fin_bal_saldos, public.fin_bal_asientos, public.fin_ifrs_rubros, public.fin_ifrs_mapeo from anon, authenticated;
grant select on public.fin_bal_saldos, public.fin_bal_asientos, public.fin_ifrs_rubros, public.fin_ifrs_mapeo to authenticated;

-- ---------------------------------------------------------------- balance

-- Saldo (debe - haber) de cada cuenta de balance al cierre del mes de p_corte, y una fila con
-- cuenta = null y grupo = 0 con el resultado del ejercicio aún no cerrado (suma de los grupos 4 a 8).
-- Todas las filas suman cero.
create or replace function public.fin_balance(p_corte date)
returns table (cuenta text, grupo smallint, saldo numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_corte)::date;
begin
  if cardinality(fin_sucursales('balance')) = 0 then
    raise exception 'Sin acceso al balance' using errcode = '42501';
  end if;
  return query
  with movimientos as (
    select s.cuenta, c.grupo, s.debe - s.haber as monto
    from fin_bal_saldos s left join fin_cuentas c on c.codigo = s.cuenta
    where s.periodo <= v_mes and not (s.clase = 'cierre' and s.periodo = v_mes)
  )
  select m.cuenta, m.grupo, sum(m.monto) from movimientos m where m.grupo between 1 and 3
  group by m.cuenta, m.grupo having sum(m.monto) <> 0
  union all
  select null::text, 0::smallint, coalesce(sum(m.monto), 0) from movimientos m where m.grupo is null or m.grupo not between 1 and 3;
end;
$$;

-- p = [ {cuenta, rubro}, ... ]: fija la clasificación IFRS de esas cuentas (revisado = true).
-- rubro null: vuelve a la propuesta automática.
create or replace function public.fin_guardar_ifrs(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_malo text;
begin
  if not fin_puede_configurar() then
    raise exception 'Sin permiso para clasificar cuentas' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'array' then
    raise exception 'Formato inválido: se espera una lista de cuenta y rubro';
  end if;
  select string_agg(f ->> 'cuenta', ', ') into v_malo from jsonb_array_elements(p) f
  where not exists (select 1 from fin_ifrs_mapeo m where m.cuenta = f ->> 'cuenta');
  if v_malo is not null then raise exception 'Cuentas que no son de balance: %', v_malo; end if;
  select string_agg(f ->> 'rubro', ', ') into v_malo from jsonb_array_elements(p) f
  where f ->> 'rubro' is not null and not exists (select 1 from fin_ifrs_rubros r where r.codigo = f ->> 'rubro');
  if v_malo is not null then raise exception 'Rubros que no existen: %', v_malo; end if;

  update fin_ifrs_mapeo m
  set rubro = coalesce(f ->> 'rubro', m.rubro_propuesto), revisado = f ->> 'rubro' is not null,
      actualizado_por = auth.uid(), actualizado_en = now()
  from jsonb_array_elements(p) f
  where m.cuenta = f ->> 'cuenta';
end;
$$;

-- ---------------------------------------------------------------- sincronización desde SAP

-- p = { periodos: ['2026-07'],
--       saldos:   [{periodo, cuenta, clase, debe, haber, lineas}]    todas las cuentas, por clase
--       asientos: [{trans_id, linea_id, fecha, numero, tipo_trans, clase, referencia, glosa, cuenta, ceco,
--                   proyecto, debe, haber}] }                         solo cuentas de balance
-- Reemplaza esos meses enteros y propone la clasificación IFRS de las cuentas nuevas. Los catálogos
-- (fin_cuentas) los carga antes fin_sap_sincronizar.
create or replace function public.fin_sap_sincronizar_balance(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_periodos date[];
  v_saldos   integer;
  v_antes    integer;
  v_fuera    integer;
  v_nuevas   integer;
begin
  if jsonb_typeof(p -> 'periodos') is distinct from 'array' or jsonb_array_length(p -> 'periodos') = 0 then
    raise exception 'fin_sap_sincronizar_balance: sin periodos';
  end if;
  select array_agg(to_date(x, 'YYYY-MM')) into v_periodos from jsonb_array_elements_text(p -> 'periodos') x;

  select count(*), count(*) filter (where not (date_trunc('month', (f ->> 'periodo')::date)::date = any (v_periodos)))
  into v_saldos, v_fuera from jsonb_array_elements(coalesce(p -> 'saldos', '[]')) f;
  select v_fuera + count(*) into v_fuera from jsonb_array_elements(coalesce(p -> 'asientos', '[]')) f
  where not (date_trunc('month', (f ->> 'fecha')::date)::date = any (v_periodos));
  if v_fuera > 0 then
    raise exception 'fin_sap_sincronizar_balance: % filas fuera de los periodos indicados', v_fuera;
  end if;
  select count(*) into v_antes from fin_bal_saldos where periodo = any (v_periodos);
  if v_saldos = 0 and v_antes > 0 then
    raise exception 'fin_sap_sincronizar_balance: SAP no trajo saldos para meses que tienen % en la base; no se borra nada', v_antes;
  end if;

  delete from fin_bal_saldos where periodo = any (v_periodos);
  delete from fin_bal_asientos where periodo = any (v_periodos);
  insert into fin_bal_saldos (periodo, cuenta, clase, debe, haber, lineas)
  select date_trunc('month', (f ->> 'periodo')::date)::date, f ->> 'cuenta', f ->> 'clase',
         (f ->> 'debe')::numeric, (f ->> 'haber')::numeric, (f ->> 'lineas')::integer
  from jsonb_array_elements(coalesce(p -> 'saldos', '[]')) f;
  insert into fin_bal_asientos (trans_id, linea_id, periodo, fecha, numero, tipo_trans, clase, referencia, glosa,
                                cuenta, ceco, proyecto, debe, haber)
  select (f ->> 'trans_id')::integer, (f ->> 'linea_id')::integer, date_trunc('month', (f ->> 'fecha')::date)::date,
         (f ->> 'fecha')::date, (f ->> 'numero')::integer, f ->> 'tipo_trans', f ->> 'clase',
         nullif(f ->> 'referencia', ''), nullif(f ->> 'glosa', ''), f ->> 'cuenta', coalesce(f ->> 'ceco', ''),
         coalesce(f ->> 'proyecto', ''), (f ->> 'debe')::numeric, (f ->> 'haber')::numeric
  from jsonb_array_elements(coalesce(p -> 'asientos', '[]')) f;

  v_nuevas := fin_ifrs_actualizar_propuestas();
  return jsonb_build_object('periodos', cardinality(v_periodos), 'saldos', v_saldos,
                            'asientos', jsonb_array_length(coalesce(p -> 'asientos', '[]')), 'cuentas_ifrs_nuevas', v_nuevas);
end;
$$;

-- ---------------------------------------------------------------- permisos de las funciones

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'fin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;
grant execute on function public.fin_balance(date), public.fin_guardar_ifrs(jsonb), public.fin_ifrs_proponer(text) to authenticated;
revoke all on function public.fin_ifrs_actualizar_propuestas(), public.fin_sap_sincronizar_balance(jsonb) from public, anon, authenticated;
grant execute on function public.fin_sap_sincronizar_balance(jsonb), public.fin_ifrs_actualizar_propuestas() to service_role;

notify pgrst, 'reload schema';

commit;

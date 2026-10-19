-- Produccion Paneles SIP: los paneles sin receta la toman de la orden de fabricacion de SAP.
--
-- La sincronizacion (stack\tareas\sincronizar-sap-sip.ps1) manda, por cada panel SIP con alguna orden
-- de fabricacion no cancelada (OWOR), los componentes de la ULTIMA (WOR1: cantidad base por 1 panel)
-- a la RPC pnl_sap_recetas_of (solo service_role). La RPC carga esa receta en los paneles del portal
-- que:
--   - no tienen receta, o
--   - ya la tenian de una orden de fabricacion (receta_of_numero) y llega una orden mas nueva.
-- Una receta cargada a mano o desde el Excel no se toca nunca: al editar pnl_recetas fuera de esta
-- RPC, el trigger pnl_recetas_manual borra receta_of_numero y el panel queda como receta propia.
-- No crea paneles (eso lo hace pnl_sap_sincronizar); los materiales que falten se crean.
-- Lo ya producido no cambia: pnl_consumos guarda su propia copia de la receta.
-- Re-ejecutable.

-- ---------------------------------------------------------------- origen de la receta

alter table public.pnl_paneles add column if not exists receta_of_numero int;   -- DocNum de la OF; null = receta propia
alter table public.pnl_paneles add column if not exists receta_of_fecha date;   -- fecha de esa OF

-- El Excel PNL_SIP.xlsx perdio el cero inicial del adhesivo (0101010 en SAP): se corrige para que
-- las recetas de las ordenes de fabricacion usen el mismo material.
update public.pnl_materiales set codigo = '0101010'
where codigo = '101010' and not exists (select 1 from public.pnl_materiales where codigo = '0101010');

-- Cualquier cambio a la receta que no venga de pnl_sap_recetas_of la vuelve propia.
create or replace function public.pnl_recetas_manual()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('pnl.receta_desde_of', true), '') <> '1' then
    update pnl_paneles set receta_of_numero = null, receta_of_fecha = null
    where id = case when tg_op = 'DELETE' then old.panel_id else new.panel_id end
      and receta_of_numero is not null;
  end if;
  return null;
end $$;
revoke execute on function public.pnl_recetas_manual() from public, anon, authenticated;

drop trigger if exists pnl_recetas_manual on public.pnl_recetas;
create trigger pnl_recetas_manual after insert or update or delete on public.pnl_recetas
  for each row execute function public.pnl_recetas_manual();

-- ---------------------------------------------------------------- RPC de la sincronizacion

-- p: {materiales: [{codigo, descripcion, unidad}],
--     recetas:    [{panel_codigo, of_numero, of_fecha, material_codigo, cantidad}]}
create or replace function public.pnl_sap_recetas_of(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_materiales int; n_nuevas int; n_actualizadas int;
begin
  drop table if exists _r;
  create temp table _r on commit drop as
  select btrim(e->>'panel_codigo') as panel_codigo, (e->>'of_numero')::int as of_numero,
         (e->>'of_fecha')::date as of_fecha, btrim(e->>'material_codigo') as material_codigo,
         (e->>'cantidad')::numeric as cantidad
  from jsonb_array_elements(coalesce(p->'recetas', '[]')) e;
  delete from _r where coalesce(panel_codigo, '') = '' or coalesce(material_codigo, '') = ''
                    or of_numero is null or not (cantidad > 0);

  -- paneles a los que se les carga la receta de su OF
  drop table if exists _pan;
  create temp table _pan on commit drop as
  select pa.id, x.of_numero, x.of_fecha, pa.receta_of_numero is not null as tenia_of
  from (select distinct panel_codigo, of_numero, of_fecha from _r) x
  join pnl_paneles pa on pa.codigo = x.panel_codigo
  where (pa.receta_of_numero is null and not exists (select 1 from pnl_recetas r where r.panel_id = pa.id))
     or (pa.receta_of_numero is not null and pa.receta_of_numero <> x.of_numero);

  -- materiales que falten (solo los de esos paneles)
  insert into pnl_materiales (codigo, descripcion, unidad)
  select distinct on (m->>'codigo') btrim(m->>'codigo'), coalesce(nullif(btrim(m->>'descripcion'), ''), btrim(m->>'codigo')),
         upper(coalesce(nullif(btrim(m->>'unidad'), ''), 'UNIDAD'))
  from jsonb_array_elements(coalesce(p->'materiales', '[]')) m
  where btrim(m->>'codigo') in (select r.material_codigo from _r r join pnl_paneles pa on pa.codigo = r.panel_codigo
                                join _pan on _pan.id = pa.id)
  on conflict (codigo) do nothing;
  get diagnostics n_materiales = row_count;

  if exists (select 1 from _r r join pnl_paneles pa on pa.codigo = r.panel_codigo join _pan on _pan.id = pa.id
             where not exists (select 1 from pnl_materiales m where m.codigo = r.material_codigo)) then
    raise exception 'Una receta de orden de fabricacion usa un material que no viene en la lista de materiales' using errcode = 'P0001';
  end if;

  perform set_config('pnl.receta_desde_of', '1', true);
  delete from pnl_recetas where panel_id in (select id from _pan);
  insert into pnl_recetas (panel_id, material_id, cantidad)
  select pa.id, m.id, sum(r.cantidad)
  from _r r join pnl_paneles pa on pa.codigo = r.panel_codigo join _pan on _pan.id = pa.id
  join pnl_materiales m on m.codigo = r.material_codigo
  group by pa.id, m.id;
  perform set_config('pnl.receta_desde_of', '', true);

  update pnl_paneles pa set receta_of_numero = _pan.of_numero, receta_of_fecha = _pan.of_fecha
  from _pan where pa.id = _pan.id;

  select count(*) filter (where not tenia_of), count(*) filter (where tenia_of) into n_nuevas, n_actualizadas from _pan;
  return jsonb_build_object('recetas_nuevas', n_nuevas, 'recetas_actualizadas', n_actualizadas, 'materiales_nuevos', n_materiales);
end $$;

revoke execute on function public.pnl_sap_recetas_of(jsonb) from public, anon, authenticated;
grant  execute on function public.pnl_sap_recetas_of(jsonb) to service_role;

-- PostgREST no ve la RPC nueva hasta recargar su cache de esquema
notify pgrst, 'reload schema';

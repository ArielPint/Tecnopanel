-- Adquisiciones: OC de SAP mas rapidas (sobre las migraciones *_adquisiciones*.sql anteriores, que van antes).
--
-- adq_sap_oc_v y adq_sap_oc_lineas_v filtraban con adq_ve_oc_compras(o.sucursales) fila por fila: es security
-- definer (Postgres no la puede desarmar) y por dentro busca los permisos del usuario dos veces por sucursal.
-- Con todo el historial de SAP eran decenas de miles de llamadas por pagina. Ahora las sucursales donde el
-- usuario es de Compras se calculan una vez por consulta (subconsulta escalar = InitPlan) y cada fila solo
-- compara arreglos. Mismo resultado que adq_ve_oc_compras: sin sucursal, cualquiera de Compras; con
-- sucursales, Compras de alguna de ellas.
-- Las vistas quedan igual que en 20261018120000 (adq_sap_oc_v) y 20261025120000 (adq_sap_oc_lineas_v) salvo
-- el filtro.
--
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

-- Sucursales donde el usuario actual es comprador o jefe de compras
create or replace function public.adq_sucursales_compras()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s), '{}') from unnest(array['Santiago', 'Puerto Varas']) s where adq_compras_de(s)
$$;

drop view if exists public.adq_sap_oc_v;
create view public.adq_sap_oc_v as
select o.*,
  case when o.cantidad_total > 0 then round(100 * (o.cantidad_total - o.cantidad_pendiente) / o.cantidad_total)::int end as recepcion_pct,
  case when o.neto > 0 then least(100, round(100 * o.facturado / o.neto))::int end as facturado_pct,
  (select string_agg(distinct l.ceco, ', ') from sap_oc_lineas l where l.doc_entry = o.doc_entry) as cecos,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc o
where case when cardinality(o.sucursales) = 0 then (select adq_es_compras())
           else o.sucursales && (select adq_sucursales_compras()) end;

drop view if exists public.adq_sap_oc_lineas_v;
create view public.adq_sap_oc_lineas_v as
select l.doc_entry, l.linea, o.docnum, o.fecha, o.fecha_entrega, o.proveedor_codigo, o.proveedor_nombre, o.moneda,
  o.abierta as oc_abierta, o.cancelada, l.articulo_codigo, l.descripcion, l.unidad, l.bodega, l.ceco,
  a.grupo, a.familia, a.subfamilia,
  l.cantidad, l.cantidad - l.pendiente as recibido, l.pendiente, l.precio, l.total,
  case when l.cantidad > 0 then round(l.total * l.pendiente / l.cantidad, 2) else 0 end as pendiente_neto,
  l.abierta and l.pendiente > 0 as por_recibir,
  (l.abierta and l.pendiente > 0 and o.fecha_entrega < adq_hoy()) as atrasada,
  (select string_agg('SC-' || s.numero, ', ' order by s.numero) from adq_oc x join adq_solicitudes s on s.id = x.solicitud_id
   where x.docnum = o.docnum) as solicitudes
from sap_oc_lineas l
join sap_oc o on o.doc_entry = l.doc_entry
left join sap_articulos a on a.codigo = l.articulo_codigo
where case when cardinality(o.sucursales) = 0 then (select adq_es_compras())
           else o.sucursales && (select adq_sucursales_compras()) end;

revoke all on public.adq_sap_oc_v, public.adq_sap_oc_lineas_v from anon, authenticated;
grant select on public.adq_sap_oc_v, public.adq_sap_oc_lineas_v to authenticated;

-- La usan las vistas, pero Postgres revisa el EXECUTE de una funcion contra quien consulta (no contra el
-- dueño de la vista, como con las tablas): authenticated la necesita. Solo devuelve sus propias sucursales.
revoke execute on function public.adq_sucursales_compras() from public, anon;
grant execute on function public.adq_sucursales_compras() to authenticated;

notify pgrst, 'reload schema';

commit;

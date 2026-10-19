-- Adquisiciones: historial completo de OC de SAP (sobre las migraciones *_adquisiciones*.sql anteriores, que van
-- antes).
--
-- tareas\sincronizar-sap-compras.ps1 pasa a traer todas las OC de SAP (desde 2021), no solo desde el 01-01 del
-- anio anterior. Con eso, una OC antigua con "SC-5" en sus comentarios (de antes del portal) se vincularia a la
-- solicitud SC-5 actual: la vinculacion automatica ahora solo toma OC emitidas desde el dia en que se creo la
-- solicitud. El resto de adq_sap_actualizar es igual que en 20261016120000_adquisiciones.sql.
-- Re-ejecutable. Lo aplica 23-adquisiciones.ps1.
set client_encoding = 'UTF8';

begin;

create or replace function public.adq_sap_actualizar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_vinculadas int := 0;
  v_recibidas int := 0;
begin
  for r in
    select distinct s.id, s.numero, s.estado, s.creado_por, o.docnum
    from adq_solicitudes s
    join sap_oc o on not o.cancelada
     and o.fecha >= (s.created_at at time zone 'America/Santiago')::date   -- la OC es posterior a la solicitud
     and (coalesce(o.comentarios, '') || ' ' || coalesce(o.referencia, ''))
         ~* ('(^|[^0-9a-z])sc[ -]*(n[°º.]?[ ]*)?0*' || s.numero || '([^0-9]|$)')
    where s.estado in ('aprobada', 'oc_emitida')
      and not exists (select 1 from adq_oc x where x.solicitud_id = s.id and x.docnum = o.docnum)
  loop
    insert into adq_oc (solicitud_id, docnum, automatica) values (r.id, r.docnum, true) on conflict do nothing;
    update adq_solicitudes set estado = 'oc_emitida' where id = r.id and estado = 'aprobada';
    insert into adq_bitacora (solicitud_id, user_id, texto) values (r.id, null, 'OC SAP N° ' || r.docnum || ' vinculada automáticamente (comentario de la OC)');
    perform adq_avisar(array[r.creado_por], r.id, 'OC emitida: SC-' || r.numero || ' · OC SAP ' || r.docnum,
      'Se emitió la OC N° ' || r.docnum || ' para tu solicitud SC-' || r.numero);
    v_vinculadas := v_vinculadas + 1;
  end loop;

  for r in
    select s.id, s.numero, s.titulo, s.creado_por
    from adq_solicitudes s
    where s.estado = 'oc_emitida'
      and not exists (                         -- toda OC vinculada esta en SAP, sin pendiente
        select 1 from adq_oc x
        where x.solicitud_id = s.id
          and not exists (select 1 from sap_oc o where o.docnum = x.docnum and not o.cancelada
                          and o.cantidad_total > 0 and o.cantidad_pendiente = 0))
  loop
    update adq_solicitudes set estado = 'recibida', fecha_cierre = now() where id = r.id;
    insert into adq_bitacora (solicitud_id, user_id, texto) values (r.id, null, 'Recibida completa según SAP');
    perform adq_avisar(array[r.creado_por], r.id, 'Recibida: SC-' || r.numero || ' · ' || r.titulo,
      'Tu solicitud de compra SC-' || r.numero || ' fue recibida');
    v_recibidas := v_recibidas + 1;
  end loop;
  return jsonb_build_object('vinculadas', v_vinculadas, 'recibidas', v_recibidas);
end $$;

revoke execute on function public.adq_sap_actualizar() from public, anon, authenticated;
grant execute on function public.adq_sap_actualizar() to service_role;

notify pgrst, 'reload schema';

commit;

-- Portal Contratistas: estados de pago de la empresa, por proyecto.
--
-- Las tablas de Estados de Pago (subcontratos, estados_pago y sus hijas) son de prod y ya dejan a
-- la cuenta de un subcontratista ver y crear solo lo suyo (políticas *_propio con
-- subcontratista_actual(), sin permisos de proyecto). Esto agrega lo que le faltaba al portal:
--
--   ing_mis_subcontratos_v   sus subcontratos con el nombre del proyecto (la RLS de proyectos es
--                            por sucursal: una cuenta con sucursal no vería el nombre de un
--                            proyecto de la otra)
--   historial                la empresa ve el historial de estados de sus propios EP
--   proyecto del EP          siempre el de su subcontrato (la política insert_propio no lo revisaba)
--
-- Depende de subcontratos, estados_pago, estados_pago_historial y proyectos (prod) y de
-- 20261008120000_subcontratista_varios_usuarios.sql.
-- Va después de 20261102120000_ingreso_personal_contratistas.sql. Re-ejecutable. Lo aplica 21-ingreso-personal.ps1.
set client_encoding = 'UTF8';

begin;

-- Sin security_invoker a propósito: el filtro es subcontratista_actual()
drop view if exists public.ing_mis_subcontratos_v;
create view public.ing_mis_subcontratos_v as
select sc.id, sc.proyecto_id, sc.subcontratista_id, sc.especialidad, sc.monto_contractual, sc.estado, sc.created_at,
  p.nombre as proyecto_nombre
from subcontratos sc
join proyectos p on p.id = sc.proyecto_id
where sc.subcontratista_id = subcontratista_actual();

revoke all on public.ing_mis_subcontratos_v from anon;
revoke insert, update, delete, truncate on public.ing_mis_subcontratos_v from authenticated;
grant select on public.ing_mis_subcontratos_v to authenticated;

drop policy if exists estados_pago_historial_select_propio on public.estados_pago_historial;
create policy estados_pago_historial_select_propio on public.estados_pago_historial for select to authenticated
  using (subcontratista_actual() is not null and estado_pago_id in (
    select ep.id from estados_pago ep join subcontratos sc on sc.id = ep.subcontrato_id
    where sc.subcontratista_id = subcontratista_actual()));

-- El proyecto del EP es el de su subcontrato (vale también para el staff: es el mismo dato)
create or replace function public.ep_proyecto_desde_subcontrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select sc.proyecto_id into new.proyecto_id from subcontratos sc where sc.id = new.subcontrato_id;
  return new;
end $$;
drop trigger if exists ep_00_proyecto on public.estados_pago;
create trigger ep_00_proyecto before insert or update of subcontrato_id on public.estados_pago
  for each row execute function public.ep_proyecto_desde_subcontrato();
revoke execute on function public.ep_proyecto_desde_subcontrato() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

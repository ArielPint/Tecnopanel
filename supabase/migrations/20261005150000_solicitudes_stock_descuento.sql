-- Stock de Solicitudes:
--  1) Los productos que NO vienen en la última carga del Excel quedan en 0 ("Sin stock").
--  2) Enviar una solicitud la marca 'usada' y descuenta del stock su cantidad real,
--     en una sola transacción y solo si seguía pendiente (no descuenta dos veces).
-- SECURITY INVOKER: siguen aplicando las políticas RLS de stock_productos y solicitudes.

create or replace function public.stock_marcar_ausentes(p_codigos text[])
returns integer
language sql
security invoker
set search_path = public
as $$
  with u as (
    update stock_productos
       set cantidad_disponible = 0,
           actualizado_en = now(),
           actualizado_por = auth.uid()
     where coalesce(array_length(p_codigos, 1), 0) > 0
       and upper(trim(codigo)) <> all (select upper(trim(c)) from unnest(p_codigos) c)
    returning 1
  )
  select count(*)::int from u;
$$;

create or replace function public.solicitudes_enviar(p_ids uuid[])
returns integer
language sql
security invoker
set search_path = public
as $$
  with s as (
    update solicitudes
       set estado = 'usada', usada_en = now()
     where id = any (p_ids) and estado = 'pendiente'
    returning items
  ),
  d as (
    select upper(trim(it->>'codigo')) as cod,
           sum(coalesce(nullif(it->>'cantidad_real', '')::numeric, nullif(it->>'cantidad', '')::numeric, 0)) as cant
      from s, jsonb_array_elements(s.items) it
     group by 1
  ),
  u as (
    update stock_productos p
       set cantidad_disponible = greatest(p.cantidad_disponible - d.cant, 0)
      from d
     where upper(trim(p.codigo)) = d.cod
    returning 1
  )
  select count(*)::int from s;
$$;

revoke execute on function public.stock_marcar_ausentes(text[]) from public, anon;
revoke execute on function public.solicitudes_enviar(uuid[]) from public, anon;
grant execute on function public.stock_marcar_ausentes(text[]) to authenticated;
grant execute on function public.solicitudes_enviar(uuid[]) to authenticated;

-- Varios usuarios por subcontratista.
-- Antes el vínculo era subcontratistas.user_id (UNIQUE): una sola cuenta por ficha.
-- Ahora vive en subcontratista_usuarios (un usuario pertenece a lo sumo a un
-- subcontratista; un subcontratista puede tener muchos usuarios).
-- Todo el RLS de Estados de Pago pasa por subcontratista_actual(), así que basta
-- con redefinirla. La columna vieja se sigue leyendo como respaldo (el frontend la
-- va vaciando al guardar cada usuario). Re-ejecutable.

create table if not exists public.subcontratista_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subcontratista_id uuid not null references public.subcontratistas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists subcontratista_usuarios_subcontratista_idx
  on public.subcontratista_usuarios (subcontratista_id);

-- Vínculos existentes
insert into public.subcontratista_usuarios (user_id, subcontratista_id)
select user_id, id from public.subcontratistas where user_id is not null
on conflict (user_id) do nothing;

create or replace function public.subcontratista_actual()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (select subcontratista_id from public.subcontratista_usuarios where user_id = auth.uid()),
    (select id from public.subcontratistas where user_id = auth.uid())
  )
$$;

alter table public.subcontratista_usuarios enable row level security;

drop policy if exists subcontratista_usuarios_select on public.subcontratista_usuarios;
create policy subcontratista_usuarios_select on public.subcontratista_usuarios
  for select to authenticated
  using (user_id = auth.uid() or public.es_staff_estados_pago('ver'));

drop policy if exists subcontratista_usuarios_insert on public.subcontratista_usuarios;
create policy subcontratista_usuarios_insert on public.subcontratista_usuarios
  for insert to authenticated
  with check (public.es_staff_estados_pago('editar'));

drop policy if exists subcontratista_usuarios_update on public.subcontratista_usuarios;
create policy subcontratista_usuarios_update on public.subcontratista_usuarios
  for update to authenticated
  using (public.es_staff_estados_pago('editar'))
  with check (public.es_staff_estados_pago('editar'));

drop policy if exists subcontratista_usuarios_delete on public.subcontratista_usuarios;
create policy subcontratista_usuarios_delete on public.subcontratista_usuarios
  for delete to authenticated
  using (public.es_staff_estados_pago('editar'));

grant select, insert, update, delete on public.subcontratista_usuarios to authenticated;

-- La cuenta del subcontratista sigue viendo su propia ficha (nombre en el Listado)
drop policy if exists subcontratistas_select on public.subcontratistas;
create policy subcontratistas_select on public.subcontratistas
  for select
  using (public.es_staff_estados_pago('ver') or user_id = auth.uid() or id = public.subcontratista_actual());

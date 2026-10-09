-- Portal de Prevencion, fase 4 (PLAN_SSO_PORTAL.md): Entrega de EPP.
--
-- Cada entrega es un comprobante para un trabajador: fecha, motivo, los elementos entregados
-- (cantidad y talla) y la foto/PDF del comprobante firmado. Con la vida util de cada elemento se
-- calcula cuando toca reponerlo (sso_epp_vigentes).
--
-- Permisos (modulo 'epp'): ver, crear (registrar entregas y editar las propias), editar (cualquiera),
-- eliminar, exportar. Catalogo: Configuracion > editar.
-- Storage: bucket 'sso', carpeta epp/<entrega_id>/...
--
-- Re-ejecutable. Va despues de 20261005140000_sso_capacitaciones.sql.
set client_encoding = 'UTF8';

begin;

-- ---------------------------------------------------------------- catalogo

create table if not exists public.sso_epp_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  categoria text not null check (categoria in ('cabeza', 'ojos', 'oidos', 'respiratoria', 'manos', 'pies', 'cuerpo', 'altura', 'otro')),
  vida_util_meses int check (vida_util_meses is null or vida_util_meses > 0),   -- null: se repone solo por deterioro
  requiere_talla boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
-- Vidas utiles de partida, referenciales: se ajustan en Configuracion segun fabricante y uso real.
insert into public.sso_epp_catalogo (nombre, categoria, vida_util_meses, requiere_talla) values
  ('Casco de seguridad', 'cabeza', 36, false),
  ('Lentes de seguridad', 'ojos', 6, false),
  ('Careta de soldar', 'ojos', 24, false),
  ('Protector auditivo tipo fono', 'oidos', 12, false),
  ('Tapones auditivos', 'oidos', 1, false),
  ('Respirador medio rostro', 'respiratoria', 12, false),
  ('Filtros para respirador (par)', 'respiratoria', 1, false),
  ('Guantes de cabritilla', 'manos', 1, true),
  ('Guantes de soldador', 'manos', 3, true),
  ('Zapatos de seguridad', 'pies', 12, true),
  ('Ropa de trabajo (pantalón y camisa)', 'cuerpo', 6, true),
  ('Chaleco reflectante', 'cuerpo', 12, true),
  ('Coleto de soldador', 'cuerpo', 12, true),
  ('Arnés de seguridad', 'altura', 60, true),
  ('Cola de vida doble con amortiguador', 'altura', 60, false)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------- entregas

create table if not exists public.sso_epp_entregas (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references public.sso_trabajadores(id) on delete cascade,
  fecha date not null,
  motivo text not null check (motivo in ('primera', 'reposicion', 'deterioro', 'perdida')),
  observaciones text,
  comprobante_path text,                          -- comprobante firmado, en el bucket 'sso'
  comprobante_nombre text,
  entregado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sso_epp_entregas_trab_idx on public.sso_epp_entregas (trabajador_id, fecha desc);
create index if not exists sso_epp_entregas_fecha_idx on public.sso_epp_entregas (fecha desc);

create table if not exists public.sso_epp_entrega_items (
  entrega_id uuid not null references public.sso_epp_entregas(id) on delete cascade,
  epp_id uuid not null references public.sso_epp_catalogo(id),
  cantidad int not null default 1 check (cantidad between 1 and 100),
  talla text,
  primary key (entrega_id, epp_id)
);

create or replace function public.sso_epp_entrega_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.fecha > sso_hoy() then
    raise exception 'La fecha de la entrega no puede ser futura' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sso_epp_entrega_antes on public.sso_epp_entregas;
create trigger sso_epp_entrega_antes before insert or update on public.sso_epp_entregas
  for each row execute function public.sso_epp_entrega_antes();

create or replace view public.sso_epp_entregas_v with (security_invoker = true) as
select e.*,
  (select count(*) from public.sso_epp_entrega_items i where i.entrega_id = e.id) as elementos,
  (select coalesce(sum(i.cantidad), 0) from public.sso_epp_entrega_items i where i.entrega_id = e.id) as unidades
from public.sso_epp_entregas e;

-- Lo ultimo entregado de cada elemento a cada trabajador, y cuando corresponde reponerlo.
create or replace view public.sso_epp_vigentes with (security_invoker = true) as
select distinct on (e.trabajador_id, i.epp_id)
  e.trabajador_id, i.epp_id, e.id as entrega_id, e.fecha, i.cantidad, i.talla,
  case when c.vida_util_meses is not null then (e.fecha + make_interval(months => c.vida_util_meses))::date end as reposicion,
  case
    when c.vida_util_meses is null then 'vigente'
    when (e.fecha + make_interval(months => c.vida_util_meses))::date < public.sso_hoy() then 'vencido'
    when (e.fecha + make_interval(months => c.vida_util_meses))::date <= public.sso_hoy() + 15 then 'por_vencer'
    else 'vigente'
  end as situacion
from public.sso_epp_entrega_items i
join public.sso_epp_entregas e on e.id = i.entrega_id
join public.sso_epp_catalogo c on c.id = i.epp_id
order by e.trabajador_id, i.epp_id, e.fecha desc, e.created_at desc;

-- ---------------------------------------------------------------- RLS

alter table public.sso_epp_catalogo      enable row level security;
alter table public.sso_epp_entregas      enable row level security;
alter table public.sso_epp_entrega_items enable row level security;

drop policy if exists sso_epp_cat_select on public.sso_epp_catalogo;
create policy sso_epp_cat_select on public.sso_epp_catalogo for select to authenticated using (sso_tiene_acceso());
drop policy if exists sso_epp_cat_write on public.sso_epp_catalogo;
create policy sso_epp_cat_write on public.sso_epp_catalogo for all to authenticated
  using (sso_puede_modulo('configuracion', 'editar')) with check (sso_puede_modulo('configuracion', 'editar'));

-- puede escribir una entrega: 'editar' del modulo, o quien la registro con 'crear'
create or replace function public.sso_epp_puede_editar(p_entregado_por uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select sso_puede_modulo('epp', 'editar') or (p_entregado_por = auth.uid() and sso_puede_modulo('epp', 'crear'))
$$;
revoke execute on function public.sso_epp_puede_editar(uuid) from public, anon;
grant execute on function public.sso_epp_puede_editar(uuid) to authenticated;

drop policy if exists sso_epp_ent_select on public.sso_epp_entregas;
create policy sso_epp_ent_select on public.sso_epp_entregas for select to authenticated using (sso_puede_modulo('epp', 'ver'));
drop policy if exists sso_epp_ent_insert on public.sso_epp_entregas;
create policy sso_epp_ent_insert on public.sso_epp_entregas for insert to authenticated with check (sso_puede_modulo('epp', 'crear'));
drop policy if exists sso_epp_ent_update on public.sso_epp_entregas;
create policy sso_epp_ent_update on public.sso_epp_entregas for update to authenticated
  using (sso_epp_puede_editar(entregado_por)) with check (sso_epp_puede_editar(entregado_por));
drop policy if exists sso_epp_ent_delete on public.sso_epp_entregas;
create policy sso_epp_ent_delete on public.sso_epp_entregas for delete to authenticated using (sso_puede_modulo('epp', 'eliminar'));

drop policy if exists sso_epp_items_select on public.sso_epp_entrega_items;
create policy sso_epp_items_select on public.sso_epp_entrega_items for select to authenticated using (sso_puede_modulo('epp', 'ver'));
drop policy if exists sso_epp_items_write on public.sso_epp_entrega_items;
create policy sso_epp_items_write on public.sso_epp_entrega_items for all to authenticated
  using (exists (select 1 from public.sso_epp_entregas e where e.id = entrega_id and sso_epp_puede_editar(e.entregado_por)))
  with check (exists (select 1 from public.sso_epp_entregas e where e.id = entrega_id and sso_epp_puede_editar(e.entregado_por)));

revoke all on public.sso_epp_catalogo, public.sso_epp_entregas, public.sso_epp_entrega_items,
              public.sso_epp_entregas_v, public.sso_epp_vigentes from anon;
revoke truncate on public.sso_epp_catalogo, public.sso_epp_entregas, public.sso_epp_entrega_items from authenticated;
revoke insert, update, delete, truncate on public.sso_epp_entregas_v, public.sso_epp_vigentes from authenticated;
revoke execute on function public.sso_epp_entrega_antes() from public, anon, authenticated;

-- ---------------------------------------------------------------- Storage: carpeta epp/

create or replace function public.sso_modulo_de_objeto(p_name text)
returns text language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then 'hallazgos'
    when split_part(p_name, '/', 1) in ('capacitaciones', 'epp') then split_part(p_name, '/', 1)
  end
$$;

drop policy if exists sso_objects_epp_insert on storage.objects;
create policy sso_objects_epp_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sso' and (storage.foldername(name))[1] = 'epp' and exists (
    select 1 from public.sso_epp_entregas e
    where e.id::text = (storage.foldername(name))[2] and public.sso_epp_puede_editar(e.entregado_por)));
drop policy if exists sso_objects_epp_delete on storage.objects;
create policy sso_objects_epp_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sso' and (storage.foldername(name))[1] = 'epp' and (
    public.sso_puede_modulo('epp', 'eliminar') or exists (
      select 1 from public.sso_epp_entregas e
      where e.id::text = (storage.foldername(name))[2] and public.sso_epp_puede_editar(e.entregado_por))));

notify pgrst, 'reload schema';

commit;

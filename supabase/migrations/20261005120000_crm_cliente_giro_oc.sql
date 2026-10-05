set client_encoding = 'UTF8';

-- Ficha de cliente en dos tramos: RUT, razón social, giro, teléfono y correo al crearlo;
-- el resto (rubro, dirección, ciudad, región, contacto) recién al cargar la OC en Negociación.
alter table public.clientes add column if not exists giro text;

-- Completa la ficha del cliente desde la OC. Quien maneja la oportunidad en Negociación no
-- siempre tiene Clientes/editar, por eso es SECURITY DEFINER con el mismo criterio de permiso
-- que crm_cambiar_etapa. Solo rellena campos vacíos (no pisa datos existentes), asocia el
-- cliente a la oportunidad si no tenía y deja registro en cliente_historial.
create or replace function public.crm_completar_cliente_oc(p_oportunidad_id uuid, p_cliente_id uuid, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_etapa text;
  v_vendedor uuid;
  v_cliente_actual uuid;
  v_antes jsonb;
  v_despues jsonb;
  v_campos text[] := array['giro','contacto_fono','contacto_email','rubro','direccion','ciudad','region','contacto_nombre'];
  v_faltan text[];
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select etapa_actual::text, vendedor_id, cliente_id
    into v_etapa, v_vendedor, v_cliente_actual
  from public.oportunidades where id = p_oportunidad_id
  for update;
  if v_etapa is null then
    raise exception 'Oportunidad no encontrada' using errcode = 'P0002';
  end if;

  if not (
    public.has_crm_permiso('Clientes', 'editar')
    or public.has_crm_permiso('Oportunidades', 'editar')
    or public.has_crm_permiso(public.crm_modulo_de_etapa(v_etapa), 'avanzar')
    or v_vendedor = auth.uid()
  ) then
    raise exception 'Sin permiso para completar el cliente de esta oportunidad' using errcode = '42501';
  end if;

  if v_cliente_actual is not null and v_cliente_actual <> p_cliente_id then
    raise exception 'La oportunidad ya tiene otro cliente asociado' using errcode = 'P0001';
  end if;

  select jsonb_build_object('giro', giro, 'contacto_fono', contacto_fono, 'contacto_email', contacto_email,
           'rubro', rubro, 'direccion', direccion, 'ciudad', ciudad, 'region', region, 'contacto_nombre', contacto_nombre)
    into v_antes
  from public.clientes where id = p_cliente_id
  for update;
  if v_antes is null then
    raise exception 'Cliente no encontrado' using errcode = 'P0002';
  end if;

  update public.clientes set
    giro            = coalesce(nullif(btrim(giro), ''),            nullif(btrim(p_datos->>'giro'), '')),
    contacto_fono   = coalesce(nullif(btrim(contacto_fono), ''),   nullif(btrim(p_datos->>'contacto_fono'), '')),
    contacto_email  = coalesce(nullif(btrim(contacto_email), ''),  nullif(btrim(p_datos->>'contacto_email'), '')),
    rubro           = coalesce(nullif(btrim(rubro), ''),           nullif(btrim(p_datos->>'rubro'), '')),
    direccion       = coalesce(nullif(btrim(direccion), ''),       nullif(btrim(p_datos->>'direccion'), '')),
    ciudad          = coalesce(nullif(btrim(ciudad), ''),          nullif(btrim(p_datos->>'ciudad'), '')),
    region          = coalesce(nullif(btrim(region), ''),          nullif(btrim(p_datos->>'region'), '')),
    contacto_nombre = coalesce(nullif(btrim(contacto_nombre), ''), nullif(btrim(p_datos->>'contacto_nombre'), '')),
    updated_at      = now()
  where id = p_cliente_id
  returning jsonb_build_object('giro', giro, 'contacto_fono', contacto_fono, 'contacto_email', contacto_email,
           'rubro', rubro, 'direccion', direccion, 'ciudad', ciudad, 'region', region, 'contacto_nombre', contacto_nombre)
    into v_despues;

  select array_agg(c) into v_faltan
  from unnest(v_campos) c
  where coalesce(btrim(v_despues->>c), '') = '';
  if v_faltan is not null then
    raise exception 'Faltan datos del cliente: %', array_to_string(v_faltan, ', ') using errcode = 'P0001';
  end if;

  if v_antes is distinct from v_despues then
    insert into public.cliente_historial (cliente_id, usuario_id, tipo, datos_antes, datos_despues)
    values (p_cliente_id, auth.uid(), 'modificacion', v_antes, v_despues);
  end if;

  if v_cliente_actual is null then
    update public.oportunidades set cliente_id = p_cliente_id, updated_at = now()
    where id = p_oportunidad_id;
  end if;
end;
$$;

revoke all on function public.crm_completar_cliente_oc(uuid, uuid, jsonb) from public, anon;
grant execute on function public.crm_completar_cliente_oc(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: callerUser, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerUser.user) return json({ error: 'No autenticado' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('rol')
    .eq('id', callerUser.user.id)
    .single()
  if (callerProfile?.rol !== 'admin') return json({ error: 'Requiere rol admin' }, 403)

  try {
    const { nombre, apellido, email, password, rol, modulos } = await req.json()
    if (!nombre || !email || !password || !rol) return json({ error: 'Faltan campos requeridos' }, 400)

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido: apellido ?? '' },
    })
    if (createErr) return json({ error: createErr.message }, 400)

    // El trigger on_auth_user_created ya insertó la fila en profiles
    // (id, nombre, apellido, email) — acá solo completamos rol/modulos.
    const { error: updateErr } = await admin
      .from('profiles')
      .update({ rol, modulos: modulos ?? [] })
      .eq('id', created.user.id)
    if (updateErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: updateErr.message }, 400)
    }
    return json({ id: created.user.id })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

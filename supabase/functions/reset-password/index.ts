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
    const { user_id, password } = await req.json()
    if (!user_id || !password) return json({ error: 'Faltan campos requeridos' }, 400)

    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

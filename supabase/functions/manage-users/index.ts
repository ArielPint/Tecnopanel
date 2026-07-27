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
    .from('user_profiles')
    .select('role')
    .eq('id', callerUser.user.id)
    .single()
  if (callerProfile?.role !== 'admin') return json({ error: 'Requiere rol admin' }, 403)

  const body = await req.json()
  const { action } = body

  try {
    if (action === 'create') {
      const { username, password, name, email, role, permissions } = body
      if (!username || !password || !email) return json({ error: 'Faltan campos requeridos' }, 400)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const { error: insertErr } = await admin.from('user_profiles').insert({
        id: created.user.id,
        username,
        name,
        email,
        role,
        active: true,
        permissions,
      })
      if (insertErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: insertErr.message }, 400)
      }
      return json({ id: created.user.id })
    }

    if (action === 'update_password') {
      const { userId, password } = body
      if (!userId || !password) return json({ error: 'Faltan campos requeridos' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete') {
      const { userId } = body
      if (!userId) return json({ error: 'Falta userId' }, 400)
      if (userId === callerUser.user.id) return json({ error: 'No puedes eliminar tu propio usuario' }, 400)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

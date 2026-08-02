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

// E4: única Edge Function de administración de cuentas (reemplaza create-user +
// manage-users + reset-password). Solo cubre lo que exige service role — alta,
// baja, password, patch de perfil. Permisos por módulo y rol_negocio por proyecto
// se siguen escribiendo desde el cliente vía permisos_admin_all/project_access_admin_all
// (mismo patrón que syncPermisosCrm/syncPermisosLaChacra ya existente), no hace falta
// repetir esa lógica acá.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: callerUser, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerUser.user) return json({ error: 'No autenticado' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', callerUser.user.id)
    .single()
  if (!callerProfile?.is_super_admin) return json({ error: 'Requiere administrador' }, 403)

  const body = await req.json()
  const { action } = body

  try {
    if (action === 'create') {
      const { nombre, apellido, email, password } = body
      if (!nombre || !email || !password) return json({ error: 'Faltan campos requeridos' }, 400)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, apellido: apellido ?? '' },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      // El trigger on_auth_user_created ya insertó la fila en profiles (id, nombre, apellido, email).
      return json({ id: created.user.id })
    }

    if (action === 'update') {
      const { userId, nombre, apellido, email, activo, is_super_admin } = body
      if (!userId) return json({ error: 'Falta userId' }, 400)

      const patch: Record<string, unknown> = {}
      if (nombre !== undefined) patch.nombre = nombre
      if (apellido !== undefined) patch.apellido = apellido
      if (email !== undefined) patch.email = email
      if (activo !== undefined) patch.activo = activo
      if (is_super_admin !== undefined) patch.is_super_admin = is_super_admin

      const { error } = await admin.from('profiles').update(patch).eq('id', userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'reset_password') {
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

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_API_URL = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails'
const FROM_EMAIL = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev'
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? 'https://portal.tecnopanel.cl:8080'

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

function escapar(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

// Correo de bienvenida con la dirección del portal, el usuario y la clave inicial. En el servidor
// RESEND_API_URL apunta a tp-fn-mailer (Microsoft Graph, como portal@tecnopanel.cl); sin esa
// variable va a la API de Resend. Devuelve el error en vez de lanzarlo: la cuenta ya quedó creada.
async function enviarCredenciales(
  d: { nombre: string; email: string; password: string; url: string; exigirCambio: boolean },
): Promise<string | null> {
  if (!RESEND_API_KEY) return 'Envío de correo no configurado (falta RESEND_API_KEY)'
  const fila = (etiqueta: string, valor: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">${etiqueta}</td><td style="padding:6px 0;font-weight:bold">${valor}</td></tr>`
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:520px">
      <p><img src="cid:logo-tecnopanel" alt="Tecnopanel" style="height:40px"></p>
      <p>Hola ${escapar(d.nombre)},</p>
      <p>Se creó tu cuenta en el Portal Tecnopanel. Estos son tus datos de acceso:</p>
      <table style="border-collapse:collapse;margin:8px 0 16px">
        ${fila('Dirección', `<a href="${escapar(d.url)}">${escapar(d.url)}</a>`)}
        ${fila('Usuario', escapar(d.email))}
        ${fila('Contraseña', `<span style="font-family:Consolas,monospace">${escapar(d.password)}</span>`)}
      </table>
      <p><a href="${escapar(d.url)}" style="background:#ed3224;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ingresar al portal</a></p>
      <p>${d.exigirCambio
        ? 'Al ingresar por primera vez el sistema te pedirá cambiar la contraseña.'
        : 'Te recomendamos cambiar la contraseña después de tu primer ingreso.'}</p>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">Correo automático de Tecnopanel Portal · no compartas estos datos.</p>
    </div>`
  try {
    const resp = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: d.email, subject: 'Tu acceso al Portal Tecnopanel', html }),
    })
    if (resp.ok) return null
    const detalle = await resp.text()
    console.error('No se pudo enviar el correo de credenciales a', d.email, '->', detalle)
    return `El servidor de correo rechazó el envío: ${detalle}`
  } catch (err) {
    return err instanceof Error ? err.message : 'Error al enviar el correo'
  }
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

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', callerUser.user.id)
    .single()
  if (callerProfileErr) return json({ error: callerProfileErr.message }, 500)
  if (!callerProfile?.is_super_admin) return json({ error: 'Requiere administrador' }, 403)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }
  const { action } = body

  try {
    if (action === 'create') {
      const { nombre, apellido, email, password, enviar_credenciales, exigir_cambio_clave } = body
      if (!nombre || !email || !password) return json({ error: 'Faltan campos requeridos' }, 400)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, apellido: apellido ?? '' },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      // El trigger on_auth_user_created ya insertó la fila en profiles (id, nombre, apellido, email).
      if (!enviar_credenciales) return json({ id: created.user.id })
      // La dirección es la del portal desde donde se creó la cuenta (la misma que verá el usuario).
      const url = req.headers.get('origin') || PORTAL_URL
      const correoError = await enviarCredenciales({
        nombre, email, password, url, exigirCambio: !!exigir_cambio_clave,
      })
      return json({ id: created.user.id, correoEnviado: !correoError, correoError })
    }

    if (action === 'update') {
      const { userId, nombre, apellido, email, activo, is_super_admin, must_change_password } = body
      if (!userId) return json({ error: 'Falta userId' }, 400)

      const patch: Record<string, unknown> = {}
      if (nombre !== undefined) patch.nombre = nombre
      if (apellido !== undefined) patch.apellido = apellido
      if (email !== undefined) patch.email = email
      if (activo !== undefined) patch.activo = activo
      if (is_super_admin !== undefined) patch.is_super_admin = is_super_admin
      if (must_change_password !== undefined) patch.must_change_password = must_change_password

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

    if (action === 'list_last_logins') {
      // Único lugar donde se puede leer auth.users.last_sign_in_at (protegido, no
      // expuesto vía PostgREST) — se resuelve acá con service role en vez de mantener
      // un profiles.last_login manual que se desincroniza. perPage cubre hasta 1000
      // cuentas; si el hub crece más allá de eso, paginar.
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (error) return json({ error: error.message }, 400)
      const logins: Record<string, string | null> = {}
      for (const u of data.users) logins[u.id] = u.last_sign_in_at ?? null
      return json({ logins })
    }

    if (action === 'delete') {
      const { userId } = body
      if (!userId) return json({ error: 'Falta userId' }, 400)
      if (userId === callerUser.user.id) return json({ error: 'No puedes eliminar tu propio usuario' }, 400)
      const { data: target } = await admin.from('profiles').select('is_root').eq('id', userId).single()
      if (target?.is_root) return json({ error: 'Esta cuenta no se puede eliminar' }, 400)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev'

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

// Envía una copia de respaldo al propio correo del usuario autenticado — nunca a un
// destinatario arbitrario que mande el cliente, para no quedar como relay abierto.
// Vía API de Resend (https://resend.com), no SMTP — no depende de admin de M365.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: callerUser, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerUser.user?.email) return json({ error: 'No autenticado' }, 401)

  if (!RESEND_API_KEY) {
    return json({ error: 'Envío de correo no configurado (falta RESEND_API_KEY)' }, 500)
  }

  const { subject, html } = await req.json()
  if (!subject || !html) return json({ error: 'Faltan campos requeridos (subject, html)' }, 400)

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: callerUser.user.email,
      subject,
      html,
    }),
  })

  if (!resp.ok) {
    const detalle = await resp.text()
    return json({ error: `Resend rechazó el envío: ${detalle}` }, 500)
  }

  return json({ ok: true })
})

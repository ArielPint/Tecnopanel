import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com'
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '587')
const SMTP_USER = Deno.env.get('SMTP_USER')!
const SMTP_PASS = Deno.env.get('SMTP_PASS')!

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
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: callerUser, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerUser.user?.email) return json({ error: 'No autenticado' }, 401)

  if (!SMTP_USER || !SMTP_PASS) {
    return json({ error: 'Envío de correo no configurado (faltan SMTP_USER / SMTP_PASS)' }, 500)
  }

  const { subject, html } = await req.json()
  if (!subject || !html) return json({ error: 'Faltan campos requeridos (subject, html)' }, 400)

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: false,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  })

  try {
    await client.send({
      from: SMTP_USER,
      to: callerUser.user.email,
      subject,
      html,
    })
    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error enviando correo' }, 500)
  } finally {
    await client.close()
  }
})

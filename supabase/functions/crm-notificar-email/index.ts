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

function escapar(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

// Envía por correo las notificaciones del CRM que el cliente acaba de insertar.
// El cuerpo solo trae los ids: el contenido y el destinatario se leen de la tabla
// `notifications` con la service role, así nadie puede mandar texto ni destinatarios
// arbitrarios a través de esta función.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller.user) return json({ error: 'No autenticado' }, 401)

  if (!RESEND_API_KEY) {
    console.error('Falta el secret RESEND_API_KEY en el proyecto: no se puede enviar correo')
    return json({ error: 'Falta RESEND_API_KEY' }, 500)
  }

  const { notification_ids } = await req.json()
  if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
    return json({ error: 'notification_ids requerido' }, 400)
  }

  const { data: notifs, error } = await admin
    .from('notifications')
    .select('id,titulo,mensaje,oportunidad_id,user_id,profiles:user_id(nombre,email)')
    .in('id', notification_ids.slice(0, 50))
  if (error) {
    console.error('No se pudieron leer las notificaciones', error.message)
    return json({ error: error.message }, 500)
  }

  const origin = req.headers.get('origin') ?? ''
  let enviados = 0
  const fallos: string[] = []
  console.log('notificaciones a enviar:', (notifs ?? []).length, '| from:', FROM_EMAIL)

  for (const n of notifs ?? []) {
    const perfil = n.profiles as { nombre: string; email: string } | null
    if (!perfil?.email) continue
    const link = origin && n.oportunidad_id ? `${origin}/crm/oportunidad/${n.oportunidad_id}` : ''
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
        <p>Hola ${escapar(perfil.nombre ?? '')},</p>
        <p style="font-size:16px;font-weight:bold;margin:16px 0 4px">${escapar(n.titulo)}</p>
        <p style="margin:0 0 16px">${escapar(n.mensaje ?? '')}</p>
        ${link ? `<p><a href="${link}" style="background:#ed3224;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir en el CRM</a></p>` : ''}
        <p style="font-size:12px;color:#9ca3af;margin-top:24px">Notificación automática de Tecnopanel Hub · CRM</p>
      </div>`
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: perfil.email, subject: n.titulo, html }),
    })
    if (resp.ok) enviados++
    else {
      const detalle = await resp.text()
      console.error('Resend rechazó el envío a', perfil.email, '->', detalle)
      fallos.push(detalle)
    }
  }

  // Si no salio ninguno habiendo destinatarios, es un fallo real y el cliente debe verlo.
  if (enviados === 0 && (notifs ?? []).length > 0) {
    return json({ error: fallos[0] ?? 'Ningun destinatario tenia correo registrado' }, 500)
  }
  return json({ ok: true, enviados, fallidos: fallos.length })
})

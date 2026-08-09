import { supabase } from '@/lib/supabaseClient'

// Mismo patrón que control-planta.html: invoca la Edge Function telegram-notify
// existente. Si ningún chat de planta_telegram_chats tiene el evento
// 'factura_supera_oc' registrado en su columna eventos, la función simplemente
// no envía nada (sent: 0) — no es un error, solo falta esa configuración.
export async function notificarFacturaSuperaOC(mensaje: string) {
  try {
    const { error } = await supabase.functions.invoke('telegram-notify', {
      body: { evento: 'factura_supera_oc', message: mensaje },
    })
    if (error) console.warn('No se pudo enviar la notificación de Telegram', error.message)
  } catch (err) {
    console.warn('No se pudo enviar la notificación de Telegram', err)
  }
}

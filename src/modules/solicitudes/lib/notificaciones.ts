import { supabase } from '@/lib/supabaseClient'

// Misma tabla `notifications` que usa la campanita del CRM (id, user_id, tipo,
// titulo, mensaje, leida, created_at) — acá se reusa para avisar a los usuarios
// con permiso solicitudes:editar de esa obra cuando un usuario restringido
// guarda una solicitud (nunca la puede enviar él mismo).
export async function notificarNuevaSolicitud(proyectoId: string, numero: number, grupoNombre: string, nombreUsuario: string) {
  try {
    const { data: admins, error: permError } = await supabase
      .from('permisos')
      .select('user_id')
      .eq('proyecto_id', proyectoId)
      .eq('modulo_key', 'solicitudes')
      .eq('accion', 'editar')
    if (permError || !admins?.length) return

    const rows = admins.map((a) => ({
      user_id: a.user_id,
      tipo: 'solicitud_nueva',
      titulo: `Nueva solicitud N° ${numero} · ${grupoNombre}`,
      mensaje: `${nombreUsuario} guardó una solicitud pendiente de envío.`,
    }))
    const { error } = await supabase.from('notifications').insert(rows)
    if (error) console.warn('No se pudo crear la notificación de solicitud', error.message)
  } catch (err) {
    console.warn('No se pudo crear la notificación de solicitud', err)
  }
}

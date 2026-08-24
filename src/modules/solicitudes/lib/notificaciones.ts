import { supabase } from '@/lib/supabaseClient'

// Tabla propia `solicitudes_notificaciones` (independiente de `notifications`,
// la del CRM) — avisa a los usuarios con permiso solicitudes:editar de esa obra
// cuando un usuario restringido guarda una solicitud (nunca la puede enviar él mismo).
export async function notificarNuevaSolicitud(proyectoId: string, numero: number, grupoNombre: string, nombreUsuario: string) {
  try {
    // RLS de `permisos` solo deja ver las filas propias — el usuario restringido que
    // dispara esto no puede leer quién tiene solicitudes:editar directamente, por eso
    // pasa por esta función (SECURITY DEFINER) en vez de consultar la tabla.
    const { data: admins, error: permError } = await supabase.rpc('solicitudes_admin_ids', { p_proyecto_id: proyectoId })
    if (permError || !admins?.length) return

    const rows = (admins as { user_id: string }[]).map((a) => ({
      user_id: a.user_id,
      tipo: 'solicitud_nueva',
      titulo: `Nueva solicitud N° ${numero} · ${grupoNombre}`,
      mensaje: `${nombreUsuario} guardó una solicitud pendiente de envío.`,
    }))
    const { error } = await supabase.from('solicitudes_notificaciones').insert(rows)
    if (error) console.warn('No se pudo crear la notificación de solicitud', error.message)
  } catch (err) {
    console.warn('No se pudo crear la notificación de solicitud', err)
  }
}

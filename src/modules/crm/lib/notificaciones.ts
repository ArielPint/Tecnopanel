import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

export interface NuevaNotificacion {
  user_id: string
  tipo: string
  titulo: string
  mensaje?: string | null
  oportunidad_id?: string | null
}

/** Gerentes y jefes: además del vendedor, reciben aviso de cada cambio de etapa. */
export const ROLES_GERENCIA = ['gerente_general', 'gerente_ventas', 'jefe_ingenieria']

/** Gerencia y administración — espejo de public.crm_es_gerente(). Son quienes editan
 *  oportunidades de otros vendedores y quienes aprueban un margen bajo el mínimo. */
export const ROLES_GERENCIA_ADMIN = ['admin', 'gerente_general', 'gerente_ventas']

/** Único punto de creación de notificaciones del CRM: inserta las filas que alimentan la
 *  campana y dispara el correo con los ids recién creados. La edge function relee el
 *  contenido desde la tabla, así el correo nunca lleva texto ni destinatarios arbitrarios.
 *  El envío es best-effort: si el correo falla, la notificación en pantalla igual queda. */
export async function notificar(rows: NuevaNotificacion[], contexto: string) {
  const filas = rows.filter(r => r.user_id)
  if (!filas.length) return
  // Via RPC y no INSERT directo: RLS solo deja leer las notificaciones propias, asi que
  // un `insert(...).select('id')` dirigido a otra persona falla entero y no inserta nada.
  const { data, error } = await supabase.rpc('crm_notificar', { p_filas: filas })
  if (handleSupabaseError(error, contexto)) return
  const ids = (data as string[] | null) ?? []
  if (!ids.length) return
  const { error: mailErr } = await supabase.functions.invoke('crm-notificar-email', {
    body: { notification_ids: ids },
  })
  // El correo es best-effort, pero no puede fallar en silencio: la campana ya quedo
  // guardada, asi que se avisa sin cortar el flujo.
  if (mailErr) {
    console.error(contexto + '.email', mailErr)
    toast.warning('El aviso quedó en la campana, pero el correo no se pudo enviar')
  }
}

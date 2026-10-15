import { supabase } from '@/lib/supabaseClient'
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
 *  campana. El correo lo manda el servidor (tarea TP-Correos-Notificaciones, cada minuto),
 *  leyendo la tabla `notifications`; así también salen por correo los avisos que crea la
 *  base sola (hitos VIT por vencer) y nunca se envía texto ni destinatarios arbitrarios. */
export async function notificar(rows: NuevaNotificacion[], contexto: string) {
  const filas = rows.filter(r => r.user_id)
  if (!filas.length) return
  // Via RPC y no INSERT directo: RLS solo deja leer las notificaciones propias, asi que
  // un `insert(...).select('id')` dirigido a otra persona falla entero y no inserta nada.
  const { error } = await supabase.rpc('crm_notificar', { p_filas: filas })
  handleSupabaseError(error, contexto)
}

import { supabase } from './supabaseClient'
import { getProyectoId } from './proyectoIds'

async function reemplazarPermisos(userId: string, proyectoSlug: string, filas: { modulo_key: string; accion: string }[]) {
  const proyectoId = await getProyectoId(proyectoSlug)
  const { error: delErr } = await supabase.from('permisos').delete().eq('user_id', userId).eq('proyecto_id', proyectoId)
  if (delErr) throw new Error(delErr.message)
  if (filas.length === 0) return
  const { error: insErr } = await supabase
    .from('permisos')
    .insert(filas.map((f) => ({ user_id: userId, proyecto_id: proyectoId, modulo_key: f.modulo_key, accion: f.accion })))
  if (insErr) throw new Error(insErr.message)
}

/** CRM: un usuario tiene "ver" sobre cada string literal de módulo que el admin le marcó (profiles.modulos). */
export async function syncPermisosCrm(userId: string, modulos: string[]) {
  await reemplazarPermisos(
    userId,
    'crm',
    modulos.map((m) => ({ modulo_key: m, accion: 'ver' })),
  )
}

/** La Chacra: "ver" por página habilitada (pages.<pid>.access) + "editar" por sección financiera (financiero:<seccion>). */
export async function syncPermisosLaChacra(
  userId: string,
  pages: Record<string, { access: boolean }>,
  financieroEdit: Record<string, boolean>,
) {
  const filas: { modulo_key: string; accion: string }[] = []
  for (const [pid, def] of Object.entries(pages)) {
    if (def.access) filas.push({ modulo_key: pid, accion: 'ver' })
  }
  for (const [seccion, on] of Object.entries(financieroEdit)) {
    if (on) filas.push({ modulo_key: `financiero:${seccion}`, accion: 'editar' })
  }
  await reemplazarPermisos(userId, 'la-chacra', filas)
}

import { supabase } from './supabaseClient'
import { getProyectoId } from './proyectoIds'

async function reemplazarPermisos(userId: string, proyectoId: string, filas: { modulo_key: string; accion: string }[]) {
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
  const proyectoId = await getProyectoId('crm')
  await reemplazarPermisos(
    userId,
    proyectoId,
    modulos.map((m) => ({ modulo_key: m, accion: 'ver' })),
  )
}

/**
 * Cualquier proyecto tipo obra (La Chacra, y cualquiera creado después): "ver" por página
 * habilitada (pages.<pid>.access) + "editar" por sección financiera (financiero:<seccion>) +
 * acciones extra de otros módulos (clave literal "modulo_key:accion", ej. "estados_pago:aprobar",
 * "logistica:editar") — mismo mecanismo que financieroEdit, generalizado para no repetir el
 * patrón por cada módulo nuevo con acciones granulares. Antes hardcodeado al proyecto_id de
 * 'la-chacra' — ahora recibe el proyecto_id real, así funciona para cualquier obra.
 */
export async function syncPermisosProyecto(
  userId: string,
  proyectoId: string,
  pages: Record<string, { access: boolean }>,
  financieroEdit: Record<string, boolean>,
  accionesExtra: Record<string, boolean> = {},
  tabs: Record<string, string[]> = {},
) {
  const filas: { modulo_key: string; accion: string }[] = []
  for (const [pid, def] of Object.entries(pages)) {
    if (!def.access) continue
    filas.push({ modulo_key: pid, accion: 'ver' })
    for (const tab of tabs[pid] ?? []) {
      filas.push({ modulo_key: `${pid}:${tab}`, accion: 'ver' })
    }
  }
  for (const [seccion, on] of Object.entries(financieroEdit)) {
    if (on) filas.push({ modulo_key: `financiero:${seccion}`, accion: 'editar' })
  }
  for (const [key, on] of Object.entries(accionesExtra)) {
    if (!on) continue
    const separador = key.lastIndexOf(':')
    filas.push({ modulo_key: key.slice(0, separador), accion: key.slice(separador + 1) })
  }
  await reemplazarPermisos(userId, proyectoId, filas)
}

/** Rol de negocio por proyecto (catálogo abierto, ver Fase E1) — reemplaza el 'full_access' decorativo. */
export async function syncRolNegocio(userId: string, proyectoId: string, rolNegocio: string) {
  const { error } = await supabase
    .from('project_access')
    // ponytail: 'rol' es legacy (NOT NULL, decorativo, nadie lo lee) — se rellena para no romper el INSERT
    .upsert({ user_id: userId, proyecto_id: proyectoId, rol: 'full_access', rol_negocio: rolNegocio }, { onConflict: 'user_id,proyecto_id' })
  if (error) throw new Error(error.message)
}

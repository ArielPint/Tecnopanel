import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import { comprimirImagen } from './imagen'

// Inspecciones programadas (fase 5). Fotos de los ítems en el bucket 'sso', carpeta
// inspecciones/<inspeccion_id>/. Cada "no cumple" se convierte en hallazgo con
// sso_inspeccion_generar_hallazgos() (lo asigna la base: encargado del área o un supervisor).

export interface Plantilla {
  id: string
  nombre: string
  descripcion: string | null
  /** null: a demanda (no entra al programa) */
  periodicidad_dias: number | null
  plazo_hallazgo_dias: number
  activo: boolean
}

export interface ItemPlantilla {
  id: string
  checklist_id: string
  orden: number
  texto: string
  activo: boolean
}

export type Resultado = 'cumple' | 'no_cumple' | 'na'

export interface Inspeccion {
  id: string
  checklist_id: string
  area_id: string | null
  fecha: string
  ubicacion: string | null
  observaciones: string | null
  inspector: string | null
  created_at: string
}

export interface InspeccionV extends Inspeccion {
  checklist: string
  cumple: number
  no_cumple: number
  no_aplica: number
  hallazgos: number
}

export interface Respuesta {
  inspeccion_id: string
  item_id: string
  texto: string
  resultado: Resultado
  observacion: string | null
  foto_path: string | null
  hallazgo_id: string | null
}

export type SituacionPrograma = 'nunca' | 'atrasada' | 'proxima' | 'al_dia'

export interface Programa {
  checklist_id: string
  area_id: string | null
  checklist: string
  periodicidad_dias: number
  ultima: string | null
  ultima_id: string | null
  proxima: string
  situacion: SituacionPrograma
  dias_atraso: number | null
}

/** % de cumplimiento: cumple / (cumple + no cumple); los "no aplica" no cuentan. */
export const cumplimiento = (i: { cumple: number; no_cumple: number }) =>
  i.cumple + i.no_cumple === 0 ? null : Math.round((i.cumple / (i.cumple + i.no_cumple)) * 100)

// ---------------------------------------------------------------- plantillas

export async function listarPlantillas(): Promise<Plantilla[]> {
  return (await unwrap(supabase.from('sso_checklists').select('id, nombre, descripcion, periodicidad_dias, plazo_hallazgo_dias, activo').order('nombre'))) as Plantilla[]
}

export async function listarItemsPlantilla(checklistId?: string): Promise<ItemPlantilla[]> {
  let q = supabase.from('sso_checklist_items').select('id, checklist_id, orden, texto, activo')
  if (checklistId) q = q.eq('checklist_id', checklistId)
  return (await unwrap(q.order('orden'))) as ItemPlantilla[]
}

export async function listarAreasPlantilla(): Promise<{ checklist_id: string; area_id: string }[]> {
  return (await unwrap(supabase.from('sso_checklist_areas').select('checklist_id, area_id'))) as { checklist_id: string; area_id: string }[]
}

/** Guarda la plantilla, sus áreas y sus ítems. Los ítems existentes no se borran (los usan
 *  inspecciones pasadas): se desactivan. Los nuevos llegan sin id. */
export async function guardarPlantilla(
  plantilla: Omit<Plantilla, 'id'> & { id?: string },
  areas: string[],
  items: { id?: string; texto: string; activo: boolean }[],
): Promise<string> {
  const { id, ...campos } = plantilla
  let chkId = id
  if (chkId) await unwrap(supabase.from('sso_checklists').update(campos).eq('id', chkId))
  else chkId = ((await unwrap(supabase.from('sso_checklists').insert(campos).select('id').single())) as { id: string }).id

  await unwrap(supabase.from('sso_checklist_areas').delete().eq('checklist_id', chkId))
  if (areas.length) await unwrap(supabase.from('sso_checklist_areas').insert(areas.map((a) => ({ checklist_id: chkId, area_id: a }))))

  for (const [orden, it] of items.entries()) {
    if (it.id) await unwrap(supabase.from('sso_checklist_items').update({ texto: it.texto, activo: it.activo, orden }).eq('id', it.id))
    else await unwrap(supabase.from('sso_checklist_items').insert({ checklist_id: chkId, texto: it.texto, activo: it.activo, orden }))
  }
  return chkId
}

// ---------------------------------------------------------------- programa e inspecciones

export async function listarPrograma(): Promise<Programa[]> {
  return (await unwrap(supabase.from('sso_programa_inspecciones').select('*').order('proxima'))) as Programa[]
}

export async function listarInspecciones(): Promise<InspeccionV[]> {
  return (await unwrap(supabase.from('sso_inspecciones_v').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }))) as InspeccionV[]
}

export async function obtenerInspeccion(id: string): Promise<InspeccionV | null> {
  return (await unwrap(supabase.from('sso_inspecciones_v').select('*').eq('id', id).maybeSingle())) as InspeccionV | null
}

export async function listarRespuestas(inspeccionIds?: string[]): Promise<Respuesta[]> {
  let q = supabase.from('sso_inspeccion_respuestas').select('*')
  if (inspeccionIds) q = q.in('inspeccion_id', inspeccionIds.length ? inspeccionIds : ['00000000-0000-0000-0000-000000000000'])
  return (await unwrap(q)) as Respuesta[]
}

export interface RespuestaNueva {
  item_id: string
  texto: string
  resultado: Resultado
  observacion: string | null
  foto: File | null
}

/** Registra la inspección con sus respuestas y fotos, y genera los hallazgos. Devuelve id y cuántos hallazgos.
 *  Si fallan las fotos o los hallazgos, la inspección ya quedó guardada: se informa y se puede reintentar. */
export async function registrarInspeccion(
  ficha: Pick<Inspeccion, 'checklist_id' | 'area_id' | 'fecha' | 'ubicacion' | 'observaciones'>,
  respuestas: RespuestaNueva[],
): Promise<{ id: string; hallazgos: number; avisos: string[] }> {
  const { id } = (await unwrap(supabase.from('sso_inspecciones').insert(ficha).select('id').single())) as { id: string }
  await unwrap(
    supabase.from('sso_inspeccion_respuestas').insert(
      respuestas.map((r) => ({ inspeccion_id: id, item_id: r.item_id, texto: r.texto, resultado: r.resultado, observacion: r.observacion })),
    ),
  )
  const avisos: string[] = []
  for (const r of respuestas.filter((x) => x.foto)) {
    try {
      const foto = await comprimirImagen(r.foto!)
      const path = `inspecciones/${id}/${r.item_id}-${Date.now()}-${nombreParaStorage(foto.name)}`
      const { error } = await supabase.storage.from('sso').upload(path, foto, { contentType: foto.type })
      if (error) throw new Error(error.message)
      await unwrap(supabase.from('sso_inspeccion_respuestas').update({ foto_path: path }).eq('inspeccion_id', id).eq('item_id', r.item_id))
    } catch (err) {
      avisos.push(`Foto de "${r.texto}": ${err instanceof Error ? err.message : 'no se pudo subir'}`)
    }
  }
  let hallazgos = 0
  if (respuestas.some((r) => r.resultado === 'no_cumple')) {
    try {
      hallazgos = await generarHallazgos(id)
    } catch (err) {
      avisos.push(`Hallazgos: ${err instanceof Error ? err.message : 'no se pudieron generar'}`)
    }
  }
  return { id, hallazgos, avisos }
}

export async function generarHallazgos(inspeccionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('sso_inspeccion_generar_hallazgos', { p_inspeccion_id: inspeccionId })
  if (error) throw new Error(error.message)
  return data as number
}

export async function eliminarInspeccion(i: Inspeccion, respuestas: Respuesta[]): Promise<void> {
  const fotos = respuestas.map((r) => r.foto_path).filter((p): p is string => !!p)
  if (fotos.length) await supabase.storage.from('sso').remove(fotos)
  await unwrap(supabase.from('sso_inspecciones').delete().eq('id', i.id))
}

export async function urlsFotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from('sso').createSignedUrls(paths, 3600)
  if (error) throw new Error(error.message)
  const urls: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl
  return urls
}

// ---------------------------------------------------------------- Excel

/** Una fila por ítem inspeccionado. */
export async function exportarInspeccionesExcel(inspecciones: InspeccionV[], respuestas: Respuesta[], nombreArea: (id: string | null) => string) {
  const XLSX = await cargarXLSX()
  const ins = new Map(inspecciones.map((i) => [i.id, i]))
  const serial = (f: string) => (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000
  const RES = { cumple: 'Cumple', no_cumple: 'No cumple', na: 'No aplica' }
  const filas = respuestas
    .filter((r) => ins.has(r.inspeccion_id))
    .map((r) => {
      const i = ins.get(r.inspeccion_id)!
      return {
        Fecha: serial(i.fecha),
        Plantilla: i.checklist,
        Área: i.area_id ? nombreArea(i.area_id) : 'General',
        Ubicación: i.ubicacion ?? '',
        Ítem: r.texto,
        Resultado: RES[r.resultado],
        Observación: r.observacion ?? '',
        Foto: r.foto_path ? 'Sí' : 'No',
        'Hallazgo generado': r.hallazgo_id ? 'Sí' : '',
      }
    })
    .sort((a, b) => b.Fecha - a.Fecha)
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: 0 })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
  hoja['!cols'] = [12, 24, 26, 22, 50, 11, 36, 6, 10].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Inspecciones')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-inspecciones-${sello}.xlsx`)
}

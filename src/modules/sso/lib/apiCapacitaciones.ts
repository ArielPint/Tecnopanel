import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import { comprimirImagen } from './imagen'

// Capacitaciones y charlas (fase 3). La evidencia (lista de asistencia firmada, foto o PDF) va en el
// bucket 'sso', carpeta del módulo: capacitaciones/<capacitacion_id>/<timestamp>-<nombre>.

export interface TipoCapacitacion {
  id: string
  nombre: string
  /** null: no vence (charla, inducción) */
  vigencia_meses: number | null
  activo: boolean
}

export interface Capacitacion {
  id: string
  tipo_id: string
  tema: string
  fecha: string
  duracion_min: number
  relator: string
  area_id: string | null
  lugar: string | null
  contenido: string | null
  evidencia_path: string | null
  evidencia_nombre: string | null
  registrado_por: string | null
  created_at: string
  updated_at: string
}

/** Fila de sso_capacitaciones_v */
export interface CapacitacionV extends Capacitacion {
  tipo: string
  vigencia_meses: number | null
  asistentes: number
  ausentes: number
  horas_hombre: number
}

export interface Asistente {
  capacitacion_id: string
  trabajador_id: string
  asistio: boolean
}

export type SituacionVigencia = 'vigente' | 'por_vencer' | 'vencido'

/** Fila de sso_capacitaciones_vigentes: la última vez que el trabajador hizo cada tipo. */
export interface VigenciaCapacitacion {
  trabajador_id: string
  tipo_id: string
  capacitacion_id: string
  fecha: string
  vencimiento: string | null
  situacion: SituacionVigencia
}

export type FichaCapacitacion = Pick<Capacitacion, 'tipo_id' | 'tema' | 'fecha' | 'duracion_min' | 'relator' | 'area_id' | 'lugar' | 'contenido'>

// ---------------------------------------------------------------- catálogo

export async function listarTiposCapacitacion(): Promise<TipoCapacitacion[]> {
  return (await unwrap(supabase.from('sso_tipos_capacitacion').select('id, nombre, vigencia_meses, activo').order('nombre'))) as TipoCapacitacion[]
}

export async function guardarTipoCapacitacion(t: Partial<TipoCapacitacion> & { nombre: string }): Promise<void> {
  const { id, ...campos } = t
  await unwrap(id ? supabase.from('sso_tipos_capacitacion').update(campos).eq('id', id) : supabase.from('sso_tipos_capacitacion').insert(campos))
}

// ---------------------------------------------------------------- capacitaciones

export async function listarCapacitaciones(): Promise<CapacitacionV[]> {
  return (await unwrap(supabase.from('sso_capacitaciones_v').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }))) as CapacitacionV[]
}

export async function obtenerCapacitacion(id: string): Promise<CapacitacionV | null> {
  return (await unwrap(supabase.from('sso_capacitaciones_v').select('*').eq('id', id).maybeSingle())) as CapacitacionV | null
}

export async function listarAsistentes(capacitacionId?: string): Promise<Asistente[]> {
  let q = supabase.from('sso_capacitacion_asistentes').select('capacitacion_id, trabajador_id, asistio')
  if (capacitacionId) q = q.eq('capacitacion_id', capacitacionId)
  return (await unwrap(q)) as Asistente[]
}

/** Historial de un trabajador: cada capacitación a la que fue citado, con si asistió. */
export async function listarCapacitacionesDeTrabajador(trabajadorId: string): Promise<(CapacitacionV & { asistio: boolean })[]> {
  const asis = (await unwrap(
    supabase.from('sso_capacitacion_asistentes').select('capacitacion_id, asistio').eq('trabajador_id', trabajadorId),
  )) as { capacitacion_id: string; asistio: boolean }[]
  if (asis.length === 0) return []
  const caps = (await unwrap(
    supabase.from('sso_capacitaciones_v').select('*').in('id', asis.map((a) => a.capacitacion_id)).order('fecha', { ascending: false }),
  )) as CapacitacionV[]
  const asistio = new Map(asis.map((a) => [a.capacitacion_id, a.asistio]))
  return caps.map((c) => ({ ...c, asistio: asistio.get(c.id) ?? false }))
}

export async function listarVigencias(trabajadorId?: string): Promise<VigenciaCapacitacion[]> {
  let q = supabase.from('sso_capacitaciones_vigentes').select('*')
  if (trabajadorId) q = q.eq('trabajador_id', trabajadorId)
  return (await unwrap(q)) as VigenciaCapacitacion[]
}

/** Crea o actualiza la capacitación y deja exactamente esos asistentes (presentes y ausentes). */
export async function guardarCapacitacion(
  id: string | null,
  ficha: FichaCapacitacion,
  asistentes: { trabajador_id: string; asistio: boolean }[],
): Promise<string> {
  let capId = id
  if (capId) {
    await unwrap(supabase.from('sso_capacitaciones').update(ficha).eq('id', capId))
  } else {
    const fila = (await unwrap(supabase.from('sso_capacitaciones').insert(ficha).select('id').single())) as { id: string }
    capId = fila.id
  }
  const actuales = await listarAsistentes(capId)
  const quedan = new Set(asistentes.map((a) => a.trabajador_id))
  const quitar = actuales.filter((a) => !quedan.has(a.trabajador_id)).map((a) => a.trabajador_id)
  if (quitar.length) await unwrap(supabase.from('sso_capacitacion_asistentes').delete().eq('capacitacion_id', capId).in('trabajador_id', quitar))
  if (asistentes.length) {
    await unwrap(
      supabase
        .from('sso_capacitacion_asistentes')
        .upsert(asistentes.map((a) => ({ capacitacion_id: capId, ...a })), { onConflict: 'capacitacion_id,trabajador_id' }),
    )
  }
  return capId
}

export async function eliminarCapacitacion(c: Capacitacion): Promise<void> {
  // el archivo primero: la política de storage exige que la capacitación exista
  if (c.evidencia_path) await supabase.storage.from('sso').remove([c.evidencia_path])
  await unwrap(supabase.from('sso_capacitaciones').delete().eq('id', c.id))
}

/** Sube (o reemplaza) la lista de asistencia firmada. Las fotos se achican igual que las de hallazgos. */
export async function subirEvidencia(c: Pick<Capacitacion, 'id' | 'evidencia_path'>, archivo: File): Promise<void> {
  const final = archivo.type.startsWith('image/') ? await comprimirImagen(archivo) : archivo
  const path = `capacitaciones/${c.id}/${Date.now()}-${nombreParaStorage(final.name)}`
  const { error } = await supabase.storage.from('sso').upload(path, final, { contentType: final.type })
  if (error) throw new Error(error.message)
  try {
    await unwrap(supabase.from('sso_capacitaciones').update({ evidencia_path: path, evidencia_nombre: archivo.name }).eq('id', c.id))
  } catch (err) {
    await supabase.storage.from('sso').remove([path])
    throw err
  }
  if (c.evidencia_path) await supabase.storage.from('sso').remove([c.evidencia_path])
}

export async function urlEvidencia(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('sso').createSignedUrl(path, 600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

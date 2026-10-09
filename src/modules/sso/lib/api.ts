import { supabase, unwrap } from '@/lib/supabaseClient'
import { comprimirImagen } from './imagen'
import { evidenciaPath, eliminarEvidenciaStorage, subirEvidencia } from '../services/storage'
import type { Area, EstadoSso, EventoBitacora, Evidencia, Hallazgo, TipoEvidencia, UsuarioSso } from './tipos'

export async function listarHallazgos(): Promise<Hallazgo[]> {
  return (await unwrap(supabase.from('sso_hallazgos_v').select('*').order('numero', { ascending: false }))) as Hallazgo[]
}

export async function obtenerHallazgo(id: string): Promise<Hallazgo | null> {
  return (await unwrap(supabase.from('sso_hallazgos_v').select('*').eq('id', id).maybeSingle())) as Hallazgo | null
}

export async function listarAreas(): Promise<Area[]> {
  return (await unwrap(supabase.from('sso_areas').select('id, nombre, encargado_user_id, activa').order('nombre'))) as Area[]
}

/** Personas con acceso SSO (y los admin), para elegir responsable o encargado. 'editar' = pueden responder. */
export async function listarUsuariosSso(accion: 'ver' | 'editar' = 'ver'): Promise<UsuarioSso[]> {
  const { data, error } = await supabase.rpc('sso_usuarios', { p_accion: accion })
  if (error) throw new Error(error.message)
  return (data ?? []) as UsuarioSso[]
}

export interface NuevoHallazgoInput {
  area_id: string | null
  ubicacion: string
  descripcion: string
  fecha_deteccion: string
  fecha_compromiso: string
  /** null: lo toma la base del encargado del área */
  responsable_user_id: string | null
}

export async function crearHallazgo(input: NuevoHallazgoInput): Promise<{ id: string; numero: number }> {
  const fila = { ...input, responsable_user_id: input.responsable_user_id ?? undefined }
  return (await unwrap(supabase.from('sso_hallazgos').insert(fila).select('id, numero').single())) as { id: string; numero: number }
}

export type EdicionHallazgo = Partial<
  Pick<Hallazgo, 'area_id' | 'ubicacion' | 'descripcion' | 'fecha_compromiso' | 'responsable_user_id' | 'accion_correctiva'>
>

export async function actualizarHallazgo(id: string, cambios: EdicionHallazgo): Promise<void> {
  await unwrap(supabase.from('sso_hallazgos').update(cambios).eq('id', id))
}

export async function eliminarHallazgo(hallazgo: Hallazgo, evidencias: Evidencia[]): Promise<void> {
  // Primero los archivos: la política de storage.objects exige que el hallazgo exista.
  // Las filas de sso_evidencias caen solas en cascada con el hallazgo.
  if (evidencias.length > 0) {
    const { error } = await supabase.storage.from('sso').remove(evidencias.map((e) => e.path))
    if (error) throw new Error(error.message)
  }
  await unwrap(supabase.from('sso_hallazgos').delete().eq('id', hallazgo.id))
}

export async function cambiarEstado(id: string, estado: EstadoSso, comentario?: string): Promise<void> {
  const { error } = await supabase.rpc('sso_cambiar_estado', {
    p_hallazgo_id: id,
    p_estado: estado,
    p_comentario: comentario?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function listarEvidencias(hallazgoId: string): Promise<Evidencia[]> {
  return (await unwrap(
    supabase.from('sso_evidencias').select('*').eq('hallazgo_id', hallazgoId).order('created_at'),
  )) as Evidencia[]
}

/** Comprime, sube al bucket y registra la fila. Si la fila falla, borra el archivo recién subido. */
export async function agregarEvidencia(hallazgoId: string, tipo: TipoEvidencia, archivo: File, userId: string): Promise<void> {
  const comprimida = await comprimirImagen(archivo)
  const path = await subirEvidencia(comprimida, evidenciaPath(hallazgoId, tipo, comprimida.name))
  const { error } = await supabase
    .from('sso_evidencias')
    .insert({ hallazgo_id: hallazgoId, tipo, path, nombre: archivo.name, subido_por: userId })
  if (error) {
    await eliminarEvidenciaStorage(path).catch(() => undefined)
    throw new Error(error.message)
  }
}

export async function eliminarEvidencia(evidencia: Evidencia): Promise<void> {
  await unwrap(supabase.from('sso_evidencias').delete().eq('id', evidencia.id))
  await eliminarEvidenciaStorage(evidencia.path)
}

export async function listarBitacora(hallazgoId: string): Promise<EventoBitacora[]> {
  return (await unwrap(
    supabase.from('sso_bitacora').select('*').eq('hallazgo_id', hallazgoId).order('created_at'),
  )) as EventoBitacora[]
}

export async function comentar(hallazgoId: string, comentario: string, userId: string): Promise<void> {
  await unwrap(supabase.from('sso_bitacora').insert({ hallazgo_id: hallazgoId, comentario: comentario.trim(), user_id: userId }))
}

export async function guardarArea(area: { id?: string; nombre: string; encargado_user_id: string | null; activa?: boolean }): Promise<void> {
  if (area.id) {
    const { id, ...cambios } = area
    await unwrap(supabase.from('sso_areas').update(cambios).eq('id', id))
  } else {
    await unwrap(supabase.from('sso_areas').insert(area))
  }
}

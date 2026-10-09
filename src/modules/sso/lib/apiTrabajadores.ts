import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import type { Empresa, Examen, ExamenVigente, FichaTrabajador, TipoExamen, Trabajador, TrabajadorV } from './tiposTrabajadores'

// Exámenes = datos de salud: bucket propio, distinto del de hallazgos ('sso'), y la RLS exige el
// permiso 'aprobar' del módulo Trabajadores. Ruta: examenes/<trabajador_id>/<timestamp>-<nombre>
const BUCKET_SALUD = 'sso-salud'

// ---------------------------------------------------------------- catálogos

export async function listarEmpresas(): Promise<Empresa[]> {
  return (await unwrap(supabase.from('sso_empresas').select('id, nombre, rut, propia, activa').order('propia', { ascending: false }).order('nombre'))) as Empresa[]
}

export async function guardarEmpresa(e: Partial<Empresa> & { nombre: string }): Promise<Empresa> {
  const { id, ...campos } = e
  const q = id ? supabase.from('sso_empresas').update(campos).eq('id', id) : supabase.from('sso_empresas').insert(campos)
  return (await unwrap(q.select('id, nombre, rut, propia, activa').single())) as Empresa
}

export async function listarTiposExamen(): Promise<TipoExamen[]> {
  return (await unwrap(supabase.from('sso_tipos_examen').select('id, nombre, vigencia_meses, activo').order('nombre'))) as TipoExamen[]
}

export async function guardarTipoExamen(t: Partial<TipoExamen> & { nombre: string }): Promise<void> {
  const { id, ...campos } = t
  await unwrap(id ? supabase.from('sso_tipos_examen').update(campos).eq('id', id) : supabase.from('sso_tipos_examen').insert(campos))
}

// ---------------------------------------------------------------- trabajadores

export async function listarTrabajadores(): Promise<TrabajadorV[]> {
  return (await unwrap(supabase.from('sso_trabajadores_v').select('*').order('apellidos').order('nombres'))) as TrabajadorV[]
}

export async function obtenerTrabajador(id: string): Promise<TrabajadorV | null> {
  return (await unwrap(supabase.from('sso_trabajadores_v').select('*').eq('id', id).maybeSingle())) as TrabajadorV | null
}

export async function crearTrabajador(ficha: FichaTrabajador): Promise<string> {
  const fila = (await unwrap(supabase.from('sso_trabajadores').insert(ficha).select('id').single())) as { id: string }
  return fila.id
}

export async function actualizarTrabajador(id: string, cambios: Partial<Trabajador>): Promise<void> {
  await unwrap(supabase.from('sso_trabajadores').update(cambios).eq('id', id))
}

export async function eliminarTrabajador(id: string): Promise<void> {
  const { error } = await supabase.from('sso_trabajadores').delete().eq('id', id)
  if (error) {
    // integrante (actual o pasado) del Comité Paritario: su historial no se borra
    if (error.message.includes('sso_comite_miembros')) throw new Error('Integra (o integró) el Comité Paritario: dalo de baja en vez de eliminarlo')
    throw new Error(error.message)
  }
}

/** Alta o actualización por RUT (importación). Cada fila trae la ficha completa: las celdas vacías
 *  del Excel ya vienen resueltas con el valor que tenía la ficha (ver lib/importarTrabajadores). */
export async function importarTrabajadores(filas: FichaTrabajador[]): Promise<void> {
  for (let i = 0; i < filas.length; i += 200) {
    await unwrap(supabase.from('sso_trabajadores').upsert(filas.slice(i, i + 200), { onConflict: 'rut' }))
  }
}

// ---------------------------------------------------------------- exámenes

export async function listarExamenes(trabajadorId: string): Promise<Examen[]> {
  return (await unwrap(
    supabase.from('sso_examenes').select('*').eq('trabajador_id', trabajadorId).order('fecha', { ascending: false }),
  )) as Examen[]
}

export async function listarExamenesVigentes(): Promise<ExamenVigente[]> {
  return (await unwrap(supabase.from('sso_examenes_vigentes').select('*'))) as ExamenVigente[]
}

export interface NuevoExamen {
  trabajador_id: string
  tipo_id: string
  fecha: string
  /** null: lo calcula la base con la vigencia del tipo */
  vencimiento: string | null
  resultado: Examen['resultado']
  observaciones: string | null
}

/** Registra el examen; el archivo (certificado, PDF o foto) es opcional. Si la fila falla, se borra el archivo. */
export async function registrarExamen(examen: NuevoExamen, archivo: File | null): Promise<void> {
  let archivo_path: string | null = null
  if (archivo) {
    archivo_path = `examenes/${examen.trabajador_id}/${Date.now()}-${nombreParaStorage(archivo.name)}`
    const { error } = await supabase.storage.from(BUCKET_SALUD).upload(archivo_path, archivo, { contentType: archivo.type })
    if (error) throw new Error(error.message)
  }
  const { error } = await supabase
    .from('sso_examenes')
    .insert({ ...examen, archivo_path, archivo_nombre: archivo?.name ?? null })
  if (error) {
    if (archivo_path) await supabase.storage.from(BUCKET_SALUD).remove([archivo_path])
    throw new Error(error.message)
  }
}

export async function eliminarExamen(examen: Examen): Promise<void> {
  if (examen.archivo_path) {
    const { error } = await supabase.storage.from(BUCKET_SALUD).remove([examen.archivo_path])
    if (error) throw new Error(error.message)
  }
  await unwrap(supabase.from('sso_examenes').delete().eq('id', examen.id))
}

export async function urlArchivoExamen(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_SALUD).createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

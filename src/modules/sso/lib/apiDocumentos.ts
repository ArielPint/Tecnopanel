import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'

// Documentos (fase 7): listado maestro con versiones. Archivos en el bucket 'sso', carpeta
// documentos/<documento_id>/. Se aceptan PDF, Word, Excel e imágenes, hasta 25 MB.

export const TIPOS_DOCUMENTO = [
  { key: 'procedimiento', label: 'Procedimiento de trabajo seguro' },
  { key: 'instructivo', label: 'Instructivo' },
  { key: 'matriz_iper', label: 'Matriz IPER' },
  { key: 'reglamento', label: 'Reglamento interno (RIOHS)' },
  { key: 'hds', label: 'Hoja de datos de seguridad (HDS)' },
  { key: 'plan_emergencia', label: 'Plan de emergencia' },
  { key: 'programa', label: 'Programa' },
  { key: 'registro', label: 'Registro / formulario' },
  { key: 'otro', label: 'Otro' },
] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['key']
export const TIPO_DOCUMENTO = Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t.key, t.label])) as Record<TipoDocumento, string>

export const ARCHIVOS_ACEPTADOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]
export const TAMANO_MAX_MB = 25

export type SituacionDocumento = 'vigente' | 'por_vencer' | 'vencido' | 'sin_version'
export const SITUACION_DOC: Record<SituacionDocumento, { label: string; clase: string }> = {
  vigente: { label: 'Vigente', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  por_vencer: { label: 'Por vencer', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  vencido: { label: 'Vencido', clase: 'bg-red-600 text-white' },
  sin_version: { label: 'Sin archivo', clase: 'bg-muted text-muted-foreground' },
}

export interface Documento {
  id: string
  codigo: string
  titulo: string
  tipo: TipoDocumento
  area_id: string | null
  responsable_user_id: string | null
  revision_meses: number | null
  descripcion: string | null
  activo: boolean
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface DocumentoV extends Documento {
  version_id: string | null
  version: string | null
  fecha_emision: string | null
  vigente_hasta: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  versiones: number
  situacion: SituacionDocumento
}

export interface Version {
  id: string
  documento_id: string
  version: string
  fecha_emision: string
  vigente_hasta: string | null
  archivo_path: string
  archivo_nombre: string
  cambios: string | null
  aprobado_por: string | null
  subido_por: string | null
  created_at: string
}

export type FichaDocumento = Pick<Documento, 'codigo' | 'titulo' | 'tipo' | 'area_id' | 'responsable_user_id' | 'revision_meses' | 'descripcion' | 'activo'>

export function errorArchivo(f: File): string | null {
  if (!ARCHIVOS_ACEPTADOS.includes(f.type)) return `"${f.name}": solo PDF, Word, Excel o imagen`
  if (f.size > TAMANO_MAX_MB * 1024 * 1024) return `"${f.name}" pesa más de ${TAMANO_MAX_MB} MB`
  return null
}

export async function listarDocumentos(): Promise<DocumentoV[]> {
  return (await unwrap(supabase.from('sso_documentos_v').select('*').order('codigo'))) as DocumentoV[]
}

export async function obtenerDocumento(id: string): Promise<DocumentoV | null> {
  return (await unwrap(supabase.from('sso_documentos_v').select('*').eq('id', id).maybeSingle())) as DocumentoV | null
}

export async function listarVersiones(documentoId: string): Promise<Version[]> {
  return (await unwrap(
    supabase.from('sso_documento_versiones').select('*').eq('documento_id', documentoId).order('fecha_emision', { ascending: false }).order('created_at', { ascending: false }),
  )) as Version[]
}

export async function guardarDocumento(id: string | null, ficha: FichaDocumento): Promise<string> {
  if (id) {
    await unwrap(supabase.from('sso_documentos').update(ficha).eq('id', id))
    return id
  }
  return ((await unwrap(supabase.from('sso_documentos').insert(ficha).select('id').single())) as { id: string }).id
}

export async function eliminarDocumento(id: string, versiones: Version[]): Promise<void> {
  if (versiones.length) await supabase.storage.from('sso').remove(versiones.map((v) => v.archivo_path))
  await unwrap(supabase.from('sso_documentos').delete().eq('id', id))
}

export interface NuevaVersion {
  version: string
  fecha_emision: string
  /** null: la calcula la base con la periodicidad de revisión */
  vigente_hasta: string | null
  cambios: string | null
  aprobado_por: string | null
}

/** Sube el archivo y registra la versión. Si la fila falla, borra el archivo. */
export async function subirVersion(documentoId: string, v: NuevaVersion, archivo: File): Promise<void> {
  const path = `documentos/${documentoId}/${Date.now()}-${nombreParaStorage(archivo.name)}`
  const { error } = await supabase.storage.from('sso').upload(path, archivo, { contentType: archivo.type })
  if (error) throw new Error(error.message)
  const { error: e2 } = await supabase.from('sso_documento_versiones').insert({ documento_id: documentoId, ...v, archivo_path: path, archivo_nombre: archivo.name })
  if (e2) {
    await supabase.storage.from('sso').remove([path])
    throw new Error(e2.message.includes('duplicate') ? `Ya existe la versión "${v.version}"` : e2.message)
  }
}

export async function eliminarVersion(v: Version): Promise<void> {
  await supabase.storage.from('sso').remove([v.archivo_path])
  await unwrap(supabase.from('sso_documento_versiones').delete().eq('id', v.id))
}

/** URL firmada para descargar; con el nombre original del archivo. */
export async function urlDocumento(path: string, nombre: string): Promise<string> {
  const { data, error } = await supabase.storage.from('sso').createSignedUrl(path, 600, { download: nombre })
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** Siguiente versión sugerida: "3" -> "4", "A" -> "B", "1.2" -> "1.3"; si no se entiende, vacío. */
export function siguienteVersion(actual: string | null): string {
  if (!actual) return '1'
  const m = actual.match(/^(.*?)(\d+)$/)
  if (m) return `${m[1]}${Number(m[2]) + 1}`
  if (/^[A-Y]$/i.test(actual)) return String.fromCharCode(actual.charCodeAt(0) + 1)
  return ''
}

/** Listado maestro de documentos (como lo pide una auditoría ISO 45001). */
export async function exportarListadoMaestro(docs: DocumentoV[], nombreArea: (id: string | null) => string, nombreUsuario: (id: string | null) => string) {
  const XLSX = await cargarXLSX()
  const serial = (f: string | null) => (f ? (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000 : null)
  const filas = docs.map((d) => ({
    Código: d.codigo,
    Título: d.titulo,
    Tipo: TIPO_DOCUMENTO[d.tipo],
    Área: d.area_id ? nombreArea(d.area_id) : 'Toda la empresa',
    Responsable: d.responsable_user_id ? nombreUsuario(d.responsable_user_id) : '',
    'Versión vigente': d.version ?? '',
    Emisión: serial(d.fecha_emision),
    'Vigente hasta': serial(d.vigente_hasta),
    'Revisión (meses)': d.revision_meses ?? '',
    Situación: SITUACION_DOC[d.situacion].label,
    Activo: d.activo ? 'Sí' : 'No',
  }))
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    for (const c of [6, 7]) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })]
      if (celda && typeof celda.v === 'number') celda.z = 'dd-mm-yyyy'
    }
  }
  hoja['!cols'] = [12, 40, 28, 24, 24, 10, 12, 12, 10, 12, 7].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Listado maestro')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-listado-maestro-${sello}.xlsx`)
}

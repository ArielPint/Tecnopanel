import { supabase } from '@/lib/supabaseClient'
import { errorTamanoArchivo, nombreParaStorage } from '@/lib/storageKey'
import type { AreaTarea, Motivo, Situacion, TipoContrato, TipoDoc, TipoDocEmpresa, TipoTrabajador } from './catalogos'

// Acceso a datos del portal Ingreso de Personal. Quién ve y hace qué lo decide la base (RLS y
// funciones ing_*): aquí no se filtra nada por rol.

const BUCKET = 'ingreso-personal'

export const ARCHIVOS_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx'

export interface DatosIngreso {
  sucursal: string
  area: string
  cargo: string
  tipo_trabajador: TipoTrabajador
  /** Solo contratistas: ing_empresas */
  empresa_id: string | null
  motivo: Motivo | null
  /** Solo si el motivo es reemplazo */
  reemplaza_a: string | null
  jefatura_directa: string | null
  fecha_ingreso: string
  tipo_contrato: TipoContrato
  jornada: string
  horario: string | null
  nombre: string
  rut: string
  telefono: string | null
  email: string | null
  req_ti: boolean
  ti_correo: boolean
  ti_notebook: boolean
  ti_pantalla: boolean
  ti_otros: string | null
  req_epp: boolean
  req_uniforme: boolean
  talla_zapato: string | null
  talla_polera: string | null
  talla_pantalon: string | null
  talla_chaqueta: string | null
  /** Otras tallas u observaciones de tallas */
  tallas: string | null
  req_vehiculo: boolean
  licencia_requerida: string | null
  observacion: string | null
}

export interface Ingreso extends DatosIngreso {
  id: string
  /** Siempre true: la inducción de seguridad es obligatoria */
  req_induccion: boolean
  numero: number
  estado: 'en_proceso' | 'ingresado' | 'anulado'
  buk_id: string | null
  motivo_anulacion: string | null
  creado_por: string
  cerrado_por: string | null
  fecha_cierre: string | null
  created_at: string
  creado_por_nombre: string | null
  cerrado_por_nombre: string | null
  empresa_nombre: string | null
  /** Documentos del mes en curso que le faltan a la empresa contratista (null si es de planta) */
  empresa_docs_faltan: number | null
  tareas_total: number
  tareas_hechas: number
  /** Tareas pendientes que la persona que mira puede completar */
  tareas_mias: number
  docs_requeridos: number
  docs_ok: number
  situacion: Situacion
}

export interface Tarea {
  id: string
  ingreso_id: string
  tipo: string
  area: AreaTarea
  titulo: string
  requiere_evidencia: boolean
  orden: number
  hecha: boolean
  hecha_por: string | null
  hecha_por_nombre: string | null
  fecha_hecha: string | null
  comentario: string | null
  /** La persona que mira puede completarla o reabrirla */
  puedo: boolean
}

export interface Archivo {
  id: string
  ingreso_id: string
  tarea_id: string | null
  tipo_doc: TipoDoc | null
  path: string
  nombre: string
  subido_por: string | null
  created_at: string
}

export interface EventoBitacora {
  id: string
  tipo: 'evento' | 'comentario'
  texto: string
  created_at: string
  usuario_nombre: string | null
}

/** Área que puede solicitar personal (Configuración > Áreas). */
export interface Area {
  id: string
  nombre: string
  activa: boolean
}

/** Empresa contratista: las de Estados de Pago (subcontratistas), por la vista ing_empresas_v. */
export interface Empresa {
  id: string
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  activa: boolean
}

/** Listado de trabajadores que la empresa confirmó para un mes: la foto de sus trabajadores activos. */
export interface Listado {
  empresa_id: string
  periodo: string
  total: number
  trabajadores: { rut: string; nombre: string; cargo: string | null; sucursal: string }[]
  confirmado_por: string | null
  confirmado_at: string
}

/** Documento mensual de una empresa contratista. periodo: primer día del mes. */
export interface DocEmpresa {
  id: string
  empresa_id: string
  periodo: string
  tipo: TipoDocEmpresa
  path: string
  nombre: string
  subido_por: string | null
  created_at: string
}

/** Jornada con su horario (Configuración > Jornadas). El horario se copia a la solicitud. */
export interface Jornada {
  id: string
  nombre: string
  horario: string | null
  activa: boolean
}

export interface Remuneracion {
  renta_ofrecida: number | null
  pretension_renta: number | null
  observacion: string | null
}

function error(e: { message: string; code?: string } | null, contexto?: string): never {
  if (e?.code === '23505') throw new Error('Ya hay un ingreso abierto con ese RUT.')
  throw new Error(contexto ? `${contexto}: ${e?.message}` : (e?.message ?? 'Error desconocido'))
}

export async function listarAreas(): Promise<Area[]> {
  const { data, error: e } = await supabase.from('ing_areas').select('id, nombre, activa').order('nombre')
  if (e) error(e)
  return (data ?? []) as Area[]
}

function errorArea(e: { message: string; code?: string }): never {
  if (e.code === '23505') throw new Error('Ya existe un área con ese nombre.')
  error(e)
}

export async function crearArea(nombre: string): Promise<void> {
  const { error: e } = await supabase.from('ing_areas').insert({ nombre })
  if (e) errorArea(e)
}

export async function actualizarArea(id: string, cambios: Partial<Pick<Area, 'nombre' | 'activa'>>): Promise<void> {
  const { error: e } = await supabase.from('ing_areas').update(cambios).eq('id', id)
  if (e) errorArea(e)
}

export async function eliminarArea(id: string): Promise<void> {
  const { error: e } = await supabase.from('ing_areas').delete().eq('id', id)
  if (e) error(e)
}

export async function listarJornadas(): Promise<Jornada[]> {
  const { data, error: e } = await supabase.from('ing_jornadas').select('id, nombre, horario, activa').order('nombre')
  if (e) error(e)
  return (data ?? []) as Jornada[]
}

function errorJornada(e: { message: string; code?: string }): never {
  if (e.code === '23505') throw new Error('Ya existe una jornada con ese nombre.')
  error(e)
}

export async function crearJornada(nombre: string, horario: string | null): Promise<void> {
  const { error: e } = await supabase.from('ing_jornadas').insert({ nombre, horario })
  if (e) errorJornada(e)
}

export async function actualizarJornada(id: string, cambios: Partial<Pick<Jornada, 'nombre' | 'horario' | 'activa'>>): Promise<void> {
  const { error: e } = await supabase.from('ing_jornadas').update(cambios).eq('id', id)
  if (e) errorJornada(e)
}

export async function eliminarJornada(id: string): Promise<void> {
  const { error: e } = await supabase.from('ing_jornadas').delete().eq('id', id)
  if (e) error(e)
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data, error: e } = await supabase.from('ing_empresas_v').select('*').order('nombre')
  if (e) error(e)
  return (data ?? []) as Empresa[]
}

/** Crea o corrige una empresa de la lista de Estados de Pago (RRHH y Prevención). */
export async function guardarEmpresa(d: Omit<Empresa, 'id'> & { id?: string }): Promise<void> {
  const { error: e } = await supabase.rpc('ing_guardar_empresa', {
    p_id: d.id ?? null,
    p_nombre: d.nombre,
    p_rut: d.rut,
    p_email: d.email,
    p_telefono: d.telefono,
    p_activa: d.activa,
  })
  if (e) error(e)
}

/** Listados confirmados de un mes ('YYYY-MM-01'): de todas las empresas que se pueden ver. */
export async function listarListados(periodo: string): Promise<Listado[]> {
  const { data, error: e } = await supabase.from('ing_listados').select('*').eq('periodo', periodo)
  if (e) error(e)
  return (data ?? []) as Listado[]
}

/** Confirma el listado del mes. Sin empresa, el de la empresa de quien está conectado. Devuelve el total. */
export async function confirmarListado(periodo: string, empresaId?: string): Promise<number> {
  const { data, error: e } = await supabase.rpc('ing_confirmar_listado', { p_periodo: periodo, p_empresa_id: empresaId ?? null })
  if (e) error(e)
  return data as number
}

/** Documentos de todas las empresas en un mes ('YYYY-MM-01'). */
export async function listarDocsEmpresas(periodo: string): Promise<DocEmpresa[]> {
  const { data, error: e } = await supabase.from('ing_empresa_docs').select('*').eq('periodo', periodo).order('created_at')
  if (e) error(e)
  return (data ?? []) as DocEmpresa[]
}

export async function subirDocEmpresa(empresaId: string, periodo: string, tipo: TipoDocEmpresa, file: File): Promise<void> {
  const tamano = errorTamanoArchivo(file)
  if (tamano) throw new Error(tamano)
  if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 25 MB, el máximo de este portal.`)
  const path = `empresas/${empresaId}/${periodo.slice(0, 7)}/${Date.now()}-${nombreParaStorage(file.name)}`
  const { error: eSubir } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (eSubir) error(eSubir, `No se pudo subir "${file.name}"`)
  const { error: eFila } = await supabase
    .from('ing_empresa_docs')
    .insert({ empresa_id: empresaId, periodo, tipo, path, nombre: file.name })
  if (eFila) {
    await supabase.storage.from(BUCKET).remove([path])
    error(eFila)
  }
}

export async function eliminarDocEmpresa(d: DocEmpresa): Promise<void> {
  const { data, error: e } = await supabase.from('ing_empresa_docs').delete().eq('id', d.id).select('id')
  if (e) error(e)
  if (!data?.length) throw new Error('No puedes eliminar este documento')
  await supabase.storage.from(BUCKET).remove([d.path])
}

/** Nombre de quien está conectado, para mostrar quién completa el formulario. */
export async function miNombre(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('nombre, apellido, email').eq('id', userId).maybeSingle()
  if (!data) return null
  return [data.nombre, data.apellido].filter(Boolean).join(' ').trim() || data.email
}

export async function listarIngresos(): Promise<Ingreso[]> {
  const { data, error: e } = await supabase.from('ing_ingresos_v').select('*').order('created_at', { ascending: false })
  if (e) error(e)
  return (data ?? []) as Ingreso[]
}

export async function obtenerIngreso(id: string): Promise<Ingreso | null> {
  const { data, error: e } = await supabase.from('ing_ingresos_v').select('*').eq('id', id).maybeSingle()
  if (e) error(e)
  return data as Ingreso | null
}

export async function listarTareas(ingresoId: string): Promise<Tarea[]> {
  const { data, error: e } = await supabase.from('ing_tareas_v').select('*').eq('ingreso_id', ingresoId).order('orden')
  if (e) error(e)
  return (data ?? []) as Tarea[]
}

/** Solo trae lo que la persona puede ver: los documentos personales, RRHH y el coordinador. */
export async function listarArchivos(ingresoId: string): Promise<Archivo[]> {
  const { data, error: e } = await supabase.from('ing_archivos').select('*').eq('ingreso_id', ingresoId).order('created_at')
  if (e) error(e)
  return (data ?? []) as Archivo[]
}

export async function listarBitacora(ingresoId: string): Promise<EventoBitacora[]> {
  const { data, error: e } = await supabase
    .from('ing_bitacora_v')
    .select('id, tipo, texto, created_at, usuario_nombre')
    .eq('ingreso_id', ingresoId)
    .order('created_at', { ascending: false })
  if (e) error(e)
  return (data ?? []) as EventoBitacora[]
}

/** null para quien no es RRHH (la RLS no devuelve la fila) o si no se indicó renta. */
export async function obtenerRemuneracion(ingresoId: string): Promise<Remuneracion | null> {
  const { data, error: e } = await supabase
    .from('ing_remuneracion')
    .select('renta_ofrecida, pretension_renta, observacion')
    .eq('ingreso_id', ingresoId)
    .maybeSingle()
  if (e) error(e)
  return data as Remuneracion | null
}

function tieneRenta(r: Remuneracion | null): r is Remuneracion {
  return !!r && (r.renta_ofrecida != null || r.pretension_renta != null || !!r.observacion?.trim())
}

/** Crea la solicitud y, si se indicó, la renta (que después solo ve RRHH). Devuelve el id. */
export async function crearIngreso(datos: DatosIngreso, renta: Remuneracion | null): Promise<string> {
  const { data, error: e } = await supabase.from('ing_ingresos').insert(datos).select('id').single()
  if (e) error(e)
  const id = (data as { id: string }).id
  if (tieneRenta(renta)) {
    // Sin .select(): quien crea puede insertar la renta pero no leerla de vuelta
    const { error: eRenta } = await supabase.from('ing_remuneracion').insert({ ingreso_id: id, ...renta })
    if (eRenta) error(eRenta, 'La solicitud quedó creada, pero no se pudo guardar la renta (RRHH puede ingresarla)')
  }
  return id
}

export async function actualizarIngreso(id: string, datos: Partial<DatosIngreso>): Promise<void> {
  const { error: e } = await supabase.from('ing_ingresos').update(datos).eq('id', id)
  if (e) error(e)
}

export async function guardarRemuneracion(ingresoId: string, renta: Remuneracion): Promise<void> {
  const { error: e } = await supabase.from('ing_remuneracion').upsert({ ingreso_id: ingresoId, ...renta }, { onConflict: 'ingreso_id' })
  if (e) error(e)
}

async function subir(path: string, file: File, fila: Record<string, unknown>): Promise<void> {
  const tamano = errorTamanoArchivo(file)
  if (tamano) throw new Error(tamano)
  if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 25 MB, el máximo de este portal.`)
  const { error: eSubir } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (eSubir) error(eSubir, `No se pudo subir "${file.name}"`)
  const { error: eFila } = await supabase.from('ing_archivos').insert({ ...fila, path, nombre: file.name })
  if (eFila) {
    await supabase.storage.from(BUCKET).remove([path])
    error(eFila)
  }
}

export function subirDocumento(ingresoId: string, tipo: TipoDoc, file: File): Promise<void> {
  const path = `${ingresoId}/docs/${Date.now()}-${nombreParaStorage(file.name)}`
  return subir(path, file, { ingreso_id: ingresoId, tipo_doc: tipo })
}

export function subirEvidencia(ingresoId: string, tareaId: string, file: File): Promise<void> {
  const path = `${ingresoId}/tareas/${tareaId}/${Date.now()}-${nombreParaStorage(file.name)}`
  return subir(path, file, { ingreso_id: ingresoId, tarea_id: tareaId })
}

/** Primero la fila (su política decide si se puede), después el archivo. */
export async function eliminarArchivo(a: Archivo): Promise<void> {
  const { data, error: e } = await supabase.from('ing_archivos').delete().eq('id', a.id).select('id')
  if (e) error(e)
  if (!data?.length) throw new Error('No puedes eliminar este archivo')
  await supabase.storage.from(BUCKET).remove([a.path])
}

export async function abrirArchivo(a: Pick<Archivo, 'path'>): Promise<void> {
  const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 600)
  if (e || !data?.signedUrl) error(e ?? { message: 'Sin enlace' }, 'No se pudo abrir el archivo')
  window.open(data.signedUrl, '_blank')
}

export async function completarTarea(tareaId: string, comentario: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_completar_tarea', { p_tarea_id: tareaId, p_comentario: comentario || null })
  if (e) error(e)
}

export async function reabrirTarea(tareaId: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_reabrir_tarea', { p_tarea_id: tareaId })
  if (e) error(e)
}

export async function cerrarIngreso(id: string, bukId: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_cerrar', { p_ingreso_id: id, p_buk_id: bukId || null })
  if (e) error(e)
}

export async function anularIngreso(id: string, motivo: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_anular', { p_ingreso_id: id, p_motivo: motivo })
  if (e) error(e)
}

export async function comentar(ingresoId: string, texto: string): Promise<void> {
  const { error: e } = await supabase.from('ing_bitacora').insert({ ingreso_id: ingresoId, tipo: 'comentario', texto })
  if (e) error(e)
}

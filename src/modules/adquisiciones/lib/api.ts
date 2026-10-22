import { supabase } from '@/lib/supabaseClient'
import { errorTamanoArchivo, nombreParaStorage } from '@/lib/storageKey'
import type { EstadoSolicitud } from './catalogos'

// Acceso a datos del portal Adquisiciones. Quién ve y hace qué lo decide la base (RLS y funciones
// adq_*): aquí no se filtra nada por rol.

const BUCKET = 'adquisiciones'

export const ARCHIVOS_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx'

export interface DatosSolicitud {
  /** Solo al crearla desde un plan de compra */
  plan_id?: string | null
  sucursal: string
  area: string
  titulo: string
  justificacion: string | null
  proyecto_id: string | null
  centro_costo: string | null
  prioridad: 'normal' | 'urgente'
  fecha_requerida: string | null
  lugar_entrega: string | null
}

export interface Solicitud extends DatosSolicitud {
  /** Obligatorio en la base (CECO de SAP) */
  centro_costo: string
  id: string
  numero: number
  estado: EstadoSolicitud
  cotizacion_id: string | null
  monto_aprobacion: number | null
  nivel_requerido: number
  nivel_aprobado: number
  ronda: number
  enviada_at: string | null
  aprobada_at: string | null
  oc_at: string | null
  motivo_cierre: string | null
  creado_por: string
  cerrado_por: string | null
  fecha_cierre: string | null
  created_at: string
  creado_por_nombre: string | null
  cerrado_por_nombre: string | null
  proyecto_nombre: string | null
  centro_costo_nombre: string | null
  linea: string | null
  items: number
  monto_estimado: number | null
  cotizaciones: number
  proveedor_elegido: string | null
  monto_referencia: number | null
  nivel_pendiente_nombre: string | null
  puedo_aprobar: boolean
  puedo_cotizar: boolean
  oc_docnums: string
  recepcion_pct: number | null
  facturado: number | null
  /** Plan de compra del que nació, si viene de Planificación */
  plan_id: string | null
  plan_numero: number | null
  comprador_id: string | null
  comprador_nombre: string | null
  primera_atencion_at: string | null
  primera_atencion_por_nombre: string | null
  sla_vence_at: string
  sla_estado: 'en_plazo' | 'por_vencer' | 'vencido' | 'cumplido' | 'atrasado'
  sla_horas_transcurridas: number
}

export interface Item {
  id?: string
  articulo_codigo: string | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_estimado: number | null
}

export interface DatosCotizacion {
  proveedor_codigo: string | null
  proveedor_nombre: string
  proveedor_rut: string | null
  monto_neto: number
  plazo_entrega_dias: number | null
  condicion_pago: string | null
  validez: string | null
  observacion: string | null
}

export interface Cotizacion extends DatosCotizacion {
  id: string
  solicitud_id: string
  created_at: string
}

export interface Aprobacion {
  id: string
  ronda: number
  nivel: number
  nivel_nombre: string | null
  decision: 'aprobada' | 'rechazada' | 'devuelta'
  comentario: string | null
  monto: number | null
  usuario_nombre: string | null
  created_at: string
}

export interface OcVinculada {
  docnum: number
  automatica: boolean
  vinculado_por_nombre: string | null
  en_sap: boolean
  doc_entry: number | null
  proveedor_nombre: string | null
  fecha: string | null
  fecha_entrega: string | null
  abierta: boolean | null
  cancelada: boolean | null
  total: number | null
  moneda: string | null
  neto: number | null
  facturado: number | null
  recepcion_pct: number | null
}

export interface LineaOc {
  doc_entry: number
  linea: number
  articulo_codigo: string | null
  descripcion: string | null
  cantidad: number
  pendiente: number
  precio: number
  total: number
  unidad: string | null
}

export interface OcSap {
  doc_entry: number
  docnum: number
  proveedor_codigo: string | null
  proveedor_nombre: string | null
  fecha: string
  fecha_entrega: string | null
  abierta: boolean
  cancelada: boolean
  total: number
  moneda: string | null
  comentarios: string | null
  neto: number
  facturado: number
  recepcion_pct: number | null
  facturado_pct: number | null
  cecos: string | null
  solicitudes: string | null
}

export interface Archivo {
  id: string
  solicitud_id: string
  cotizacion_id: string | null
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

export interface Nivel {
  sucursal: string
  nivel: number
  nombre: string
  monto_desde: number
  activo: boolean
}

export interface ProveedorSap {
  codigo: string
  nombre: string
  rut: string | null
}

export interface ArticuloSap {
  codigo: string
  nombre: string
  unidad: string | null
  ultimo_precio: number | null
}

function error(e: { message: string; code?: string } | null, contexto?: string): never {
  throw new Error(contexto ? `${contexto}: ${e?.message}` : (e?.message ?? 'Error desconocido'))
}

export async function listarSolicitudes(): Promise<Solicitud[]> {
  const { data, error: e } = await supabase.from('adq_solicitudes_v').select('*').order('created_at', { ascending: false })
  if (e) error(e)
  return (data ?? []) as Solicitud[]
}

export async function obtenerSolicitud(id: string): Promise<Solicitud | null> {
  const { data, error: e } = await supabase.from('adq_solicitudes_v').select('*').eq('id', id).maybeSingle()
  if (e) error(e)
  return data as Solicitud | null
}

export async function listarItems(solicitudId: string): Promise<Item[]> {
  const { data, error: e } = await supabase
    .from('adq_items')
    .select('id, articulo_codigo, descripcion, cantidad, unidad, precio_estimado')
    .eq('solicitud_id', solicitudId)
    .order('orden')
  if (e) error(e)
  return (data ?? []) as Item[]
}

export async function listarCotizaciones(solicitudId: string): Promise<Cotizacion[]> {
  const { data, error: e } = await supabase.from('adq_cotizaciones').select('*').eq('solicitud_id', solicitudId).order('monto_neto')
  if (e) error(e)
  return (data ?? []) as Cotizacion[]
}

export async function listarAprobaciones(solicitudId: string): Promise<Aprobacion[]> {
  const { data, error: e } = await supabase.from('adq_aprobaciones_v').select('*').eq('solicitud_id', solicitudId).order('created_at')
  if (e) error(e)
  return (data ?? []) as Aprobacion[]
}

export async function listarOcVinculadas(solicitudId: string): Promise<OcVinculada[]> {
  const { data, error: e } = await supabase.from('adq_oc_v').select('*').eq('solicitud_id', solicitudId).order('docnum')
  if (e) error(e)
  return (data ?? []) as OcVinculada[]
}

export async function listarLineasOc(docEntries: number[]): Promise<LineaOc[]> {
  if (docEntries.length === 0) return []
  const { data, error: e } = await supabase.from('sap_oc_lineas').select('*').in('doc_entry', docEntries).order('linea')
  if (e) error(e)
  return (data ?? []) as LineaOc[]
}

export async function listarArchivos(solicitudId: string): Promise<Archivo[]> {
  const { data, error: e } = await supabase.from('adq_archivos').select('*').eq('solicitud_id', solicitudId).order('created_at')
  if (e) error(e)
  return (data ?? []) as Archivo[]
}

export async function listarBitacora(solicitudId: string): Promise<EventoBitacora[]> {
  const { data, error: e } = await supabase
    .from('adq_bitacora_v')
    .select('id, tipo, texto, created_at, usuario_nombre')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: false })
  if (e) error(e)
  return (data ?? []) as EventoBitacora[]
}

/** Obras a las que se puede cargar la compra (las que la persona puede leer). */
export async function listarProyectos(): Promise<{ id: string; nombre: string }[]> {
  const { data, error: e } = await supabase.from('proyectos').select('id, nombre').not('tipo', 'in', '(crm,sistema)').order('nombre')
  if (e) error(e)
  return data ?? []
}

const limpiarTexto = (v: string | null) => (v?.trim() ? v.trim() : null)

function itemsParaGuardar(solicitudId: string, items: Item[]) {
  return items.map((it, i) => ({
    solicitud_id: solicitudId,
    orden: i,
    articulo_codigo: limpiarTexto(it.articulo_codigo),
    descripcion: it.descripcion.trim(),
    cantidad: it.cantidad,
    unidad: it.unidad.trim() || 'UN',
    precio_estimado: it.precio_estimado,
  }))
}

/** Crea la solicitud con sus ítems. Devuelve el id. */
export async function crearSolicitud(datos: DatosSolicitud, items: Item[]): Promise<string> {
  const { data, error: e } = await supabase.from('adq_solicitudes').insert(datos).select('id').single()
  if (e) error(e)
  const id = (data as { id: string }).id
  const { error: eItems } = await supabase.from('adq_items').insert(itemsParaGuardar(id, items))
  if (eItems) error(eItems, 'La solicitud quedó creada, pero no se pudieron guardar los ítems (edítala para agregarlos)')
  return id
}

export async function actualizarSolicitud(id: string, datos: DatosSolicitud): Promise<void> {
  const { error: e } = await supabase.from('adq_solicitudes').update(datos).eq('id', id)
  if (e) error(e)
}

/** Reemplaza los ítems: borra los que ya no están, actualiza y agrega. */
export async function guardarItems(solicitudId: string, items: Item[]): Promise<void> {
  const conservar = items.filter((it) => it.id).map((it) => it.id as string)
  let borrar = supabase.from('adq_items').delete().eq('solicitud_id', solicitudId)
  if (conservar.length) borrar = borrar.not('id', 'in', `(${conservar.join(',')})`)
  const { error: eDel } = await borrar
  if (eDel) error(eDel)
  const filas = itemsParaGuardar(solicitudId, items).map((f, i) => (items[i].id ? { ...f, id: items[i].id } : f))
  const existentes = filas.filter((f) => 'id' in f)
  const nuevas = filas.filter((f) => !('id' in f))
  if (existentes.length) {
    const { error: eUp } = await supabase.from('adq_items').upsert(existentes)
    if (eUp) error(eUp)
  }
  if (nuevas.length) {
    const { error: eIns } = await supabase.from('adq_items').insert(nuevas)
    if (eIns) error(eIns)
  }
}

function cotizacionParaGuardar(d: DatosCotizacion) {
  return {
    ...d,
    proveedor_nombre: d.proveedor_nombre.trim(),
    proveedor_codigo: limpiarTexto(d.proveedor_codigo),
    proveedor_rut: limpiarTexto(d.proveedor_rut),
    condicion_pago: limpiarTexto(d.condicion_pago),
    observacion: limpiarTexto(d.observacion),
    validez: d.validez || null,
  }
}

/** Devuelve el id, para adjuntar el PDF de la cotización. */
export async function crearCotizacion(solicitudId: string, d: DatosCotizacion): Promise<string> {
  const { data, error: e } = await supabase
    .from('adq_cotizaciones')
    .insert({ solicitud_id: solicitudId, ...cotizacionParaGuardar(d) })
    .select('id')
    .single()
  if (e) error(e)
  return (data as { id: string }).id
}

export async function actualizarCotizacion(id: string, d: DatosCotizacion): Promise<void> {
  const { error: e } = await supabase.from('adq_cotizaciones').update(cotizacionParaGuardar(d)).eq('id', id)
  if (e) error(e)
}

export async function eliminarCotizacion(c: Cotizacion, archivos: Archivo[]): Promise<void> {
  const { error: e } = await supabase.from('adq_cotizaciones').delete().eq('id', c.id)
  if (e) error(e)
  const paths = archivos.filter((a) => a.cotizacion_id === c.id).map((a) => a.path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

async function subir(path: string, file: File, fila: Record<string, unknown>): Promise<void> {
  const tamano = errorTamanoArchivo(file)
  if (tamano) throw new Error(tamano)
  if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 25 MB, el máximo de este portal.`)
  const { error: eSubir } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (eSubir) error(eSubir, `No se pudo subir "${file.name}"`)
  const { error: eFila } = await supabase.from('adq_archivos').insert({ ...fila, path, nombre: file.name })
  if (eFila) {
    await supabase.storage.from(BUCKET).remove([path])
    error(eFila)
  }
}

export function subirAdjunto(solicitudId: string, file: File): Promise<void> {
  const path = `${solicitudId}/docs/${Date.now()}-${nombreParaStorage(file.name)}`
  return subir(path, file, { solicitud_id: solicitudId })
}

export function subirArchivoCotizacion(solicitudId: string, cotizacionId: string, file: File): Promise<void> {
  const path = `${solicitudId}/cot/${cotizacionId}/${Date.now()}-${nombreParaStorage(file.name)}`
  return subir(path, file, { solicitud_id: solicitudId, cotizacion_id: cotizacionId })
}

/** Primero la fila (su política decide si se puede), después el archivo. */
export async function eliminarArchivo(a: Archivo): Promise<void> {
  const { data, error: e } = await supabase.from('adq_archivos').delete().eq('id', a.id).select('id')
  if (e) error(e)
  if (!data?.length) throw new Error('No puedes eliminar este archivo')
  await supabase.storage.from(BUCKET).remove([a.path])
}

export async function abrirArchivo(a: Archivo): Promise<void> {
  const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 600)
  if (e || !data?.signedUrl) error(e ?? { message: 'Sin enlace' }, 'No se pudo abrir el archivo')
  window.open(data.signedUrl, '_blank')
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error: e } = await supabase.rpc(fn, args)
  if (e) error(e)
}

export const marcarRevisada = (id: string) => rpc('adq_marcar_revisada', { p_solicitud_id: id })
export const asignarComprador = (id: string, comprador: string | null) =>
  rpc('adq_asignar_comprador', { p_solicitud_id: id, p_comprador: comprador })

export async function listarCompradores(sucursal: string): Promise<{ id: string; nombre: string | null }[]> {
  const { data, error: e } = await supabase.rpc('adq_compradores', { p_sucursal: sucursal })
  if (e) error(e)
  return (data ?? []) as { id: string; nombre: string | null }[]
}

export const enviarAprobacion = (id: string, cotizacionId: string) =>
  rpc('adq_enviar_aprobacion', { p_solicitud_id: id, p_cotizacion_id: cotizacionId })
export const aprobar = (id: string, comentario: string) => rpc('adq_aprobar', { p_solicitud_id: id, p_comentario: comentario || null })
export const rechazar = (id: string, motivo: string, devolver: boolean) =>
  rpc('adq_rechazar', { p_solicitud_id: id, p_motivo: motivo, p_devolver: devolver })
export const vincularOc = (id: string, docnum: number) => rpc('adq_vincular_oc', { p_solicitud_id: id, p_docnum: docnum })
export const desvincularOc = (id: string, docnum: number) => rpc('adq_desvincular_oc', { p_solicitud_id: id, p_docnum: docnum })
export const marcarRecibida = (id: string, comentario: string) =>
  rpc('adq_marcar_recibida', { p_solicitud_id: id, p_comentario: comentario || null })
export const anular = (id: string, motivo: string) => rpc('adq_anular', { p_solicitud_id: id, p_motivo: motivo })

export async function comentar(solicitudId: string, texto: string): Promise<void> {
  const { error: e } = await supabase.from('adq_bitacora').insert({ solicitud_id: solicitudId, tipo: 'comentario', texto })
  if (e) error(e)
}

export async function listarNiveles(): Promise<Nivel[]> {
  const { data, error: e } = await supabase.from('adq_niveles').select('*').order('sucursal').order('nivel')
  if (e) error(e)
  return (data ?? []) as Nivel[]
}

/** Todos juntos: la base valida que cada nivel parta en un monto mayor que el anterior. */
export const guardarNiveles = (niveles: Nivel[]) => rpc('adq_guardar_niveles', { p: niveles })

/** Nivel que exige un monto en una sucursal, con la misma regla que adq_nivel_para(). */
export function nivelPara(niveles: Nivel[], sucursal: string, monto: number | null): number {
  return Math.max(1, ...niveles.filter((n) => n.sucursal === sucursal && n.activo && n.monto_desde <= (monto ?? 0)).map((n) => n.nivel))
}

// ---------------------------------------------------------------- SAP (solo lectura)

/** Busca en los proveedores de SAP por nombre, RUT o código. */
export async function buscarProveedores(q: string): Promise<ProveedorSap[]> {
  const t = q.trim().replace(/[%,()]/g, ' ')
  if (t.length < 2) return []
  const { data, error: e } = await supabase
    .from('sap_proveedores')
    .select('codigo, nombre, rut')
    .eq('activo', true)
    .or(`nombre.ilike.%${t}%,rut.ilike.%${t}%,codigo.ilike.%${t}%`)
    .order('nombre')
    .limit(15)
  if (e) error(e)
  return (data ?? []) as ProveedorSap[]
}

export async function buscarArticulos(q: string): Promise<ArticuloSap[]> {
  const t = q.trim().replace(/[%,()]/g, ' ')
  if (t.length < 2) return []
  const { data, error: e } = await supabase
    .from('sap_articulos')
    .select('codigo, nombre, unidad, ultimo_precio')
    .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`)
    .order('nombre')
    .limit(15)
  if (e) error(e)
  return (data ?? []) as ArticuloSap[]
}

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null; count?: number | null }>

/** Todas las filas, de a 1000: la primera página trae el total y el resto se pide en paralelo (de a 6). */
async function traerTodo<T>(pagina: (desde: number, hasta: number, contar: boolean) => Pagina<T>): Promise<T[]> {
  const primera = await pagina(0, 999, true)
  if (primera.error) error(primera.error)
  const filas = [...(primera.data ?? [])]
  const total = primera.count ?? filas.length
  const inicios: number[] = []
  for (let i = 1000; i < total; i += 1000) inicios.push(i)
  for (let k = 0; k < inicios.length; k += 6) {
    const resp = await Promise.all(inicios.slice(k, k + 6).map((i) => pagina(i, i + 999, false)))
    for (const r of resp) {
      if (r.error) error(r.error)
      filas.push(...(r.data ?? []))
    }
  }
  return filas
}

/** Filtro PostgREST: fecha entre desde y hasta, o la OC sigue abierta (las abiertas salen siempre). null = sin filtro. */
function fechaOAbierta(desde: string | null, hasta: string | null, abierta: string): string | null {
  const rango = [desde && `fecha.gte.${desde}`, hasta && `fecha.lte.${hasta}`].filter(Boolean)
  return rango.length ? `and(${rango.join(',')}),${abierta}.is.true` : null
}

/** OC de SAP con fecha entre desde y hasta (null = sin límite), más todas las abiertas. */
export async function listarOcSap(desde: string | null, hasta: string | null = null): Promise<OcSap[]> {
  return traerTodo<OcSap>((i, j, contar) => {
    let q = supabase
      .from('adq_sap_oc_v')
      .select(
        'doc_entry, docnum, proveedor_codigo, proveedor_nombre, fecha, fecha_entrega, abierta, cancelada, total, moneda, comentarios, neto, facturado, recepcion_pct, facturado_pct, cecos, solicitudes',
        contar ? { count: 'exact' } : undefined,
      )
      .order('docnum', { ascending: false })
      .range(i, j)
    const filtro = fechaOAbierta(desde, hasta, 'abierta')
    if (filtro) q = q.or(filtro)
    return q as unknown as Pagina<OcSap>
  })
}

/** Cuándo se trajo SAP por última vez; null si la base no tiene la sincronización. */
export async function estadoSincronizacion(): Promise<string | null> {
  const { data } = await supabase.from('sap_compras_estado').select('sincronizado_en').maybeSingle()
  return (data as { sincronizado_en: string } | null)?.sincronizado_en ?? null
}

export const fmtPesos = (n: number | null | undefined) =>
  n == null ? '—' : '$' + new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)

// ---------------------------------------------------------------- centros de costo y control de gasto

export interface CentroCosto {
  codigo: string
  nombre: string
  sucursal: string | null
  linea: string | null
}

let centros: Promise<CentroCosto[]> | null = null

/** Centros de costo activos de SAP (dimensión 1). Se cachean: cambian muy de vez en cuando. */
export function listarCentrosCosto(): Promise<CentroCosto[]> {
  if (!centros) {
    centros = (async () => {
      const { data, error: e } = await supabase.from('sap_centros_costo').select('codigo, nombre, sucursal, linea').eq('activo', true).order('codigo')
      if (e) {
        centros = null
        error(e)
      }
      return (data ?? []) as CentroCosto[]
    })()
  }
  return centros
}

/** "1102 · LN SIP PTO VARAS" */
export const etiquetaCeco = (codigo: string, nombre?: string | null) => (nombre ? `${codigo} · ${nombre}` : codigo)

export interface PresupuestoSolicitud {
  centro_costo: string
  anio: number
  presupuesto: number | null
  ejecutado: number
  comprometido: number
  /** La solicitud ya suma en el comprometido (en aprobación o aprobada) */
  esta_incluida: boolean
}

/** Solo para Compras y aprobadores; para el resto, null. */
export async function presupuestoSolicitud(solicitudId: string): Promise<PresupuestoSolicitud | null> {
  const { data, error: e } = await supabase.rpc('adq_presupuesto_solicitud', { p_solicitud_id: solicitudId })
  if (e) error(e)
  return ((data ?? []) as PresupuestoSolicitud[])[0] ?? null
}

export interface FacturaOc {
  oc_doc_entry: number
  doc_entry: number
  docnum: number
  folio: string | null
  fecha: string
  vencimiento: string | null
  total: number
  pagado: number
  abierta: boolean
  cancelada: boolean
  neto_oc: number
}

export async function listarFacturasOc(docEntries: number[]): Promise<FacturaOc[]> {
  if (docEntries.length === 0) return []
  const { data, error: e } = await supabase.from('sap_oc_facturas').select('*').in('oc_doc_entry', docEntries).order('fecha')
  if (e) error(e)
  return (data ?? []) as FacturaOc[]
}

export interface FilaGasto {
  anio: number
  mes: number
  centro_costo: string
  centro_costo_nombre: string | null
  sucursal: string | null
  linea: string | null
  proveedor_nombre: string | null
  neto: number
  oc: number
}

/** Gasto real en SAP (líneas de OC no canceladas) del año, por mes, CECO y proveedor. */
export async function listarGasto(anio: number): Promise<FilaGasto[]> {
  const filas: FilaGasto[] = []
  // PostgREST corta en 1000 filas: se pide por páginas
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('adq_gasto_v').select('*').eq('anio', anio).range(desde, desde + 999)
    if (e) error(e)
    filas.push(...((data ?? []) as FilaGasto[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

export interface FilaPresupuesto {
  centro_costo: string
  anio: number
  centro_costo_nombre: string | null
  sucursal: string | null
  linea: string | null
  presupuesto: number | null
  ejecutado: number
  comprometido: number
  solicitudes: number
}

export async function listarPresupuestos(anio: number): Promise<FilaPresupuesto[]> {
  const { data, error: e } = await supabase.from('adq_presupuesto_v').select('*').eq('anio', anio).order('centro_costo')
  if (e) error(e)
  return (data ?? []) as FilaPresupuesto[]
}

export const guardarPresupuestos = (filas: { centro_costo: string; anio: number; monto: number | null }[]) =>
  rpc('adq_guardar_presupuestos', { p: filas })

export interface FilaReposicion {
  articulo_codigo: string
  bodega_codigo: 'B006' | 'B007'
  sucursal: string
  articulo_nombre: string
  unidad: string | null
  ultimo_precio: number | null
  en_stock: number
  comprometido: number
  pedido: number
  en_solicitud: number
  consumo_mensual: number
  consumo_max_mes: number
  minimo: number | null
  reorden: number | null
  disponible: number
  bajo_minimo: boolean
  sugerido: number | null
  cobertura_dias: number | null
}

export async function listarReposicion(): Promise<FilaReposicion[]> {
  const filas: FilaReposicion[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('adq_reposicion_v').select('*').order('articulo_nombre').range(desde, desde + 999)
    if (e) error(e)
    filas.push(...((data ?? []) as FilaReposicion[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

/** minimo null quita el mínimo del artículo en esa bodega. */
export const guardarReposicion = (filas: { articulo_codigo: string; bodega_codigo: string; minimo: number | null; reorden: number | null }[]) =>
  rpc('adq_guardar_reposicion', { p: filas })

export const BODEGAS: Record<string, string> = { B006: 'Bodega Santiago', B007: 'Bodega Puerto Varas' }

// ---------------------------------------------------------------- Bodega

export type EstadoConteo = 'sin_conteo' | 'vigente' | 'atencion' | 'desactualizado'

export interface FilaBodega {
  articulo_codigo: string
  bodega_codigo: 'B006' | 'B007'
  sucursal: string
  articulo_nombre: string
  unidad: string | null
  grupo: string | null
  stock_sap: number
  comprometido_sap: number
  pedido_sap: number
  /** Saldo por recibir de líneas de OC abiertas de esta bodega */
  pendiente_oc: number
  oc_abiertas: number
  proxima_entrega: string | null
  oc_atrasada: boolean
  consumo_mensual: number
  ultima_recepcion: string | null
  stock_fisico: number | null
  inutilizable: number
  comprometido_bodega: number | null
  observacion: string | null
  contado_at: string | null
  updated_at: string | null
  actualizado_por_nombre: string | null
  antiguedad_dias: number | null
  estado_conteo: EstadoConteo
  stock_usado: number
  utilizable: number
  disponible_real: number
  diferencia_sap: number | null
}

export async function listarBodega(): Promise<FilaBodega[]> {
  const filas: FilaBodega[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase
      .from('adq_bodega_v')
      .select('*')
      .order('articulo_nombre')
      .order('bodega_codigo')
      .range(desde, desde + 999)
    if (e) error(e)
    filas.push(...((data ?? []) as FilaBodega[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

export interface ConteoBodega {
  articulo_codigo: string
  bodega_codigo: string
  stock_fisico: number | null
  inutilizable: number | null
  comprometido: number | null
  observacion: string | null
}

/** Cada fila es un registro: si trae stock físico cuenta como conteo de hoy. Todo vacío quita el registro. */
export async function guardarConteo(filas: ConteoBodega[], motivo: string): Promise<void> {
  await rpc('adq_guardar_conteo', { p: filas, p_motivo: motivo.trim() || null })
}

export interface MovimientoBodega {
  id: number
  articulo_codigo: string
  articulo_nombre: string
  bodega_codigo: string
  accion: 'conteo' | 'reversa'
  stock_fisico_antes: number | null
  inutilizable_antes: number | null
  comprometido_antes: number | null
  stock_fisico: number | null
  inutilizable: number | null
  comprometido: number | null
  stock_sap: number | null
  observacion: string | null
  motivo: string | null
  revierte_id: number | null
  revertido: boolean
  usuario_nombre: string | null
  created_at: string
}

export async function listarHistorialBodega(bodega: string, articulo?: string): Promise<MovimientoBodega[]> {
  let q = supabase.from('adq_bodega_historial_v').select('*').eq('bodega_codigo', bodega).order('id', { ascending: false }).limit(300)
  if (articulo) q = q.eq('articulo_codigo', articulo)
  const { data, error: e } = await q
  if (e) error(e)
  return (data ?? []) as MovimientoBodega[]
}

export const revertirConteo = (id: number, motivo: string) => rpc('adq_revertir_conteo', { p_id: id, p_motivo: motivo.trim() })

// ---------------------------------------------------------------- Planificación y planes de compra

export interface ObraPlanificable {
  proyecto_codigo: string
  proyecto_nombre: string | null
  ordenes: number
  desde: string | null
  lineas_pendientes: number
  kits_pendientes: number
}

export async function listarObras(bodega: string, desde: string | null): Promise<ObraPlanificable[]> {
  const { data, error: e } = await supabase.rpc('adq_obras_planificables', { p_bodega: bodega, p_desde: desde || null })
  if (e) error(e)
  return (data ?? []) as ObraPlanificable[]
}

export type EstadoPlan = 'critico' | 'comprar' | 'en_solicitud' | 'cubierto'

export interface FilaPlan {
  articulo_codigo: string
  articulo_nombre: string
  unidad: string | null
  grupo: string | null
  familia: string | null
  requerimiento: number
  /** Parte del requerimiento que sale del programa de viviendas */
  req_programa: number
  stock_sap: number
  comprometido_sap: number
  stock_fisico: number | null
  inutilizable: number
  comprometido_bodega: number | null
  fuente_stock: 'SAP' | 'Físico'
  estado_conteo: EstadoConteo
  disponible_real: number
  oc_pendiente: number
  oc_atrasada: number
  oc_en_plazo: number
  oc_posterior: number
  oc_sin_fecha: number
  en_solicitud: number
  minimo: number
  compra_sugerida: number
  saldo_despues: number
  consumo_mensual: number
  cobertura_meses: number | null
  estado: EstadoPlan
  alerta_oc: string | null
  ultimo_precio: number | null
  ultimo_proveedor: string | null
}

export interface Simulacion {
  proyecto_codigo: string
  proyecto_nombre: string | null
  cantidad: number
}

export interface ProgramaVivienda {
  tipo_id: number
  nombre: string
  cantidad: number
}

/** programa: viviendas a fabricar por tipo, explotadas por las recetas de SAP. incluirOt: sumar lo pendiente
 *  de las órdenes de fabricación abiertas (de las obras elegidas, o todas; creadas desde «desde»). */
export async function planificar(
  bodega: string,
  programa: ProgramaVivienda[],
  incluirOt: boolean,
  obras: string[] | null,
  fecha: string | null,
  desde: string | null,
): Promise<FilaPlan[]> {
  const { data, error: e } = await supabase.rpc('adq_planificar', {
    p_bodega: bodega,
    p_programa: programa.filter((x) => x.cantidad > 0).map((x) => ({ tipo_id: x.tipo_id, cantidad: x.cantidad })),
    p_incluir_ot: incluirOt,
    p_obras: obras,
    p_fecha: fecha || null,
    p_desde: desde || null,
  })
  if (e) error(e)
  return (data ?? []) as FilaPlan[]
}

export interface PlanCompra {
  id: string
  numero: number
  bodega_codigo: 'B006' | 'B007'
  sucursal: string
  anio: number
  mes: number
  version: number
  estado: 'abierto' | 'cerrado'
  fecha_necesidad: string | null
  ot_desde: string | null
  obras: string[] | null
  /** Planes anteriores al programa de viviendas */
  simulacion: Simulacion[]
  programa: ProgramaVivienda[]
  incluir_ot: boolean
  nota: string | null
  creado_por_nombre: string | null
  created_at: string
  cerrado_por_nombre: string | null
  cerrado_at: string | null
  periodo: string
  lineas: number
  valor_planificado: number
  avance_pct: number
  lineas_con_oc: number
  oc: number
  solicitudes: string
  solicitudes_abiertas: number
}

export interface LineaPlan {
  plan_id: string
  articulo_codigo: string
  articulo_nombre: string | null
  unidad: string | null
  requerimiento: number
  disponible_real: number
  oc_pendiente: number
  en_solicitud: number
  minimo: number
  sugerido: number
  planificado: number
  precio_ref: number | null
  proveedor_ref: string | null
  alerta_oc: string | null
  en_solicitud_plan: number
  comprado: number
  recibido: number
  por_recibir: number
  sin_oc: number
  oc_atrasada: boolean
  docnums: string | null
  estado_linea: 'recibido' | 'comprado' | 'parcial' | 'en_solicitud' | 'pendiente'
}

export async function listarPlanes(): Promise<PlanCompra[]> {
  const { data, error: e } = await supabase.from('adq_planes_v').select('*').order('created_at', { ascending: false })
  if (e) error(e)
  return (data ?? []) as PlanCompra[]
}

export async function obtenerPlan(id: string): Promise<PlanCompra | null> {
  const { data, error: e } = await supabase.from('adq_planes_v').select('*').eq('id', id).maybeSingle()
  if (e) error(e)
  return data as PlanCompra | null
}

export async function listarLineasPlan(id: string): Promise<LineaPlan[]> {
  const { data, error: e } = await supabase.from('adq_plan_seguimiento_v').select('*').eq('plan_id', id).order('articulo_nombre')
  if (e) error(e)
  return (data ?? []) as LineaPlan[]
}

export interface DatosPlan {
  bodega_codigo: string
  anio: number
  mes: number
  fecha_necesidad: string | null
  ot_desde: string | null
  obras: string[] | null
  programa: ProgramaVivienda[]
  incluir_ot: boolean
  nota: string | null
  lineas: {
    articulo_codigo: string
    articulo_nombre: string
    unidad: string | null
    requerimiento: number
    disponible_real: number
    oc_pendiente: number
    en_solicitud: number
    minimo: number
    sugerido: number
    planificado: number
    precio_ref: number | null
    proveedor_ref: string | null
    alerta_oc: string | null
  }[]
}

export async function guardarPlan(p: DatosPlan): Promise<string> {
  const { data, error: e } = await supabase.rpc('adq_guardar_plan', { p })
  if (e) error(e)
  return data as string
}

export const cambiarEstadoPlan = (id: string, estado: 'abierto' | 'cerrado') => rpc('adq_plan_estado', { p_plan_id: id, p_estado: estado })
export const vincularOcPlan = (id: string, docnums: number[]) => rpc('adq_plan_vincular_oc', { p_plan_id: id, p_docnums: docnums })
export const desvincularOcPlan = (id: string, docnum: number) => rpc('adq_plan_desvincular_oc', { p_plan_id: id, p_docnum: docnum })

export interface OcCandidata {
  docnum: number
  proveedor_nombre: string | null
  fecha: string
  fecha_entrega: string | null
  abierta: boolean
  articulos: number
  cantidad: number
}

export async function listarOcCandidatas(id: string): Promise<OcCandidata[]> {
  const { data, error: e } = await supabase.rpc('adq_plan_oc_candidatas', { p_plan_id: id })
  if (e) error(e)
  return (data ?? []) as OcCandidata[]
}

export async function listarOcPlan(id: string): Promise<{ docnum: number; created_at: string }[]> {
  const { data, error: e } = await supabase.from('adq_plan_oc').select('docnum, created_at').eq('plan_id', id).order('docnum')
  if (e) error(e)
  return (data ?? []) as { docnum: number; created_at: string }[]
}

export async function listarSolicitudesPlan(id: string): Promise<Solicitud[]> {
  const { data, error: e } = await supabase.from('adq_solicitudes_v').select('*').eq('plan_id', id).order('numero')
  if (e) error(e)
  return (data ?? []) as Solicitud[]
}

// ---------------------------------------------------------------- Proveedores, evaluaciones y NC

export interface ProveedorFicha {
  codigo: string
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  activo: boolean
  oc_12m: number
  comprado_12m: number
  oc_abiertas: number
  ultima_oc: string | null
  pendiente_neto: number
  lineas_pendientes: number
  lineas_atrasadas: number
  recepcion_pct: number | null
  ultima_puntaje: number | null
  ultima_clase: 'A' | 'B' | 'C' | 'D' | null
  ultima_evaluacion: string | null
  proxima_revision: string | null
  revision_vencida: boolean
  nc_abiertas: number
  nc_12m: number
}

export async function listarProveedores(): Promise<ProveedorFicha[]> {
  const filas: ProveedorFicha[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase
      .from('adq_proveedores_v')
      .select('*')
      .order('comprado_12m', { ascending: false })
      .order('codigo')
      .range(desde, desde + 999)
    if (e) error(e)
    filas.push(...((data ?? []) as ProveedorFicha[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

export async function obtenerProveedor(codigo: string): Promise<ProveedorFicha | null> {
  const { data, error: e } = await supabase.from('adq_proveedores_v').select('*').eq('codigo', codigo).maybeSingle()
  if (e) error(e)
  return data as ProveedorFicha | null
}

export async function listarOcProveedor(codigo: string): Promise<OcSap[]> {
  const { data, error: e } = await supabase
    .from('adq_sap_oc_v')
    .select('*')
    .eq('proveedor_codigo', codigo)
    .order('fecha', { ascending: false })
    .limit(200)
  if (e) error(e)
  return (data ?? []) as OcSap[]
}

export const CRITERIOS = [
  { campo: 'calidad', label: 'Calidad', peso: 20, mejora: 'Reforzar el control de calidad para reducir no conformidades, rechazos y reincidencias.' },
  { campo: 'entrega', label: 'Entrega / OTIF', peso: 20, mejora: 'Mejorar el cumplimiento de fechas y cantidades comprometidas, informando desvíos con anticipación.' },
  { campo: 'precio', label: 'Precio / Costo', peso: 15, mejora: 'Revisar competitividad de precios y oportunidades de optimización de costos.' },
  { campo: 'capacidad', label: 'Capacidad de suministro', peso: 10, mejora: 'Fortalecer capacidad y disponibilidad para asegurar continuidad ante aumentos de demanda.' },
  { campo: 'pago', label: 'Condiciones de pago', peso: 10, mejora: 'Revisar condiciones comerciales y alternativas de pago que mejoren la relación de largo plazo.' },
  { campo: 'servicio', label: 'Respuesta / Servicio', peso: 10, mejora: 'Reducir tiempos de respuesta y mejorar seguimiento, comunicación y resolución de incidencias.' },
  { campo: 'riesgo', label: 'Riesgo / continuidad', peso: 5, mejora: 'Fortalecer medidas de continuidad de suministro y planes de contingencia.' },
  { campo: 'certificaciones', label: 'Certificaciones / Cumplimiento', peso: 5, mejora: 'Mantener actualizados respaldos, certificaciones y requisitos técnicos o documentales aplicables.' },
  { campo: 'relacion', label: 'Relación estratégica', peso: 5, mejora: 'Fortalecer coordinación, planificación conjunta y compromiso con las necesidades de Tecnopanel.' },
] as const

export type CampoCriterio = (typeof CRITERIOS)[number]['campo']
export type Clase = 'A' | 'B' | 'C' | 'D'

/** Igual que adq_eval_puntaje: suma(nota / 5 × peso), sobre 100. */
export const puntajeEvaluacion = (notas: Partial<Record<CampoCriterio, number>>) =>
  Math.round(CRITERIOS.reduce((t, c) => t + ((notas[c.campo] ?? 0) / 5) * c.peso, 0) * 10) / 10
export const claseEvaluacion = (p: number): Clase => (p >= 90 ? 'A' : p >= 75 ? 'B' : p >= 60 ? 'C' : 'D')
export const CLASE: Record<Clase, { label: string; variant: 'success' | 'default' | 'warning' | 'destructive' }> = {
  A: { label: 'A · Preferente', variant: 'success' },
  B: { label: 'B · Aprobado', variant: 'default' },
  C: { label: 'C · Aprobado con observaciones', variant: 'warning' },
  D: { label: 'D · Crítico', variant: 'destructive' },
}

export type Evaluacion = Record<CampoCriterio, number> & {
  id: number
  proveedor_codigo: string | null
  proveedor_nombre: string
  periodo_desde: string
  periodo_hasta: string
  puntaje: number
  clase: Clase
  observaciones: string | null
  plan_accion: string | null
  proxima_revision: string | null
  anulada: boolean
  anulada_at: string | null
  motivo_anulacion: string | null
  anulada_por_nombre: string | null
  creado_por_nombre: string | null
  created_at: string
}

export async function listarEvaluaciones(codigo?: string): Promise<Evaluacion[]> {
  let q = supabase.from('adq_evaluaciones_v').select('*').order('created_at', { ascending: false })
  if (codigo) q = q.eq('proveedor_codigo', codigo)
  const { data, error: e } = await q
  if (e) error(e)
  return (data ?? []) as Evaluacion[]
}

export type DatosEvaluacion = Record<CampoCriterio, number> & {
  proveedor_codigo: string | null
  proveedor_nombre: string
  periodo_desde: string
  periodo_hasta: string
  observaciones: string | null
  plan_accion: string | null
  proxima_revision: string | null
}

export async function guardarEvaluacion(p: DatosEvaluacion): Promise<number> {
  const { data, error: e } = await supabase.rpc('adq_guardar_evaluacion', { p })
  if (e) error(e)
  return data as number
}

export const anularEvaluacion = (id: number, motivo: string) => rpc('adq_anular_evaluacion', { p_id: id, p_motivo: motivo })

export const TIPOS_NC = { calidad: 'Calidad', entrega: 'Entrega', embalaje: 'Embalaje', documentacion: 'Documentación', cantidad: 'Cantidad', otro: 'Otro' } as const
export const IMPACTOS_NC = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', critico: 'Crítico' } as const
export const ESTADOS_NC = { abierta: 'Abierta', en_analisis: 'En análisis', accion_proveedor: 'Acción del proveedor', cerrada: 'Cerrada' } as const

export interface DatosNc {
  id?: number
  sucursal: string
  proveedor_codigo: string | null
  proveedor_nombre: string
  articulo_codigo: string | null
  articulo_nombre: string | null
  oc_docnum: number | null
  fecha_evento: string
  tipo: keyof typeof TIPOS_NC
  impacto: keyof typeof IMPACTOS_NC
  estado: Exclude<keyof typeof ESTADOS_NC, 'cerrada'>
  fecha_compromiso: string | null
  reincidencia: boolean
  problema: string
  accion_acordada: string | null
  responsable_interno: string | null
  responsable_proveedor: string | null
  costo: number | null
}

export interface Nc extends Omit<DatosNc, 'estado' | 'id'> {
  id: number
  estado: keyof typeof ESTADOS_NC
  cierre: string | null
  cerrado_at: string | null
  cerrado_por_nombre: string | null
  creado_por_nombre: string | null
  created_at: string
  vencida: boolean
}

export async function listarNc(codigo?: string): Promise<Nc[]> {
  let q = supabase.from('adq_nc_v').select('*').order('fecha_evento', { ascending: false }).order('id', { ascending: false })
  if (codigo) q = q.eq('proveedor_codigo', codigo)
  const { data, error: e } = await q
  if (e) error(e)
  return (data ?? []) as Nc[]
}

export async function guardarNc(p: DatosNc): Promise<number> {
  const { data, error: e } = await supabase.rpc('adq_guardar_nc', { p })
  if (e) error(e)
  return data as number
}

export const cerrarNc = (id: number, cierre: string) => rpc('adq_cerrar_nc', { p_id: id, p_cierre: cierre })


// ---------------------------------------------------------------- Tipos de vivienda

export interface KitTipo {
  kit_codigo: string
  cantidad: number
  kit_nombre: string | null
  /** Componentes de su receta en SAP; 0 = el kit no tiene receta */
  componentes: number
}

export interface TipoVivienda {
  id: number
  nombre: string
  descripcion: string | null
  activo: boolean
  orden: number
  updated_at: string
  actualizado_por_nombre: string | null
  kits: KitTipo[]
}

export async function listarTiposVivienda(): Promise<TipoVivienda[]> {
  const { data, error: e } = await supabase.from('adq_tipos_vivienda_v').select('*').order('orden').order('nombre')
  if (e) error(e)
  return (data ?? []) as TipoVivienda[]
}

export async function guardarTipoVivienda(p: {
  id?: number
  nombre: string
  descripcion: string | null
  activo: boolean
  kits: { kit_codigo: string; cantidad: number }[]
}): Promise<number> {
  const { data, error: e } = await supabase.rpc('adq_guardar_tipo_vivienda', { p })
  if (e) error(e)
  return data as number
}

/** Kits y otros artículos con receta de producción en SAP, para armar los tipos de vivienda. */
export async function listarArticulosConReceta(): Promise<{ codigo: string; nombre: string | null }[]> {
  const m = new Map<string, string | null>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase.from('sap_recetas').select('padre_codigo, padre_nombre').order('padre_codigo').range(desde, desde + 999)
    if (e) error(e)
    for (const r of (data ?? []) as { padre_codigo: string; padre_nombre: string | null }[]) m.set(r.padre_codigo, r.padre_nombre)
    if (!data || data.length < 1000) break
  }
  return [...m.entries()].map(([codigo, nombre]) => ({ codigo, nombre })).sort((a, b) => (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo))
}

// ---------------------------------------------------------------- OC de SAP por línea

export interface LineaOcSap {
  doc_entry: number
  linea: number
  docnum: number
  fecha: string
  fecha_entrega: string | null
  proveedor_codigo: string | null
  proveedor_nombre: string | null
  moneda: string | null
  oc_abierta: boolean
  cancelada: boolean
  articulo_codigo: string | null
  descripcion: string | null
  unidad: string | null
  bodega: string | null
  ceco: string | null
  grupo: string | null
  familia: string | null
  subfamilia: string | null
  cantidad: number
  recibido: number
  pendiente: number
  precio: number
  total: number
  pendiente_neto: number
  por_recibir: boolean
  atrasada: boolean
  solicitudes: string | null
}

/** Líneas de OC de SAP con fecha de la OC entre desde y hasta (null = sin límite), más las de OC abiertas. */
export async function listarLineasOcSap(desde: string | null, hasta: string | null = null): Promise<LineaOcSap[]> {
  return traerTodo<LineaOcSap>((i, j, contar) => {
    let q = supabase
      .from('adq_sap_oc_lineas_v')
      .select('*', contar ? { count: 'exact' } : undefined)
      .order('docnum', { ascending: false })
      .order('linea')
      .range(i, j)
    const filtro = fechaOAbierta(desde, hasta, 'oc_abierta')
    if (filtro) q = q.or(filtro)
    return q as unknown as Pagina<LineaOcSap>
  })
}

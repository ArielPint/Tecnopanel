import { supabase } from '@/lib/supabaseClient'
import { errorTamanoArchivo, nombreParaStorage } from '@/lib/storageKey'
import type { EstadoSolicitud } from './catalogos'

// Acceso a datos del portal Adquisiciones. Quién ve y hace qué lo decide la base (RLS y funciones
// adq_*): aquí no se filtra nada por rol.

const BUCKET = 'adquisiciones'

export const ARCHIVOS_ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx'

export interface DatosSolicitud {
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
  const { data, error: e } = await supabase.from('adq_niveles').select('*').order('nivel')
  if (e) error(e)
  return (data ?? []) as Nivel[]
}

/** Todos juntos: la base valida que cada nivel parta en un monto mayor que el anterior. */
export const guardarNiveles = (niveles: Nivel[]) => rpc('adq_guardar_niveles', { p: niveles })

/** Nivel que exige un monto, con la misma regla que adq_nivel_para(). */
export function nivelPara(niveles: Nivel[], monto: number | null): number {
  return Math.max(1, ...niveles.filter((n) => n.activo && n.monto_desde <= (monto ?? 0)).map((n) => n.nivel))
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

export async function listarOcSap(desde: string): Promise<OcSap[]> {
  const { data, error: e } = await supabase
    .from('adq_sap_oc_v')
    .select(
      'doc_entry, docnum, proveedor_codigo, proveedor_nombre, fecha, fecha_entrega, abierta, cancelada, total, moneda, comentarios, neto, facturado, recepcion_pct, facturado_pct, cecos, solicitudes',
    )
    .gte('fecha', desde)
    .order('docnum', { ascending: false })
    .limit(2000)
  if (e) error(e)
  return (data ?? []) as OcSap[]
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

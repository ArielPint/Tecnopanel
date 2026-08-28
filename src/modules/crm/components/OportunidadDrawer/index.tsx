import { useEffect, useState, useRef } from 'react'
import { X, ChevronRight, Upload, Link2, FileText, Clock, User, Loader2, Trash2, ExternalLink, MessageCircle, Send, Plus, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { toast } from 'sonner'
import tecnopanelLogo from '@/assets/tecnopanel-logo-color.png'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/modules/crm/contexts/AuthContext'
import { usePermisos } from '@/modules/crm/contexts/PermisosContext'
import { handleSupabaseError } from '@/modules/crm/lib/errors'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import MontoInput from '@/components/MontoInput'
import type { Oportunidad, Profile, OportunidadHistorialEtapa, OportunidadDocumento, TareaIngenieria, EstadoTarea, MensajeOportunidad, Cierre, TipologiaVitPrecio, OportunidadTipologia, ZonaTermicaVit, TipoSubsidioVit } from '@/modules/crm/types/database'
import { FAMILIA_PRODUCTOS_OPCIONES, ALCANCES_OPCIONES, REGIONES_COMUNAS, ZONAS_TERMICAS, TIPO_SUBSIDIO_OPCIONES } from '@/modules/crm/components/NuevaOportunidadModal'

const REGIONES = Object.keys(REGIONES_COMUNAS)

interface CubicacionItem { categoria: string; nombre: string; costo_unitario: number; cantidad: number; costo_total: number; tipologia?: string; slot?: number }

const CONDICIONES_TECNICAS_DEFAULT = 'De acuerdo a su solicitud y en función de los antecedentes aportados, hemos desarrollado una propuesta técnico – económica para el suministro de estructuras prefabricadas.\nEn efecto, nuestra oferta consta de un KIT de estructuras prefabricadas, todas debidamente detalladas en la propuesta económica.\nLos elementos de acero prefabricados Tecno Truss S.A se producen utilizando tecnología de punta, junto con acero y uniones de la más alta calidad disponible en el mercado. Nuestra línea productiva está totalmente integrada para proporcionar la solución más eficiente para todas sus necesidades: cerchas, muros y una amplia gama de soluciones constructivas en acero.\nLos elementos complementarios necesarios para la instalación de nuestros productos serán de cargo del cliente, Tecno Truss S.A solamente suministra las estructuras prefabricadas que se detallan en la oferta económica.'

const TERMINOS_CONDICIONES_DEFAULT = 'La cotización es válida por un período de 20 días, contados desde la fecha de entrega de la misma, después de este período estará sujeta a variaciones del tipo de cambio y/o cambio de condiciones de mercado.\nPresupuesto en base a Ingeniería Tecno Truss.\nDentro de las partidas de cerchas prefabricadas Tecno Truss S.A no ha incluido ningún tipo de elementos complementarios tales como costaneras, arriostamientos, cruces de San Andres, limatesas, cadenetas, conectores hurrican, tornillos, clavos, empalmes de piezas, vigas, canes falsos, tapacanes, fijaciones, anclajes y cualquier otro elemento que no este expresamente especificado en este presupuesto.\nCotización con definición de anteproyecto. Sujeta a modificaciones técnicas y económicas según solicitud de cliente y modificación de antecedentes.\nTecno Truss S.A respalda los diseños de sus estructuras a través de sus propios ingenieros, si el cliente requiere aprobar las estructuras presupuestadas por sus propios ingenieros y/o técnicos deberá cerciorarse de que la propuesta técnica este debidamente aprobada antes del inicio del suministro.\nTecno Truss S.A. utiliza en sus estructuras Acero Estructural Galvanizado G340 Z275, perfil Omega de 40x51x0,85 en cerchas y perfil C de 90x38x0,85 o de 63x38x0,85 en Muros y Frontones.\nForma de pago: Factura a 30 días.'

// Calcula el resumen de costos desde la hoja "ANALISIS" (agrupa por Nombre Estructura,
// costo_total = suma(Cantidad Total * PPTO) del grupo, costo_unitario = costo_total / Cantidad Estructura).
function parseAnalisisExcel(ws: XLSX.WorkSheet): { items: CubicacionItem[]; viviendasDetectadas: string[] } {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v
  const headerRow = range.s.r
  const headers: Record<string, number> = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = cell(headerRow, c)
    if (typeof h === 'string' && h.trim()) headers[h.trim().toLowerCase()] = c
  }
  const cVivienda = headers['vivienda']
  const cEstructura = headers['estructura']
  const cNombreEstructura = headers['nombre estructura']
  const cCantidadEstructura = headers['cantidad estructura']
  const cCantidadTotal = headers['cantidad total']
  const cPpto = headers['ppto']
  if ([cVivienda, cEstructura, cNombreEstructura, cCantidadEstructura, cCantidadTotal, cPpto].some(c => c == null)) {
    return { items: [], viviendasDetectadas: [] }
  }

  type Fila = { vivienda: string; estructura: string; nombreEstructura: string; cantidadEstructura: number; cantidadTotal: number; ppto: number }
  const filas: Fila[] = []
  const viviendasSet = new Set<string>()
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const vivienda = cell(r, cVivienda)
    const nombreEstructura = cell(r, cNombreEstructura)
    if (typeof vivienda !== 'string' || !vivienda.trim() || typeof nombreEstructura !== 'string' || !nombreEstructura.trim()) continue
    const cantidadTotal = cell(r, cCantidadTotal)
    const ppto = cell(r, cPpto)
    if (typeof cantidadTotal !== 'number' || typeof ppto !== 'number') continue
    viviendasSet.add(vivienda.trim())
    const estructura = cell(r, cEstructura)
    const cantidadEstructura = cell(r, cCantidadEstructura)
    filas.push({
      vivienda: vivienda.trim(),
      estructura: typeof estructura === 'string' ? estructura.trim() : '',
      nombreEstructura: nombreEstructura.trim(),
      cantidadEstructura: typeof cantidadEstructura === 'number' && cantidadEstructura > 0 ? cantidadEstructura : 1,
      cantidadTotal, ppto,
    })
  }

  const viviendasDetectadas = [...viviendasSet]

  const orden: string[] = []
  const grupos = new Map<string, Fila[]>()
  for (const f of filas) {
    if (!grupos.has(f.nombreEstructura)) { grupos.set(f.nombreEstructura, []); orden.push(f.nombreEstructura) }
    grupos.get(f.nombreEstructura)!.push(f)
  }
  const items: CubicacionItem[] = orden.map(nombre => {
    const grupo = grupos.get(nombre)!
    const costo_total = grupo.reduce((s, f) => s + f.cantidadTotal * f.ppto, 0)
    const cantidad = grupo[0].cantidadEstructura
    return { categoria: grupo[0].estructura || 'General', nombre, costo_unitario: cantidad ? costo_total / cantidad : costo_total, cantidad, costo_total }
  })
  return { items, viviendasDetectadas }
}

function money(n: number) { return formatCLP(Math.round(n)) }

// Dibuja una tabla de costos (titulo + encabezado + items + subtotal) tipo la del presupuesto de referencia.
function drawBloqueCostos(doc: jsPDF, x: number, y: number, w: number, titulo: string, items: CubicacionItem[], factor: number): { y: number; subtotal: number } {
  const rowH = 5.5
  const colDesc = x + 2
  const colUnit = x + w * 0.58
  const colCant = x + w * 0.74
  const colTotal = x + w - 2
  doc.setDrawColor(190); doc.setLineWidth(0.2)

  doc.setFillColor(243, 243, 243); doc.rect(x, y, w, rowH, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(titulo, x + w / 2, y + rowH - 1.7, { align: 'center' })
  y += rowH

  doc.rect(x, y, w, rowH, 'S')
  doc.text('Descripción', colDesc, y + rowH - 1.7)
  doc.text('Costo unitario', colUnit, y + rowH - 1.7, { align: 'right' })
  doc.text('Cantidad', colCant, y + rowH - 1.7, { align: 'center' })
  doc.text('Costo total', colTotal, y + rowH - 1.7, { align: 'right' })
  y += rowH

  doc.setFont('helvetica', 'normal')
  let subtotal = 0
  for (const it of items) {
    if (y > 280) { doc.addPage(); y = 20 }
    const total = it.costo_total * factor
    subtotal += total
    doc.rect(x, y, w, rowH, 'S')
    doc.text(it.nombre, colDesc, y + rowH - 1.7)
    doc.text(money(it.costo_unitario * factor), colUnit, y + rowH - 1.7, { align: 'right' })
    doc.text(it.cantidad.toLocaleString('es-CL'), colCant, y + rowH - 1.7, { align: 'center' })
    doc.text(money(total), colTotal, y + rowH - 1.7, { align: 'right' })
    y += rowH
  }

  const tituloUpper = titulo.toUpperCase()
  const label = tituloUpper.includes('PANEL') ? 'TOTAL PANELES SIP' : tituloUpper.includes('CERCHA') ? 'TOTAL CERCHAS' : `TOTAL ${titulo}`
  doc.setFillColor(230, 230, 230); doc.rect(x, y, w, rowH, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.text(label, x + w * 0.37, y + rowH - 1.7, { align: 'center' })
  doc.text(money(subtotal), colTotal, y + rowH - 1.7, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  return { y: y + rowH + 3, subtotal }
}

// Dibuja la sección completa de una tipología: barra de cabecera (cliente | tipología-proyecto | fecha) + sus bloques.
function drawSeccionTipologia(doc: jsPDF, y: number, cliente: string, tituloCabecera: string, fecha: string, grupos: [string, CubicacionItem[]][], factor: number): { y: number; total: number } {
  const x = 15, w = 180
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFillColor(237, 50, 36); doc.rect(x, y, w, 7, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(cliente.toUpperCase(), x + 2, y + 4.8)
  doc.text(tituloCabecera.toUpperCase(), x + w / 2, y + 4.8, { align: 'center' })
  doc.text(fecha, x + w - 2, y + 4.8, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y += 10

  let total = 0
  for (const [titulo, items] of grupos) {
    if (y > 260) { doc.addPage(); y = 20 }
    const r = drawBloqueCostos(doc, x, y, w, titulo, items, factor)
    y = r.y; total += r.subtotal
  }

  if (y > 265) { doc.addPage(); y = 20 }
  doc.setFillColor(237, 50, 36); doc.rect(x, y, w, 7, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('TOTAL', x + 3, y + 4.8)
  doc.text(money(total), x + w - 3, y + 4.8, { align: 'right' })
  doc.setTextColor(0, 0, 0); y += 7
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
  doc.text('MAS IVA', x + w - 3, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  return { y: y + 9, total }
}

const ETAPAS_ORDER = [
  'Clasificación','Ingeniería','Desarrollo','Costos y Presupuestos',
  'Ventas','Negociación',
]

// Flujo corto exclusivo de tipo_venta = VIT: Clasificacion -> Oportunidad -> Negociacion,
// sin pasar por Ingenieria/Desarrollo/Costos y Presupuestos/Ventas.
const ETAPAS_ORDER_VIT = ['Clasificación', 'Oportunidad', 'Negociación']

const CAMPOS_OPORTUNIDAD_REQUERIDOS = ['tipo_subsidio', 'programa', 'monto_estimado', 'fecha_ingreso_calificacion', 'estimacion_calificacion', 'fecha_inicio_despachos_est', 'duracion_meses_est'] as const

const ETAPAS_LABELS: Record<string,string> = {
  'Clasificación': 'Clasificación',
  'Oportunidad': 'Oportunidad',
  'Ingeniería': 'Ingeniería',
  'Desarrollo': 'Desarrollo',
  'Costos y Presupuestos': 'Costos y Presupuestos',
  'Ventas': 'Ventas',
  'Negociación': 'Negociación',
}

const TIPO_COLOR: Record<string, string> = {
  Proyecto: 'bg-purple-100 text-purple-700',
  Producto: 'bg-blue-100 text-blue-700',
  Kit: 'bg-amber-100 text-amber-700',
  VIT: 'bg-emerald-100 text-emerald-700',
}

const TIPO_VENTA_LABELS: Record<string, string> = {
  Proyecto: 'Proyecto',
  Producto: 'Venta Directa',
  Kit: 'Viviendas Industrializadas',
  VIT: 'VIT',
}

const STAGE_ROLES: Record<string, string[]> = {
  'Clasificación': ['admin','gerente_ventas','vendedor'],
  'Oportunidad': ['admin','gerente_ventas','vendedor'],
  'Ingeniería': ['admin','jefe_ingenieria','ingeniero'],
  'Desarrollo': ['admin','jefe_ingenieria','desarrollador'],
  'Costos y Presupuestos': ['admin','cubicador','presupuestista'],
  'Ventas': ['admin','gerente_ventas','vendedor'],
  'Negociación': ['admin','gerente_ventas','vendedor','finanzas'],
}

function formatMM(n: number) { return (n / 1_000_000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MM' }
function diffDias(from: string) {
  return Math.floor((new Date().getTime() - new Date(from).getTime()) / 86400000)
}
function getFileIcon(ext: string | null) {
  if (!ext) return '📄'
  const e = ext.toLowerCase()
  if (e === 'pdf') return '📕'
  if (['doc','docx'].includes(e)) return '📘'
  if (['xls','xlsx'].includes(e)) return '📗'
  if (e === 'dwg') return '📐'
  if (['jpg','jpeg','png','gif','webp'].includes(e)) return '🖼️'
  return '📄'
}

interface Props {
  oportunidad: Oportunidad
  onClose: () => void
  onUpdate: () => void
}

type Tab = 'general' | 'etapa' | 'docs' | 'historial' | 'chat'

export default function OportunidadDrawer({ oportunidad, onClose, onUpdate }: Props) {
  const { profile } = useAuth()
  const { canAccess } = usePermisos()
  const [tab, setTab] = useState<Tab>('general')
  const [opp, setOpp] = useState<Oportunidad>(oportunidad)
  const [usuarios, setUsuarios] = useState<Profile[]>([])
  const [etapaData, setEtapaData] = useState<Record<string, string>>({})
  const [costosData, setCostosData] = useState<Record<string, string>>({})
  const [tipologias, setTipologias] = useState<TipologiaVitPrecio[]>([])
  const [lineas, setLineas] = useState<OportunidadTipologia[]>([])
  const [docs, setDocs] = useState<OportunidadDocumento[]>([])
  const [historial, setHistorial] = useState<OportunidadHistorialEtapa[]>([])
  const [tareas, setTareas] = useState<TareaIngenieria[]>([])
  const [showCrearTarea, setShowCrearTarea] = useState(false)
  const [nuevaTarea, setNuevaTarea] = useState({ titulo: '', descripcion: '', asignados_ids: [] as string[], prioridad: '2', fecha_limite: '' })
  const [creandoTarea, setCreandoTarea] = useState(false)
  const [mensajes, setMensajes] = useState<MensajeOportunidad[]>([])
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [parsingExcel, setParsingExcel] = useState(false)
  const [excelError, setExcelError] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [presupuestoPdfUrl, setPresupuestoPdfUrl] = useState('')
  const [showItemManual, setShowItemManual] = useState(false)
  const [itemManual, setItemManual] = useState({ categoria: 'Manual', nombre: '', costo_unitario: '', cantidad: '1' })
  const [cierre, setCierre] = useState<Cierre | null>(null)
  const [ocForm, setOcForm] = useState({ numero_oc: '', monto_oc: '', fecha_oc: '' })
  const [ocFile, setOcFile] = useState<File | null>(null)
  const [savingOc, setSavingOc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkNombre, setLinkNombre] = useState('')
  const [showLink, setShowLink] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setOpp(oportunidad); setTab('general'); loadAll() }, [oportunidad.id])

  useEffect(() => {
    supabase.from('tipologia_vit_precios').select('tipologia,venta_actual_uf').order('venta_actual_uf')
      .then(({ data }) => setTipologias((data as TipologiaVitPrecio[]) ?? []))
  }, [])

  useEffect(() => {
    supabase.from('oportunidad_tipologias').select('*').eq('oportunidad_id', oportunidad.id).order('created_at')
      .then(({ data }) => setLineas((data as OportunidadTipologia[]) ?? []))
  }, [oportunidad.id])

  const tieneTipologias = opp.tipo_venta === 'VIT'
  function agregarLinea() {
    setLineas(ls => [...ls, { id: 'tmp-' + Date.now(), oportunidad_id: opp.id, tipologia: '', precio_uf: 0, cantidad_casas: 0, created_at: '' }])
  }
  useEffect(() => {
    if (tieneTipologias && lineas.length === 0) agregarLinea()
  }, [opp.tipo_venta])
  function actualizarLinea(idx: number, cambios: Partial<OportunidadTipologia>) {
    setLineas(ls => ls.map((l, i) => i === idx ? { ...l, ...cambios } : l))
  }
  function quitarLinea(idx: number) {
    setLineas(ls => ls.filter((_, i) => i !== idx))
  }
  function precioLinea(tipologia: string) {
    return tipologias.find(t => t.tipologia === tipologia)?.venta_actual_uf ?? 0
  }
  async function guardarLineas() {
    await supabase.from('oportunidad_tipologias').delete().eq('oportunidad_id', opp.id)
    const filas = lineas.filter(l => l.tipologia && l.cantidad_casas > 0)
      .map(l => ({ oportunidad_id: opp.id, tipologia: l.tipologia, precio_uf: precioLinea(l.tipologia), cantidad_casas: l.cantidad_casas }))
    if (filas.length) await supabase.from('oportunidad_tipologias').insert(filas)
  }

  useEffect(() => {
    if (tab !== 'chat') return
    loadMensajes()
  }, [tab, opp.id])

  async function loadAll() {
    setLoading(true)
    const [etapaRes, costosRes, docsRes, histRes, usersRes, tareasRes, cierreRes] = await Promise.all([
      supabase.from('oportunidad_datos_etapa').select('*').eq('oportunidad_id', oportunidad.id).eq('etapa', oportunidad.etapa_actual).maybeSingle(),
      supabase.from('oportunidad_datos_etapa').select('*').eq('oportunidad_id', oportunidad.id).eq('etapa', 'Costos y Presupuestos').maybeSingle(),
      supabase.from('oportunidad_documentos').select('*').eq('oportunidad_id', oportunidad.id).order('created_at', { ascending: false }),
      supabase.from('oportunidad_historial_etapas').select('*,usuario:profiles(nombre,apellido)').eq('oportunidad_id', oportunidad.id).order('fecha_entrada', { ascending: false }),
      supabase.from('profiles').select('*').eq('activo', true).order('nombre'),
      supabase.from('tareas_ingenieria').select('*').eq('oportunidad_id', oportunidad.id).order('created_at', { ascending: false }),
      supabase.from('cierres').select('*').eq('oportunidad_id', oportunidad.id).maybeSingle(),
    ])
    setEtapaData(((etapaRes.data as {datos?:Record<string,string>}|null)?.datos) ?? {})
    setCostosData(((costosRes.data as {datos?:Record<string,string>}|null)?.datos) ?? {})
    setDocs((docsRes.data as OportunidadDocumento[]) ?? [])
    setHistorial((histRes.data as OportunidadHistorialEtapa[]) ?? [])
    setUsuarios((usersRes.data as Profile[]) ?? [])
    const tareasBase = (tareasRes.data as TareaIngenieria[]) ?? []
    if (tareasBase.length) {
      const { data: tareaAsigs, error: tareaAsigsErr } = await supabase.from('tarea_asignaciones').select('tarea_id,usuario:profiles!tarea_asignaciones_usuario_id_fkey(id,nombre,apellido)').in('tarea_id', tareasBase.map(t => t.id))
      handleSupabaseError(tareaAsigsErr, 'OportunidadDrawer.loadAll.tareaAsignaciones')
      const byTarea: Record<string, Profile[]> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(tareaAsigs ?? []).forEach((a: any) => { (byTarea[a.tarea_id] ??= []).push(a.usuario) })
      setTareas(tareasBase.map(t => ({ ...t, asignados: byTarea[t.id] ?? [] })))
    } else setTareas([])
    const c = cierreRes.data as Cierre | null
    setCierre(c)
    setOcForm({ numero_oc: c?.numero_oc ?? '', monto_oc: c?.monto_oc != null ? String(c.monto_oc) : '', fecha_oc: c?.fecha_oc ?? '' })
    setLoading(false)
  }

  async function handleTipologiaExcel(file: File, slot: number) {
    setParsingExcel(true); setExcelError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase().startsWith('ANALISIS'))
      if (!sheetName) {
        setExcelError('No se encontró la hoja "ANALISIS" en este Excel.')
        setParsingExcel(false); return
      }
      const { items, viviendasDetectadas } = parseAnalisisExcel(wb.Sheets[sheetName])
      if (items.length === 0) {
        setExcelError('No se reconocieron ítems en la hoja "ANALISIS" de este Excel.')
      } else {
        const tipologia = viviendasDetectadas.join(' / ') || `Tipo ${slot + 1}`
        const taggedItems: CubicacionItem[] = items.map(it => ({ ...it, tipologia, slot }))
        setEtapaData(d => {
          let prev: CubicacionItem[] = []
          try { prev = JSON.parse(d['cubicacion_items_json'] || '[]') } catch { prev = [] }
          const resto = prev.filter(it => it.slot !== slot)
          return { ...d, cubicacion_items_json: JSON.stringify([...resto, ...taggedItems]) }
        })
      }
    } catch {
      setExcelError('No se pudo leer el archivo. Verifica que sea el Excel de costeo (.xlsx) con hoja "ANALISIS".')
    }
    setParsingExcel(false)
  }

  function renombrarBloque(slot: number | undefined, categoriaVieja: string, nuevoTitulo: string) {
    if (!nuevoTitulo.trim() || nuevoTitulo === categoriaVieja) return
    setEtapaData(d => {
      let items: CubicacionItem[] = []
      try { items = JSON.parse(d['cubicacion_items_json'] || '[]') } catch { items = [] }
      const actualizados = items.map(it => (it.categoria === categoriaVieja && it.slot === slot) ? { ...it, categoria: nuevoTitulo.trim() } : it)
      return { ...d, cubicacion_items_json: JSON.stringify(actualizados) }
    })
  }

  function agregarItemManual() {
    if (!itemManual.nombre.trim() || !itemManual.costo_unitario) return
    let items: CubicacionItem[] = []
    try { items = JSON.parse(etapaData['cubicacion_items_json'] || '[]') } catch { items = [] }
    const costo_unitario = Number(itemManual.costo_unitario)
    const cantidad = Number(itemManual.cantidad) || 1
    items.push({ categoria: itemManual.categoria.trim() || 'Manual', nombre: itemManual.nombre.trim(), costo_unitario, cantidad, costo_total: costo_unitario * cantidad })
    setEtapaData(d => ({ ...d, cubicacion_items_json: JSON.stringify(items) }))
    setItemManual({ categoria: 'Manual', nombre: '', costo_unitario: '', cantidad: '1' })
    setShowItemManual(false)
  }

  async function generarPresupuestoPdf() {
    let items: CubicacionItem[] = []
    try { items = JSON.parse(costosData['cubicacion_items_json'] || '[]') } catch { items = [] }
    if (items.length === 0) return
    setGenerandoPdf(true); setPresupuestoPdfUrl('')
    const costoCerchas = Number(costosData['costo_cerchas'] || 0)
    const costoFlete = Number(costosData['costo_flete'] || 0)
    const montoNetoCliente = Number(costosData['monto_neto_cliente'] || 0)
    const factor = opp.margen_porcentaje != null ? 1 + opp.margen_porcentaje / 100 : 1
    const proyecto = costosData['cubicacion_proyecto'] || opp.nombre
    const clienteNombre = (opp.cliente as { razon_social?: string } | undefined)?.razon_social || costosData['cubicacion_cliente'] || ''
    const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.addImage(tecnopanelLogo, 'PNG', 15, 12, 32, 23)
    doc.setDrawColor(237, 50, 36); doc.setLineWidth(1); doc.line(15, 42, 195, 42)

    const refPresupuesto = costosData['ref_presupuesto'] || String(proyecto)
    const obra = costosData['obra']
    const destinatario = obra ? `${clienteNombre.toUpperCase()}, OBRA ${obra.toUpperCase()}` : clienteNombre.toUpperCase()

    doc.setFont('helvetica', 'italic'); doc.setFontSize(10)
    doc.text(`Santiago, ${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}`, 195, 55, { align: 'right' })

    let y = 70
    doc.text('Señores', 15, y); y += 11
    doc.setFont('helvetica', 'bolditalic')
    doc.text(destinatario, 15, y); y += 6
    doc.text('Presente', 15, y); doc.line(15, y + 0.8, 15 + doc.getTextWidth('Presente'), y + 0.8); y += 11

    doc.setFont('helvetica', 'italic')
    const refLines = doc.splitTextToSize(refPresupuesto.toUpperCase(), 155)
    doc.text('Ref.: PRESUPUESTO', 15, y)
    doc.setFont('helvetica', 'bolditalic')
    doc.text(refLines, 55, y)
    refLines.forEach((_: string, i: number) => doc.line(55, y + i * 5.5 + 0.8, 55 + doc.getTextWidth(refLines[i]), y + i * 5.5 + 0.8))
    y += refLines.length * 5.5 + 11

    doc.setFont('helvetica', 'italic')
    doc.text('Estimado Señor:', 15, y); y += 11

    for (const parrafo of (costosData['condiciones_tecnicas'] || CONDICIONES_TECNICAS_DEFAULT).split('\n')) {
      const lineas = doc.splitTextToSize(parrafo, 180)
      doc.text(lineas, 15, y)
      y += lineas.length * 5.2 + 2.5
    }

    doc.addPage()
    y = 20

    // Agrupa items por tipología (orden = orden en que están cargadas las tipologías de la oportunidad),
    // y dentro de cada archivo por bloque (categoria), preservando el orden de aparición.
    const slotsOrden = [...new Set(items.map(it => it.slot).filter((s): s is number => s != null))].sort((a, b) => a - b)
    const porSlot = new Map<number, CubicacionItem[]>()
    const sinTipologia: CubicacionItem[] = []
    for (const it of items) {
      if (it.slot != null) { if (!porSlot.has(it.slot)) porSlot.set(it.slot, []); porSlot.get(it.slot)!.push(it) }
      else sinTipologia.push(it)
    }

    let totalGeneral = 0
    for (const slot of slotsOrden) {
      const itemsTip = porSlot.get(slot)
      if (!itemsTip?.length) continue
      const tipologia = itemsTip[0].tipologia || `Tipo ${slot + 1}`
      const grupos = new Map<string, CubicacionItem[]>()
      for (const it of itemsTip) { if (!grupos.has(it.categoria)) grupos.set(it.categoria, []); grupos.get(it.categoria)!.push(it) }
      const r = drawSeccionTipologia(doc, y, clienteNombre, `${tipologia} - ${proyecto}`, fecha, [...grupos.entries()], factor)
      y = r.y; totalGeneral += r.total
    }
    if (sinTipologia.length > 0) {
      const grupos = new Map<string, CubicacionItem[]>()
      for (const it of sinTipologia) { if (!grupos.has(it.categoria)) grupos.set(it.categoria, []); grupos.get(it.categoria)!.push(it) }
      const r = drawSeccionTipologia(doc, y, clienteNombre, String(proyecto), fecha, [...grupos.entries()], factor)
      y = r.y; totalGeneral += r.total
    }

    if (costoCerchas > 0 || costoFlete > 0) {
      if (y > 260) { doc.addPage(); y = 20 }
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      if (costoCerchas > 0) { doc.text('Cerchas (manual)', 17, y); doc.text(money(costoCerchas * factor), 193, y, { align: 'right' }); y += 5; totalGeneral += costoCerchas * factor }
      if (costoFlete > 0) { doc.text('FLETE', 17, y); doc.text(money(costoFlete * factor), 193, y, { align: 'right' }); y += 5; totalGeneral += costoFlete * factor }
      y += 3
    }
    if (y > 262) { doc.addPage(); y = 20 }
    doc.setFillColor(26, 26, 27); doc.rect(15, y, 180, 8, 'F'); doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(`TOTAL ${String(proyecto).toUpperCase()} NETO`, 17, y + 5.5)
    doc.text(money(montoNetoCliente || totalGeneral), 193, y + 5.5, { align: 'right' })
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal')

    doc.addPage()
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(10)
    doc.text('TÉRMINOS Y CONDICIONES FINANCIERAS', 15, 20)
    y = 32
    doc.setFontSize(9)
    for (const bullet of (costosData['terminos_condiciones'] || TERMINOS_CONDICIONES_DEFAULT).split('\n')) {
      doc.setFont('helvetica', 'bolditalic')
      doc.text('-', 15, y)
      doc.setFont('helvetica', 'italic')
      const lineas = doc.splitTextToSize(bullet, 172)
      doc.text(lineas, 20, y)
      y += lineas.length * 5 + 3
    }
    y += 12
    doc.setFont('helvetica', 'italic')
    doc.text('Agradeciendo su interés por contar con nuestro sistema, se despide atentamente', 15, y)
    y += 20
    doc.setFont('helvetica', 'bolditalic')
    doc.text(`${profile?.nombre ?? ''} ${profile?.apellido ?? ''}`.trim() || 'Equipo Comercial', 25, y)
    doc.setFont('helvetica', 'italic')
    doc.text('Tecno Truss S.A.', 25, y + 10)

    const blob = doc.output('blob')
    const path = opp.id + '/presupuesto-' + Date.now() + '.pdf'
    const { error: upErr } = await supabase.storage.from('oportunidades').upload(path, blob)
    if (!upErr) {
      await supabase.from('oportunidad_documentos').insert({
        oportunidad_id: opp.id, nombre: `Presupuesto ${opp.codigo}.pdf`, tipo: 'archivo',
        url: path, extension: 'pdf', tamanio_bytes: blob.size, subido_por: profile?.id, etapa: 'Costos y Presupuestos',
      })
      const { data: signed } = await supabase.storage.from('oportunidades').createSignedUrl(path, 3600)
      if (signed?.signedUrl) setPresupuestoPdfUrl(signed.signedUrl)
    }
    setGenerandoPdf(false)
    await loadAll()
  }

  async function guardarOc() {
    setSavingOc(true)
    let storagePath = cierre?.storage_oc_path ?? null
    if (ocFile) {
      const path = opp.id + '/oc-' + Date.now() + '-' + ocFile.name
      const { error: upErr } = await supabase.storage.from('oportunidades').upload(path, ocFile)
      if (upErr) { setSavingOc(false); handleSupabaseError(upErr, 'OportunidadDrawer.guardarOc.upload'); return }
      storagePath = path
      const { error: docErr } = await supabase.from('oportunidad_documentos').insert({
        oportunidad_id: opp.id, nombre: ocFile.name, tipo: 'archivo',
        url: path, extension: ocFile.name.split('.').pop() ?? '', tamanio_bytes: ocFile.size,
        subido_por: profile?.id, etapa: opp.etapa_actual, comentario: 'Orden de Compra',
      })
      if (handleSupabaseError(docErr, 'OportunidadDrawer.guardarOc.doc')) { setSavingOc(false); return }
    }
    const payload = {
      numero_oc: ocForm.numero_oc.trim() || null,
      monto_oc: ocForm.monto_oc ? Number(ocForm.monto_oc) : null,
      fecha_oc: ocForm.fecha_oc || null,
      storage_oc_path: storagePath,
    }
    const { error } = cierre
      ? await supabase.from('cierres').update(payload).eq('id', cierre.id)
      : await supabase.from('cierres').insert({
          oportunidad_id: opp.id, resultado: 'ganado', registrado_por: profile?.id, ...payload,
        })
    setOcFile(null); setSavingOc(false)
    if (handleSupabaseError(error, 'OportunidadDrawer.guardarOc')) return
    toast.success('OC guardada')
    await loadAll()
  }

  async function loadMensajes() {
    const { data, error } = await supabase.from('mensajes_oportunidad').select('*,usuario:profiles(nombre,apellido)')
      .eq('oportunidad_id', opp.id).order('created_at', { ascending: true })
    handleSupabaseError(error, 'OportunidadDrawer.loadMensajes')
    setMensajes((data as MensajeOportunidad[]) ?? [])
  }

  async function enviarMensaje() {
    if (!nuevoMensaje.trim() || !profile?.id) return
    const texto = nuevoMensaje.trim()
    setNuevoMensaje('')
    const { error } = await supabase.from('mensajes_oportunidad').insert({
      oportunidad_id: opp.id, etapa: opp.etapa_actual, usuario_id: profile.id, mensaje: texto,
    })
    if (handleSupabaseError(error, 'OportunidadDrawer.enviarMensaje')) {
      setNuevoMensaje(texto)
      return
    }
    await loadMensajes()
  }

  async function crearTarea() {
    if (!nuevaTarea.titulo.trim()) return
    setCreandoTarea(true)
    const { data: tarea, error: tareaErr } = await supabase.from('tareas_ingenieria').insert({
      oportunidad_id: opp.id, titulo: nuevaTarea.titulo.trim(),
      descripcion: nuevaTarea.descripcion.trim() || null,
      prioridad: Number(nuevaTarea.prioridad),
      fecha_limite: nuevaTarea.fecha_limite || null,
    }).select('id').single()
    if (handleSupabaseError(tareaErr, 'OportunidadDrawer.crearTarea')) { setCreandoTarea(false); return }
    if (tarea && nuevaTarea.asignados_ids.length) {
      const { error: asigErr } = await supabase.from('tarea_asignaciones').insert(
        nuevaTarea.asignados_ids.map(usuario_id => ({ tarea_id: tarea.id, usuario_id, asignado_por: profile?.id }))
      )
      handleSupabaseError(asigErr, 'OportunidadDrawer.crearTarea.asignaciones')
      const { error: notifErr } = await supabase.from('notifications').insert(
        nuevaTarea.asignados_ids.map(user_id => ({
          user_id, tipo: 'asignacion',
          titulo: `Nueva tarea: ${nuevaTarea.titulo.trim()}`,
          mensaje: `${opp.codigo} · ${opp.nombre}`,
          oportunidad_id: opp.id,
        }))
      )
      handleSupabaseError(notifErr, 'OportunidadDrawer.crearTarea.notify')
    }
    setNuevaTarea({ titulo: '', descripcion: '', asignados_ids: [], prioridad: '2', fecha_limite: '' })
    setShowCrearTarea(false); setCreandoTarea(false)
    await loadAll()
  }

  async function responderTarea(tareaId: string, estado: EstadoTarea) {
    const { error } = await supabase.from('tareas_ingenieria').update({ estado }).eq('id', tareaId)
    if (handleSupabaseError(error, 'OportunidadDrawer.responderTarea')) return
    setTareas(ts => ts.map(t => t.id === tareaId ? { ...t, estado } : t))
  }

  async function saveMargen(value: number | null) {
    const anterior = opp.margen_porcentaje
    setOpp(o => ({ ...o, margen_porcentaje: value }))
    const { error } = await supabase.from('oportunidades').update({ margen_porcentaje: value }).eq('id', opp.id)
    if (handleSupabaseError(error, 'OportunidadDrawer.saveMargen')) {
      setOpp(o => ({ ...o, margen_porcentaje: anterior }))
    }
  }

  async function saveGeneral() {
    setSaving(true)
    const { error } = await supabase.from('oportunidades').update({
      nombre: opp.nombre, monto_estimado: opp.monto_estimado,
      probabilidad: opp.probabilidad, fecha_cierre_est: opp.fecha_cierre_est,
      descripcion: opp.descripcion, tipo_venta: opp.tipo_venta,
      region: opp.region, comuna: opp.comuna,
      cantidad_casas: opp.cantidad_casas, cantidad_tipos_casas: opp.cantidad_tipos_casas,
      fecha_adjudicacion_est: opp.fecha_adjudicacion_est, fecha_inicio_despachos_est: opp.fecha_inicio_despachos_est,
      duracion_meses_est: opp.duracion_meses_est, nombre_entidad_patrocinante: opp.nombre_entidad_patrocinante,
      familia_productos: opp.familia_productos, alcances: opp.alcances,
      nombre_comite_vivienda: opp.nombre_comite_vivienda, nombre_constructora: opp.nombre_constructora,
      zona_termica: opp.zona_termica, valor_uf: opp.valor_uf,
    }).eq('id', opp.id)
    if (tieneTipologias) await guardarLineas()
    setSaving(false)
    if (handleSupabaseError(error, 'OportunidadDrawer.saveGeneral')) return
    onUpdate()
  }

  // Guarda los campos de la etapa "Oportunidad" (columnas reales de oportunidades, no jsonb).
  // Si con este guardado quedan los 7 campos requeridos completos, avanza automaticamente a Negociacion.
  async function saveOportunidadCampos() {
    setSaving(true)
    const { error } = await supabase.from('oportunidades').update({
      tipo_subsidio: opp.tipo_subsidio, programa: opp.programa,
      monto_estimado: opp.monto_estimado,
      fecha_ingreso_calificacion: opp.fecha_ingreso_calificacion, estimacion_calificacion: opp.estimacion_calificacion,
      fecha_inicio_despachos_est: opp.fecha_inicio_despachos_est, duracion_meses_est: opp.duracion_meses_est,
      updated_at: new Date().toISOString(),
    }).eq('id', opp.id)
    if (handleSupabaseError(error, 'OportunidadDrawer.saveOportunidadCampos')) { setSaving(false); return }
    const completo = CAMPOS_OPORTUNIDAD_REQUERIDOS.every(k => opp[k] !== null && opp[k] !== '' && opp[k] !== undefined)
    if (completo && opp.etapa_actual === 'Oportunidad') {
      await avanzarEtapa()
      return
    }
    setSaving(false); onUpdate()
  }

  async function saveEtapaData() {
    setSaving(true)
    const { error } = await supabase.from('oportunidad_datos_etapa').upsert({
      oportunidad_id: opp.id, etapa: opp.etapa_actual,
      datos: etapaData, updated_by: profile?.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'oportunidad_id,etapa' })
    setSaving(false)
    handleSupabaseError(error, 'OportunidadDrawer.saveEtapaData')
  }

  // Cierra el historial de la etapa actual, mueve oportunidades.etapa_actual y abre nuevo historial.
  // Si el insert de historial falla tras el update, revierte el update para no desincronizar deal state vs audit trail.
  async function cambiarEtapaOportunidad(newEtapa: string, notif: { tipo: string; titulo: string; mensaje: string }): Promise<boolean> {
    const etapaAnterior = opp.etapa_actual
    setSaving(true)
    const { data: cur } = await supabase.from('oportunidad_historial_etapas').select('id').eq('oportunidad_id', opp.id).eq('etapa', etapaAnterior).is('fecha_salida', null).maybeSingle()
    if (cur) {
      const { error } = await supabase.from('oportunidad_historial_etapas').update({ fecha_salida: new Date().toISOString(), usuario_id: profile?.id }).eq('id', (cur as {id:string}).id)
      if (handleSupabaseError(error, 'OportunidadDrawer.cambiarEtapa.cerrarHistorial')) { setSaving(false); return false }
    }
    const { error: updErr } = await supabase.from('oportunidades').update({ etapa_actual: newEtapa, updated_at: new Date().toISOString() }).eq('id', opp.id)
    if (handleSupabaseError(updErr, 'OportunidadDrawer.cambiarEtapa.update')) { setSaving(false); return false }
    const { error: histErr } = await supabase.from('oportunidad_historial_etapas').insert({ oportunidad_id: opp.id, etapa: newEtapa, fecha_entrada: new Date().toISOString(), usuario_id: profile?.id })
    if (handleSupabaseError(histErr, 'OportunidadDrawer.cambiarEtapa.insertHistorial')) {
      await supabase.from('oportunidades').update({ etapa_actual: etapaAnterior, updated_at: new Date().toISOString() }).eq('id', opp.id)
      setSaving(false)
      return false
    }
    const { error: notifErr } = await supabase.from('notifications').insert({ user_id: profile?.id, oportunidad_id: opp.id, ...notif })
    handleSupabaseError(notifErr, 'OportunidadDrawer.cambiarEtapa.notify')
    setSaving(false)
    return true
  }

  async function avanzarEtapa() {
    const orden = opp.tipo_venta === 'VIT' ? ETAPAS_ORDER_VIT : ETAPAS_ORDER
    const idx = orden.indexOf(opp.etapa_actual)
    const newEtapa = idx >= 0 && idx < orden.length - 1 ? orden[idx + 1] : 'Ganado'
    const ok = await cambiarEtapaOportunidad(newEtapa, {
      tipo: 'etapa_cambio',
      titulo: `${opp.nombre} avanzó a ${newEtapa}`,
      mensaje: `${opp.codigo} · de ${opp.etapa_actual} a ${newEtapa}`,
    })
    if (ok) { onUpdate(); onClose() }
  }

  async function retrocederEtapa() {
    const orden = opp.tipo_venta === 'VIT' ? ETAPAS_ORDER_VIT : ETAPAS_ORDER
    const idx = orden.indexOf(opp.etapa_actual)
    if (idx <= 0) return
    const newEtapa = orden[idx - 1]
    const ok = await cambiarEtapaOportunidad(newEtapa, {
      tipo: 'etapa_cambio',
      titulo: `${opp.nombre} retrocedió a ${newEtapa}`,
      mensaje: `${opp.codigo} · de ${opp.etapa_actual} a ${newEtapa}`,
    })
    if (ok) { onUpdate(); onClose() }
  }

  async function eliminarOportunidad() {
    if (!confirm(`¿Eliminar definitivamente ${opp.codigo} · ${opp.nombre}? Esta acción no se puede deshacer y borra todo su historial, documentos y datos asociados.`)) return
    setSaving(true)
    const { error: err } = await supabase.from('oportunidades').delete().eq('id', opp.id)
    setSaving(false)
    if (err) { alert('No se pudo eliminar: ' + err.message); return }
    onUpdate(); onClose()
  }

  async function marcarEstado(estado: 'Ganado' | 'Perdido') {
    const ok = await cambiarEtapaOportunidad(estado, {
      tipo: 'estado_final',
      titulo: `${opp.nombre} marcada como ${estado}`,
      mensaje: `${opp.codigo} · ${estado === 'Ganado' ? '✓ cerrada con éxito' : '✗ perdida'}`,
    })
    if (ok) { onUpdate(); onClose() }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() ?? ''
    const path = opp.id + '/' + Date.now() + '-' + file.name
    const { error: upErr } = await supabase.storage.from('oportunidades').upload(path, file)
    if (handleSupabaseError(upErr, 'OportunidadDrawer.uploadFile.storage')) { setUploading(false); return }
    const { error: docErr } = await supabase.from('oportunidad_documentos').insert({
      oportunidad_id: opp.id, nombre: file.name, tipo: 'archivo',
      url: path, extension: ext, tamanio_bytes: file.size,
      subido_por: profile?.id, etapa: opp.etapa_actual,
    })
    if (handleSupabaseError(docErr, 'OportunidadDrawer.uploadFile.insert')) { setUploading(false); return }
    await loadAll()
    setUploading(false)
  }

  function isSafeUrl(url: string): boolean {
    try {
      const { protocol } = new URL(url)
      return protocol === 'https:' || protocol === 'http:'
    } catch { return false }
  }

  async function addLink() {
    if (!linkUrl.trim()) return
    if (!isSafeUrl(linkUrl.trim())) {
      alert('Solo se permiten URLs http o https.')
      return
    }
    const { error } = await supabase.from('oportunidad_documentos').insert({
      oportunidad_id: opp.id, nombre: linkNombre.trim() || linkUrl.trim(),
      tipo: 'link', url: linkUrl.trim(), subido_por: profile?.id, etapa: opp.etapa_actual,
    })
    if (handleSupabaseError(error, 'OportunidadDrawer.addLink')) return
    setLinkUrl(''); setLinkNombre(''); setShowLink(false); await loadAll()
  }

  async function saveComentarioDoc(id: string, comentario: string) {
    const { error } = await supabase.from('oportunidad_documentos').update({ comentario: comentario.trim() || null }).eq('id', id)
    if (handleSupabaseError(error, 'OportunidadDrawer.saveComentarioDoc')) return
    setDocs(ds => ds.map(d => d.id === id ? { ...d, comentario: comentario.trim() || null } : d))
  }

  async function deleteDoc(id: string, tipo: string, url: string) {
    if (tipo === 'archivo') {
      const { error: storErr } = await supabase.storage.from('oportunidades').remove([url])
      if (handleSupabaseError(storErr, 'OportunidadDrawer.deleteDoc.storage')) return
    }
    const { error } = await supabase.from('oportunidad_documentos').delete().eq('id', id)
    if (handleSupabaseError(error, 'OportunidadDrawer.deleteDoc')) return
    await loadAll()
  }

  async function openFile(tipo: string, url: string) {
    if (tipo === 'link') {
      if (!isSafeUrl(url)) return
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const { data, error } = await supabase.storage.from('oportunidades').createSignedUrl(url, 3600)
    if (handleSupabaseError(error, 'OportunidadDrawer.openFile')) return
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const etapas = opp.tipo_venta === 'VIT' ? ETAPAS_ORDER_VIT : ETAPAS_ORDER
  const currentIdx = etapas.indexOf(opp.etapa_actual)
  const isTerminal = ['Ganado','Perdido'].includes(opp.etapa_actual)
  const nextEtapa = currentIdx >= 0 && currentIdx < etapas.length - 1 ? etapas[currentIdx + 1] : 'Ganado'
  const comunasDisponibles = opp.region ? (REGIONES_COMUNAS[opp.region] ?? []) : []
  const allowedRoles = STAGE_ROLES[opp.etapa_actual] ?? []
  const filteredUsers = usuarios.filter(u => allowedRoles.includes(u.rol))
  // Mismo control de rol para Avanzar y Retroceder: ambas son acciones de gestión de la etapa actual.
  // gerente_ventas gestiona el pipeline completo, sin restricción de etapa (igual que admin).
  const canManageStage = !profile?.rol || profile.rol === 'gerente_ventas' || allowedRoles.length === 0 || allowedRoles.includes(profile.rol)
  const canGoBack = currentIdx > 0 && !isTerminal

  function renderEtapaForm() {
    const e = opp.etapa_actual
    const field = (key: string, label: string, type = 'text', placeholder = '') => (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <input type={type} value={etapaData[key] ?? ''} onChange={ev => setEtapaData(d => ({...d,[key]:ev.target.value}))} placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
      </div>
    )
    const ta = (key: string, label: string, placeholder = '') => (
      <div key={key}>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <textarea value={etapaData[key] ?? ''} onChange={ev => setEtapaData(d => ({...d,[key]:ev.target.value}))} rows={3} placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red resize-none" />
      </div>
    )
    if (e === 'Clasificación') return (
      <div className="text-center py-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Etapa actual</p>
        <p className="text-lg font-bold text-gray-700">Clasificación</p>
        {opp.tipo_venta === 'VIT' && <p className="text-xs text-gray-400 mt-1">Los campos de clasificación VIT se editan en la pestaña General.</p>}
      </div>
    )
    if (e === 'Oportunidad') return (
      <div className="space-y-3">
        <p className="text-xs text-gray-400">Al completar estos 7 campos, la oportunidad pasa automáticamente a Negociación.</p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Subsidio</label>
          <select value={opp.tipo_subsidio ?? ''} onChange={ev => setOpp(o => ({...o, tipo_subsidio: (ev.target.value || null) as TipoSubsidioVit | null}))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
            <option value="">Seleccionar...</option>
            {TIPO_SUBSIDIO_OPCIONES.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Programa</label>
          <input value={opp.programa ?? ''} onChange={ev => setOpp(o => ({...o, programa: ev.target.value || null}))} placeholder="ej. Nuevos Terrenos"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valor total del proyecto (CLP)</label>
          <MontoInput value={opp.monto_estimado} onChange={v => setOpp(o => ({...o, monto_estimado: v}))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Ingreso a Serviu</label>
            <input type="date" value={opp.fecha_ingreso_calificacion ?? ''} onChange={ev => setOpp(o => ({...o, fecha_ingreso_calificacion: ev.target.value || null}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estimación Calificación del proyecto</label>
            <input type="date" value={opp.estimacion_calificacion ?? ''} onChange={ev => setOpp(o => ({...o, estimacion_calificacion: ev.target.value || null}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estimación Inicio Despachos</label>
            <input type="date" value={opp.fecha_inicio_despachos_est ?? ''} onChange={ev => setOpp(o => ({...o, fecha_inicio_despachos_est: ev.target.value || null}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad de meses de despacho</label>
            <input type="number" min="0" value={opp.duracion_meses_est ?? ''} onChange={ev => setOpp(o => ({...o, duracion_meses_est: ev.target.value ? Number(ev.target.value) : null}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>
        </div>
        <button onClick={saveOportunidadCampos} disabled={saving} className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
          {saving && <Loader2 size={14} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar datos de Oportunidad'}
        </button>
      </div>
    )
    if (e === 'Ingeniería') return null
    if (e === 'Desarrollo') return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de documento entregado</label>
          <select value={etapaData['tipo_documento'] ?? ''} onChange={ev => setEtapaData(d => ({...d,tipo_documento:ev.target.value}))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
            <option value="">Seleccionar...</option>
            <option value="Plano">Plano</option>
            <option value="Ficha">Ficha</option>
          </select>
        </div>
        {ta('notas_desarrollo','Notas','Observaciones sobre la entrega. El archivo se sube en la pestaña Docs.')}
      </div>
    )
    if (e === 'Costos y Presupuestos') {
      let cubicacionItems: CubicacionItem[] = []
      try { cubicacionItems = JSON.parse(etapaData['cubicacion_items_json'] || '[]') } catch { cubicacionItems = [] }
      const gruposItems = new Map<string, { slot?: number; tipologia?: string; categoria: string; items: CubicacionItem[] }>()
      for (const it of cubicacionItems) {
        const key = `${it.slot ?? ''}|||${it.categoria}`
        if (!gruposItems.has(key)) gruposItems.set(key, { slot: it.slot, tipologia: it.tipologia, categoria: it.categoria, items: [] })
        gruposItems.get(key)!.items.push(it)
      }
      const costoCerchas = Number(etapaData['costo_cerchas'] || 0)
      const costoFlete = Number(etapaData['costo_flete'] || 0)
      const costoTotalInterno = cubicacionItems.reduce((s, i) => s + i.costo_total, 0) + costoCerchas + costoFlete
      const numArchivos = opp.cantidad_tipos_casas ?? 0
      const slotsSubidos = new Set(cubicacionItems.map(it => it.slot).filter(s => s != null))
      return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cubicación desde Excel (hoja "ANALISIS")</p>
        {numArchivos === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">Seteá "Cantidad de tipos de casas" en la pestaña General para saber cuántos archivos subir.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Se {numArchivos === 1 ? 'requiere' : 'requieren'} {numArchivos} {numArchivos === 1 ? 'archivo' : 'archivos'} (uno por tipo de casa) — subidos: {slotsSubidos.size}/{numArchivos}</p>
            {Array.from({ length: numArchivos }, (_, slot) => {
              const subido = cubicacionItems.find(it => it.slot === slot)
              return (
                <div key={slot} className="border border-gray-200 rounded-lg p-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1 cursor-pointer">
                    <FileSpreadsheet size={14} /> Tipo de casa {slot + 1}
                    {subido && <span className="text-green-600 font-normal">— cargado ({subido.tipologia})</span>}
                  </label>
                  <input type="file" accept=".xlsx,.xls" disabled={parsingExcel}
                    onChange={ev => { const f = ev.target.files?.[0]; if (f) handleTipologiaExcel(f, slot); ev.target.value = '' }}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:bg-gray-50 hover:file:bg-gray-100" />
                </div>
              )
            })}
            {parsingExcel && <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Leyendo Excel...</p>}
            {excelError && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{excelError}</p>}
          </div>
        )}
        {cubicacionItems.length > 0 && (
          <div className="space-y-2 text-xs">
            {[...gruposItems.entries()].map(([key, { slot, tipologia, categoria, items: group }]) => (
              <div key={key} className="border border-gray-200 rounded-lg p-2">
                {tipologia && <p className="text-[10px] font-semibold text-crm-red uppercase mb-0.5">{tipologia}</p>}
                <input defaultValue={categoria} onBlur={ev => renombrarBloque(slot, categoria, ev.target.value)}
                  className="font-semibold text-gray-600 mb-1 w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-crm-red rounded px-1 -mx-1" />
                {group.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-gray-500">
                    <span className="truncate">{it.nombre}</span>
                    <span className="flex-shrink-0 ml-2">{formatCLP(it.costo_total)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium text-gray-700 border-t border-gray-100 mt-1 pt-1">
                  <span>Total neto</span><span>{formatCLP(group.reduce((s, i) => s + i.costo_total, 0))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div>
          <button type="button" onClick={() => setShowItemManual(s => !s)} className="flex items-center gap-1 text-xs font-medium text-crm-red hover:underline">
            <Plus size={12} /> Agregar ítem manual (ej. algo que falte en el Excel)
          </button>
          {showItemManual && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-2">
              <input value={itemManual.categoria} onChange={ev => setItemManual(m => ({...m, categoria: ev.target.value}))} placeholder="Categoría (ej. PANELES)" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
              <input value={itemManual.nombre} onChange={ev => setItemManual(m => ({...m, nombre: ev.target.value}))} placeholder="Descripción *" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <MontoInput value={itemManual.costo_unitario ? Number(itemManual.costo_unitario) : null} onChange={v => setItemManual(m => ({...m, costo_unitario: v != null ? String(v) : ''}))} placeholder="Costo unitario *" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                <input type="number" value={itemManual.cantidad} onChange={ev => setItemManual(m => ({...m, cantidad: ev.target.value}))} placeholder="Cantidad" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
              </div>
              <button type="button" onClick={agregarItemManual} className="px-3 py-1 text-xs text-white rounded" style={{background:'#ed3224'}}>Agregar</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('costo_cerchas', 'Cerchas (CLP, manual)', 'number', '0')}
          {field('costo_flete', 'Flete (CLP, manual)', 'number', '0')}
        </div>
        {cubicacionItems.length > 0 && (
          <p className="text-xs font-semibold text-gray-700">Costo total interno: {formatCLP(costoTotalInterno)}</p>
        )}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Presupuesto para el cliente</p>
        {field('monto_neto_cliente', 'Monto neto cliente (CLP)', 'number', '0')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('obra', 'Obra (opcional, ej. LLACOLEN r4)')}
          {field('ref_presupuesto', 'Ref. del presupuesto (para el PDF)', 'text', 'ej. Paneles de 90CA085...')}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Carta de presentación (para el PDF)</label>
          <textarea value={etapaData['condiciones_tecnicas'] ?? CONDICIONES_TECNICAS_DEFAULT}
            onChange={ev => setEtapaData(d => ({ ...d, condiciones_tecnicas: ev.target.value }))} rows={5}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red resize-none" />
        </div>
        <p className="text-xs text-gray-400">El PDF se genera en la etapa Ventas, luego de revisar toda la información.</p>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Cubicación manual (si no aplica Excel)</p>
        {field('acero_kg','Acero estructural (kg)','number','0')}{field('paneles_m2','Paneles (m²)','number','0')}{field('cubierta_m2','Cubierta (m²)','number','0')}{field('pilares_und','Pilares (und)','number','0')}{ta('lista_materiales','Materiales adicionales','Otros componentes...')}{ta('observaciones','Observaciones cubicación','')}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Presupuesto manual</p>
        {field('costo_materiales','Costo materiales (CLP)','number','0')}{field('costo_mano_obra','Mano de obra (CLP)','number','0')}{field('costo_transporte','Transporte (CLP)','number','0')}{field('precio_final','Precio final (CLP)','number','0')}{ta('notas_presupuesto','Notas','Condiciones, exclusiones...')}
      </div>
      )
    }
    if (e === 'Ventas') {
      let costosItems: CubicacionItem[] = []
      try { costosItems = JSON.parse(costosData['cubicacion_items_json'] || '[]') } catch { costosItems = [] }
      const factorMargen = 1 + (opp.margen_porcentaje ?? 0) / 100
      const gruposConMargen = new Map<string, CubicacionItem[]>()
      for (const it of costosItems) {
        if (!gruposConMargen.has(it.categoria)) gruposConMargen.set(it.categoria, [])
        gruposConMargen.get(it.categoria)!.push(it)
      }
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Margen (%)</label>
            <input type="number" defaultValue={opp.margen_porcentaje ?? ''}
              onBlur={ev => { const v = ev.target.value ? Number(ev.target.value) : null; if (v !== opp.margen_porcentaje) saveMargen(v) }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            <p className="text-[11px] text-gray-400 mt-1">Se aplica a cada item de la cubicacion para calcular el precio de venta.</p>
          </div>
          {costosItems.length > 0 && (
            <div className="space-y-2 text-xs">
              {[...gruposConMargen.entries()].map(([categoria, group]) => (
                <div key={categoria} className="border border-gray-200 rounded-lg p-2">
                  <p className="font-semibold text-gray-600 mb-1">{categoria}</p>
                  {group.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-gray-500">
                      <span className="truncate">{it.nombre}</span>
                      <span className="flex-shrink-0 ml-2">{formatCLP(it.costo_total)} → <span className="font-medium text-gray-700">{formatCLP(it.costo_total * factorMargen)}</span></span>
                    </div>
                  ))}
                </div>
              ))}
              <p className="font-semibold text-gray-700 border-t border-gray-200 pt-2">
                Total con margen: {formatCLP(costosItems.reduce((s, i) => s + i.costo_total, 0) * factorMargen)}
              </p>
            </div>
          )}
          {ta('condiciones_comerciales','Condiciones comerciales','Formas de pago, garantias...')}{ta('notas_revision','Notas del vendedor','')}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2">Presupuesto final</p>
            <button onClick={generarPresupuestoPdf} disabled={generandoPdf || costosItems.length === 0}
              className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
              {generandoPdf && <Loader2 size={14} className="animate-spin" />}{generandoPdf ? 'Generando...' : 'Generar Presupuesto PDF'}
            </button>
            {costosItems.length === 0 && <p className="text-xs text-gray-400 mt-1">Falta la cubicación cargada en Costos y Presupuestos.</p>}
            {presupuestoPdfUrl && (
              <a href={presupuestoPdfUrl} target="_blank" rel="noreferrer" download={`Presupuesto ${opp.codigo}.pdf`}
                className="w-full py-2 border border-green-200 bg-green-50 text-green-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-100 mt-2">
                <FileText size={14} /> PDF generado — Descargar
              </a>
            )}
          </div>
        </div>
      )
    }
    if (e === 'Negociación') return (
      <div className="space-y-3">
        {opp.tipo_venta === 'VIT' && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-1 text-xs text-gray-600">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resumen recopilado (Clasificación + Oportunidad)</p>
            <p><span className="text-gray-400">Entidad Patrocinante:</span> {opp.nombre_entidad_patrocinante || '—'}</p>
            <p><span className="text-gray-400">Comité de Vivienda:</span> {opp.nombre_comite_vivienda || '—'}</p>
            <p><span className="text-gray-400">Constructora:</span> {opp.nombre_constructora || '—'}</p>
            <p><span className="text-gray-400">Región / Comuna:</span> {[opp.region, opp.comuna].filter(Boolean).join(' / ') || '—'}</p>
            <p><span className="text-gray-400">Zona Térmica:</span> {opp.zona_termica || '—'}</p>
            <p><span className="text-gray-400">Tipologías:</span> {lineas.length ? lineas.map(l => `${l.tipologia} x${l.cantidad_casas}`).join(', ') : '—'}</p>
            <p><span className="text-gray-400">Valor UF:</span> {opp.valor_uf != null ? formatCLP(opp.valor_uf) : '—'}</p>
            <p><span className="text-gray-400">Tipo de Subsidio:</span> {opp.tipo_subsidio || '—'}</p>
            <p><span className="text-gray-400">Programa:</span> {opp.programa || '—'}</p>
            <p><span className="text-gray-400">Valor total del proyecto:</span> {opp.monto_estimado != null ? formatCLP(opp.monto_estimado) : '—'}</p>
            <p><span className="text-gray-400">Fecha Ingreso Calificación:</span> {opp.fecha_ingreso_calificacion || '—'}</p>
            <p><span className="text-gray-400">Estimación Calificación:</span> {opp.estimacion_calificacion || '—'}</p>
            <p><span className="text-gray-400">Estimación Inicio Despachos:</span> {opp.fecha_inicio_despachos_est || '—'}</p>
            <p><span className="text-gray-400">Meses de despacho:</span> {opp.duracion_meses_est ?? '—'}</p>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800">Recuerda adjuntar el programa de despachos.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Necesita Piloto</label>
          <select value={etapaData['necesita_piloto'] ?? ''} onChange={ev => setEtapaData(d => ({...d, necesita_piloto: ev.target.value}))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
            <option value="">Seleccionar...</option>
            <option value="Si">Si</option>
            <option value="No">No</option>
          </select>
        </div>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Cierre</p>
        {ta('motivo_perdida','Motivo de pérdida (si aplica)','Solo relevante si la oportunidad se marca como Perdido')}

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Orden de Compra</p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PDF de la OC</label>
            <input type="file" accept=".pdf" onChange={ev => setOcFile(ev.target.files?.[0] ?? null)}
              className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:bg-gray-50 hover:file:bg-gray-100" />
            {cierre?.storage_oc_path && !ocFile && (
              <button type="button" onClick={() => openFile('archivo', cierre.storage_oc_path!)}
                className="text-xs text-crm-red hover:underline mt-1 flex items-center gap-1">
                <FileText size={12} /> Ver PDF cargado
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Número OC</label>
              <input value={ocForm.numero_oc} onChange={ev => setOcForm(f => ({...f, numero_oc: ev.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio despachos masivos</label>
              <input type="date" value={ocForm.fecha_oc} onChange={ev => setOcForm(f => ({...f, fecha_oc: ev.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Monto OC (CLP)</label>
            <MontoInput value={ocForm.monto_oc ? Number(ocForm.monto_oc) : null}
              onChange={v => setOcForm(f => ({...f, monto_oc: v != null ? String(v) : ''}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
          <button onClick={guardarOc} disabled={savingOc} className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
            {savingOc && <Loader2 size={14} className="animate-spin" />}{savingOc ? 'Guardando...' : 'Guardar OC'}
          </button>
        </div>
      </div>
    )
    return <p className="text-sm text-gray-400 text-center py-6">Sin campos para esta etapa</p>
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white flex flex-col shadow-2xl h-full overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-gray-400">{opp.codigo}</span>
                <span className={['text-xs px-2 py-0.5 rounded-full font-medium', TIPO_COLOR[opp.tipo_venta] ?? 'bg-gray-100 text-gray-600'].join(' ')}>{TIPO_VENTA_LABELS[opp.tipo_venta] ?? opp.tipo_venta}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600 border border-red-100">{opp.etapa_actual}</span>
              </div>
              <h2 className="text-base font-bold text-gray-800 leading-tight">{opp.nombre}</h2>
              {opp.cliente && <p className="text-xs text-gray-500 mt-0.5">{opp.cliente.razon_social}</p>}
              {opp.monto_estimado != null && (
                <p className="text-sm font-bold mt-1" style={{color:'#ed3224'}}>
                  {formatCLP(opp.monto_estimado)}
                  <span className="block text-[11px] font-normal text-gray-400">{formatMM(opp.monto_estimado)}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canAccess('Oportunidades', 'eliminar') && (
                <button onClick={eliminarOportunidad} disabled={saving} title="Eliminar oportunidad"
                  className="text-gray-400 hover:text-red-600 disabled:opacity-40"><Trash2 size={16} /></button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
          </div>
          {!isTerminal && currentIdx >= 0 && (
            <div className="mt-3 flex items-center gap-1">
              {etapas.map((e, i) => (
                <div key={e} className="flex-1 h-1.5 rounded-full" style={{background: i <= currentIdx ? '#ed3224' : '#e5e7eb'}} title={e} />
              ))}
            </div>
          )}
          {isTerminal && (
            <div className={['mt-2 text-xs font-medium px-2 py-1 rounded-full inline-block', opp.etapa_actual === 'Ganado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'].join(' ')}>
              {opp.etapa_actual === 'Ganado' ? '✓ Oportunidad ganada' : '✗ Oportunidad perdida'}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-200 flex-shrink-0">
          {([['general','General'],['etapa', isTerminal ? 'Datos' : opp.etapa_actual],['docs','Docs ('+docs.length+')'],['chat','Chat'],['historial','Historial']] as [Tab,string][]).map(([k,label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={['shrink-0 whitespace-nowrap text-xs font-medium py-2.5 border-b-2 transition-colors px-3 sm:flex-1 sm:shrink', tab===k ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'].join(' ')}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : tab === 'general' ? (
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input value={opp.nombre} onChange={e => setOpp(o => ({...o,nombre:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo venta</label>
                  <select value={opp.tipo_venta} onChange={e => setOpp(o => ({...o,tipo_venta:e.target.value as 'Proyecto'|'Producto'|'Kit'|'VIT'}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                    <option value="Proyecto">{TIPO_VENTA_LABELS.Proyecto}</option>
                    <option value="Producto">{TIPO_VENTA_LABELS.Producto}</option>
                    <option value="Kit">{TIPO_VENTA_LABELS.Kit}</option>
                    <option value="VIT">{TIPO_VENTA_LABELS.VIT}</option>
                  </select></div>
                {opp.tipo_venta !== 'VIT' && (
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha de presentación</label>
                    <input type="date" value={opp.fecha_cierre_est ?? ''} onChange={e => setOpp(o => ({...o,fecha_cierre_est:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Monto estimado (CLP)</label>
                  <MontoInput value={opp.monto_estimado} onChange={v => setOpp(o => ({...o,monto_estimado:v}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Probabilidad: {opp.probabilidad}%</label>
                  <input type="range" min="0" max="100" step="5" value={opp.probabilidad} onChange={e => setOpp(o => ({...o,probabilidad:Number(e.target.value)}))} className="w-full mt-2" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Descripcion</label>
                <textarea value={opp.descripcion ?? ''} onChange={e => setOpp(o => ({...o,descripcion:e.target.value||null}))} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red resize-none" /></div>

              {(opp.tipo_venta === 'Kit' || opp.tipo_venta === 'VIT') && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Entidad patrocinante</label>
                  <input value={opp.nombre_entidad_patrocinante ?? ''} onChange={e => setOpp(o => ({...o,nombre_entidad_patrocinante:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
              )}

              {opp.tipo_venta === 'VIT' && (
                <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Clasificación VIT</p>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Comité de Vivienda</label>
                    <input value={opp.nombre_comite_vivienda ?? ''} onChange={e => setOpp(o => ({...o,nombre_comite_vivienda:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Constructora</label>
                    <input value={opp.nombre_constructora ?? ''} onChange={e => setOpp(o => ({...o,nombre_constructora:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Zona Térmica</label>
                    <select value={opp.zona_termica ?? ''} onChange={e => setOpp(o => ({...o,zona_termica:(e.target.value || null) as ZonaTermicaVit | null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                      <option value="">Sin zona</option>
                      {ZONAS_TERMICAS.map(z => <option key={z} value={z}>{z}</option>)}
                    </select></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Valor UF (CLP)</label>
                    <MontoInput value={opp.valor_uf ?? null} onChange={v => setOpp(o => ({...o,valor_uf:v}))}
                      placeholder="ej. 39.500" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                </div>
              )}

              {tieneTipologias && (
                <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipos de casa</label>
                    <div className="space-y-2">
                      {lineas.map((l, idx) => (
                        <div key={l.id} className="flex gap-2 items-end">
                          {opp.tipo_venta === 'VIT' ? (
                            <select value={l.tipologia} onChange={e => actualizarLinea(idx, { tipologia: e.target.value })}
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                              <option value="">Sin tipología</option>
                              {tipologias.map(t => <option key={t.tipologia} value={t.tipologia}>{t.tipologia} ({t.venta_actual_uf} UF)</option>)}
                            </select>
                          ) : (
                            <input value={l.tipologia} onChange={e => actualizarLinea(idx, { tipologia: e.target.value })}
                              placeholder="Nombre del tipo de casa (ej. NOGAL BASE)"
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
                          )}
                          <input type="number" min="0" placeholder="Cantidad" value={l.cantidad_casas || ''}
                            onChange={e => actualizarLinea(idx, { cantidad_casas: e.target.value ? Number(e.target.value) : 0 })}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
                          <button type="button" onClick={() => quitarLinea(idx)} className="px-2 py-2 text-gray-400 hover:text-red-600"><X size={16} /></button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={agregarLinea} className="mt-1.5 text-xs font-medium text-crm-red hover:underline">+ Agregar tipo de casa</button>
                  </div>
                  {lineas.length > 0 && (
                    <div className="bg-white rounded-lg p-3 text-xs text-gray-600 space-y-0.5 border border-gray-200">
                      <p>Total Unidades: <span className="font-semibold text-gray-800">{lineas.reduce((s,l)=>s+(l.cantidad_casas||0),0)}</span></p>
                      {opp.tipo_venta === 'VIT' && <>
                        <p>Total UF: <span className="font-semibold text-gray-800">{lineas.reduce((s,l)=>s+(l.cantidad_casas||0)*precioLinea(l.tipologia),0).toLocaleString('es-CL')}</span></p>
                        <p>Total CLP: <span className="font-semibold text-gray-800">${(lineas.reduce((s,l)=>s+(l.cantidad_casas||0)*precioLinea(l.tipologia),0)*(opp.valor_uf||0)).toLocaleString('es-CL')}</span></p>
                      </>}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Región</label>
                  <select value={opp.region ?? ''} onChange={e => setOpp(o => ({...o,region:e.target.value||null,comuna:null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                    <option value="">Sin región</option>
                    {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Comuna</label>
                  <select value={opp.comuna ?? ''} onChange={e => setOpp(o => ({...o,comuna:e.target.value||null}))} disabled={!opp.region} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red disabled:bg-gray-50 disabled:text-gray-400">
                    <option value="">{opp.region ? 'Sin comuna' : 'Elige una región primero'}</option>
                    {comunasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Cantidad de casas</label>
                  <input type="number" min="0" value={opp.cantidad_casas ?? ''} onChange={e => setOpp(o => ({...o,cantidad_casas:e.target.value?Number(e.target.value):null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Cantidad de tipos de casas</label>
                  <input type="number" min="0" value={opp.cantidad_tipos_casas ?? ''} onChange={e => setOpp(o => ({...o,cantidad_tipos_casas:e.target.value?Number(e.target.value):null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
                  <p className="text-[11px] text-gray-400 mt-1">Define cuántos archivos Excel se piden en Costos y Presupuestos.</p></div>
              </div>

              {opp.tipo_venta !== 'VIT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha estimada adjudicación</label>
                    <input type="date" value={opp.fecha_adjudicacion_est ?? ''} onChange={e => setOpp(o => ({...o,fecha_adjudicacion_est:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha estimada inicio despachos</label>
                    <input type="date" value={opp.fecha_inicio_despachos_est ?? ''} onChange={e => setOpp(o => ({...o,fecha_inicio_despachos_est:e.target.value||null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>
                </div>
              )}

              <div><label className="block text-xs font-medium text-gray-600 mb-1">Duración estimada (meses)</label>
                <input type="number" min="0" value={opp.duracion_meses_est ?? ''} onChange={e => setOpp(o => ({...o,duracion_meses_est:e.target.value?Number(e.target.value):null}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" /></div>

              {opp.tipo_venta !== 'VIT' && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Familia de productos</label>
                  <div className="flex flex-wrap gap-3">
                    {FAMILIA_PRODUCTOS_OPCIONES.map(opcion => (
                      <label key={opcion} className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input type="checkbox" checked={(opp.familia_productos ?? []).includes(opcion)}
                          onChange={() => setOpp(o => { const cur = o.familia_productos ?? []; const next = cur.includes(opcion) ? cur.filter(v=>v!==opcion) : [...cur,opcion]; return {...o, familia_productos: next.length?next:null} })}
                          className="rounded border-gray-300 text-crm-red focus:ring-crm-red" />
                        {opcion}
                      </label>
                    ))}
                  </div></div>
              )}

              {opp.tipo_venta !== 'VIT' && (
                <div><label className="block text-xs font-medium text-gray-600 mb-1.5">Alcances</label>
                  <div className="flex flex-wrap gap-3">
                    {ALCANCES_OPCIONES.map(opcion => (
                      <label key={opcion} className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input type="checkbox" checked={(opp.alcances ?? []).includes(opcion)}
                          onChange={() => setOpp(o => { const cur = o.alcances ?? []; const next = cur.includes(opcion) ? cur.filter(v=>v!==opcion) : [...cur,opcion]; return {...o, alcances: next.length?next:null} })}
                          className="rounded border-gray-300 text-crm-red focus:ring-crm-red" />
                        {opcion}
                      </label>
                    ))}
                  </div></div>
              )}

              <button onClick={saveGeneral} disabled={saving} className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
                {saving && <Loader2 size={14} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          ) : tab === 'etapa' ? (
            <div className="space-y-4">
              {renderEtapaForm()}
              {opp.etapa_actual !== 'Clasificación' && opp.etapa_actual !== 'Ingeniería' && opp.etapa_actual !== 'Oportunidad' && (
                <button onClick={saveEtapaData} disabled={saving} className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
                  {saving && <Loader2 size={14} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar datos de etapa'}
                </button>
              )}

              {(opp.etapa_actual === 'Ingeniería' || opp.etapa_actual === 'Desarrollo') && (
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tareas de ingeniería</p>
                    {opp.etapa_actual === 'Ingeniería' && canAccess('Ingeniería', 'crear') && (
                      <button onClick={() => setShowCrearTarea(s => !s)} className="flex items-center gap-1 text-xs font-medium text-crm-red hover:underline">
                        <Plus size={12} /> Crear tarea
                      </button>
                    )}
                  </div>
                  {showCrearTarea && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <input value={nuevaTarea.titulo} onChange={e => setNuevaTarea(t=>({...t,titulo:e.target.value}))} placeholder="Título *" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                      <textarea value={nuevaTarea.descripcion} onChange={e => setNuevaTarea(t=>({...t,descripcion:e.target.value}))} placeholder="Descripción" rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900 resize-none" />
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Asignar a (múltiples ingenieros)</label>
                        <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 rounded p-1.5">
                          {filteredUsers.length === 0 ? <p className="text-xs text-gray-400 px-1">Sin usuarios disponibles</p> :
                          filteredUsers.map(u => (
                            <label key={u.id} className="flex items-center gap-1.5 text-xs text-gray-600 px-1 py-0.5">
                              <input type="checkbox" checked={nuevaTarea.asignados_ids.includes(u.id)}
                                onChange={() => setNuevaTarea(t => ({ ...t, asignados_ids: t.asignados_ids.includes(u.id) ? t.asignados_ids.filter(id=>id!==u.id) : [...t.asignados_ids, u.id] }))}
                                className="rounded border-gray-300 text-crm-red focus:ring-crm-red" />
                              {u.nombre} {u.apellido}
                            </label>
                          ))}
                        </div>
                      </div>
                      <input type="date" value={nuevaTarea.fecha_limite} onChange={e => setNuevaTarea(t=>({...t,fecha_limite:e.target.value}))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                      <button onClick={crearTarea} disabled={creandoTarea} className="px-3 py-1 text-xs text-white rounded disabled:opacity-60" style={{background:'#ed3224'}}>
                        {creandoTarea ? 'Creando...' : 'Crear'}
                      </button>
                    </div>
                  )}
                  {tareas.length === 0 ? <p className="text-xs text-gray-400 text-center py-2">Sin tareas</p> : (
                    <div className="space-y-1.5">
                      {tareas.map(t => {
                        const soyAsignado = t.asignados?.some(a => a.id === profile?.id) ?? false
                        const puedeResponder = opp.etapa_actual === 'Desarrollo' && soyAsignado && t.estado === 'pendiente'
                        return (
                        <div key={t.id} className="flex items-center justify-between gap-2 p-2 border border-gray-200 rounded-lg">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{t.titulo}</p>
                            <p className="text-xs text-gray-400">{t.asignados?.length ? t.asignados.map(a=>`${a.nombre} ${a.apellido}`).join(', ') : 'Sin asignar'}{t.fecha_limite ? ' · vence ' + new Date(t.fecha_limite).toLocaleDateString('es-CL') : ''}</p>
                          </div>
                          {puedeResponder ? (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => responderTarea(t.id, 'en_progreso')} className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Aceptar</button>
                              <button onClick={() => responderTarea(t.id, 'rechazada')} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200">Rechazar</button>
                            </div>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">{t.estado.replace(/_/g,' ')}</span>
                          )}
                        </div>
                      )})}
                    </div>
                  )}
                  <button onClick={saveEtapaData} disabled={saving} className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2" style={{background:'#ed3224'}}>
                    {saving && <Loader2 size={14} className="animate-spin" />}{saving ? 'Guardando...' : 'Guardar datos de etapa'}
                  </button>
                </div>
              )}
            </div>
          ) : tab === 'docs' ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{uploading ? 'Subiendo...' : 'Subir archivo'}
                </button>
                <button onClick={() => setShowLink(s => !s)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Link2 size={12} /> Agregar link
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={e => { if(e.target.files?.[0]) uploadFile(e.target.files[0]) }} />
              </div>
              {showLink && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <input value={linkNombre} onChange={e => setLinkNombre(e.target.value)} placeholder="Nombre (opcional)" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                  <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="URL https://..." className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                  <div className="flex gap-2">
                    <button onClick={addLink} className="px-3 py-1 text-xs text-white rounded" style={{background:'#ed3224'}}>Agregar</button>
                    <button onClick={() => {setShowLink(false);setLinkUrl('');setLinkNombre('')}} className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded">Cancelar</button>
                  </div>
                </div>
              )}
              {docs.length === 0 ? (
                <div className="text-center py-8 text-gray-400"><FileText size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Sin documentos</p></div>
              ) : docs.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <span className="text-lg">{d.tipo === 'link' ? '🔗' : getFileIcon(d.extension)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{d.nombre}</p>
                    <p className="text-xs text-gray-400">{d.etapa ?? 'General'}{d.tamanio_bytes ? ' · ' + (d.tamanio_bytes/1024).toFixed(0) + ' KB' : ''}</p>
                    <input defaultValue={d.comentario ?? ''} placeholder="Comentario..." onBlur={e => e.target.value !== (d.comentario ?? '') && saveComentarioDoc(d.id, e.target.value)}
                      className="mt-1 w-full px-1.5 py-1 border border-gray-100 rounded text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-crm-red" />
                  </div>
                  <button onClick={() => openFile(d.tipo, d.url)} className="text-gray-400 hover:text-blue-500 p-1"><ExternalLink size={13} /></button>
                  <button onClick={() => deleteDoc(d.id, d.tipo, d.url)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          ) : tab === 'chat' ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {mensajes.length === 0 ? (
                  <div className="text-center py-8 text-gray-400"><MessageCircle size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Sin mensajes</p></div>
                ) : mensajes.map(m => (
                  <div key={m.id} className={['max-w-[80%] rounded-lg px-3 py-1.5', m.usuario_id === profile?.id ? 'ml-auto bg-red-50' : 'bg-gray-100'].join(' ')}>
                    <p className="text-xs font-medium text-gray-600">{m.usuario ? `${(m.usuario as Profile).nombre} ${(m.usuario as Profile).apellido}` : 'Usuario'}</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.mensaje}</p>
                    <p className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-3 mt-2 border-t border-gray-200">
                <input value={nuevoMensaje} onChange={e => setNuevoMensaje(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') enviarMensaje() }}
                  placeholder="Escribe un mensaje..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
                <button onClick={enviarMensaje} className="px-3 py-2 text-white rounded-lg" style={{background:'#ed3224'}}><Send size={14} /></button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {historial.length === 0 ? <p className="text-center text-sm text-gray-400 py-8">Sin historial</p>
              : historial.map((h, i) => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {i < historial.length-1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                  </div>
                  <div className="pb-4 flex-1">
                    <p className="text-xs font-medium text-gray-700">{h.etapa}</p>
                    <p className="text-xs text-gray-400">{new Date(h.fecha_entrada).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'})}{h.fecha_salida && ' → ' + new Date(h.fecha_salida).toLocaleDateString('es-CL',{day:'2-digit',month:'short'}) + ' (' + diffDias(h.fecha_entrada) + 'd)'}</p>
                    {h.usuario && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><User size={10} />{(h.usuario as Profile).nombre} {(h.usuario as Profile).apellido}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isTerminal && (
          <div className="p-4 border-t border-gray-200 flex-shrink-0 flex gap-2">
            {canGoBack && (
              <button onClick={retrocederEtapa} disabled={saving || !canManageStage} title={!canManageStage ? 'Tu rol no gestiona esta etapa' : undefined}
                className="px-3 py-2 flex items-center justify-center gap-1 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                <ChevronRight size={14} className="rotate-180" />
                Retroceder
              </button>
            )}
            <button onClick={avanzarEtapa} disabled={saving || !canManageStage} title={!canManageStage ? 'Tu rol no gestiona esta etapa' : undefined}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60" style={{background:'#ed3224'}}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              {saving ? 'Avanzando...' : 'Avanzar a ' + nextEtapa}
            </button>
            {opp.etapa_actual !== 'Ingeniería' && (
              <>
                <button onClick={() => marcarEstado('Ganado')} disabled={saving} className="px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">Ganado</button>
                <button onClick={() => marcarEstado('Perdido')} disabled={saving} className="px-3 py-2 text-xs font-medium bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-60">Perdido</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

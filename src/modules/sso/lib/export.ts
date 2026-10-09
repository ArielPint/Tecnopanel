import { cargarJsPDF, cargarXLSX, type JsPDF, type XLSXLib } from '@/lib/cargarLibrerias'
import { ESTADO_META, fmtFecha, fmtFechaHora } from './estados'
import { fechaCierreChile, PERIODOS, type Indicadores, type Periodo } from './indicadores'
import { getSignedUrls } from '../services/storage'
import type { EventoBitacora, Evidencia, Hallazgo } from './tipos'

// Requisito 14: Excel con xlsx y PDF con jspdf, los dos ya instalados (se descargan al exportar).

type Nombre = (id: string | null | undefined) => string

/** 'YYYY-MM-DD' -> número de serie de Excel (días desde 1899-12-30), para que sea una fecha real,
 *  filtrable y ordenable. No se pasa por Date: SheetJS lo convierte con la zona horaria del
 *  navegador y corría las fechas un día (probado: 21-09 salía 20-09). */
function fechaExcel(f: string | null | undefined): number | null {
  if (!f) return null
  return (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function hojaConAnchos(XLSX: XLSXLib, filas: Record<string, unknown>[], anchos: number[], columnasFecha: string[] = []) {
  const hoja = XLSX.utils.json_to_sheet(filas)
  hoja['!cols'] = anchos.map((wch) => ({ wch }))
  const encabezados = filas.length ? Object.keys(filas[0]) : []
  for (const nombre of columnasFecha) {
    const c = encabezados.indexOf(nombre)
    for (let r = 1; c >= 0 && r <= filas.length; r++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })]
      if (celda && typeof celda.v === 'number') celda.z = 'dd-mm-yyyy'
    }
  }
  return hoja
}

function sello() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

export async function exportarHallazgosExcel(hallazgos: Hallazgo[], nombreUsuario: Nombre, nombreArea: Nombre) {
  const XLSX = await cargarXLSX()
  const filas = hallazgos.map((h) => ({
    'N°': h.numero,
    Estado: ESTADO_META[h.estado].label,
    Área: nombreArea(h.area_id),
    Ubicación: h.ubicacion,
    Descripción: h.descripcion,
    'Fecha detección': fechaExcel(h.fecha_deteccion),
    'Reportado por': nombreUsuario(h.reportado_por),
    Responsable: nombreUsuario(h.responsable_user_id),
    'Plazo de cumplimiento': fechaExcel(h.fecha_compromiso),
    Vencido: h.vencido ? 'Sí' : 'No',
    'Días de atraso': h.dias_atraso,
    'Acción correctiva': h.accion_correctiva ?? '',
    'Fecha cierre': fechaExcel(fechaCierreChile(h)),
    'Cerrado por': h.cerrado_por ? nombreUsuario(h.cerrado_por) : '',
    'Cierre en plazo': h.estado === 'cerrado' ? (h.cerrado_en_plazo ? 'Sí' : 'No') : '',
  }))
  const libro = XLSX.utils.book_new()
  const hoja = hojaConAnchos(XLSX, filas, [6, 22, 22, 24, 50, 12, 22, 22, 12, 8, 8, 50, 12, 22, 10], [
    'Fecha detección',
    'Plazo de cumplimiento',
    'Fecha cierre',
  ])
  XLSX.utils.book_append_sheet(libro, hoja, 'Hallazgos')
  XLSX.writeFile(libro, `prevencion-hallazgos-${sello()}.xlsx`)
}

function textoPeriodo(periodo: Periodo, ind: Indicadores) {
  return `${PERIODOS.find((p) => p.key === periodo)?.label ?? ''} (${fmtFecha(ind.desde)} al ${fmtFecha(ind.hasta)})`
}

export async function exportarIndicadoresExcel(ind: Indicadores, periodo: Periodo, area: string) {
  const XLSX = await cargarXLSX()
  const libro = XLSX.utils.book_new()
  const resumen = [
    { Indicador: 'Período', Valor: textoPeriodo(periodo, ind) },
    { Indicador: 'Área', Valor: area },
    { Indicador: 'Pendientes hoy', Valor: ind.pendientes },
    { Indicador: '  Abiertos', Valor: ind.porEstado.abierto },
    { Indicador: '  En proceso', Valor: ind.porEstado.en_proceso },
    { Indicador: '  Pendientes de verificación', Valor: ind.porEstado.pend_verificacion },
    { Indicador: 'Vencidos hoy', Valor: ind.vencidos },
    { Indicador: 'Reportados en el período', Valor: ind.reportados },
    { Indicador: 'Cerrados en el período', Valor: ind.cerrados },
    { Indicador: 'Cerrados en plazo', Valor: ind.cerradosEnPlazo },
    { Indicador: '% cumplimiento de plazo', Valor: ind.pctEnPlazo === null ? '—' : `${ind.pctEnPlazo}%` },
    { Indicador: 'Días promedio de cierre', Valor: ind.diasPromedioCierre ?? '—' },
  ]
  XLSX.utils.book_append_sheet(libro, hojaConAnchos(XLSX, resumen, [32, 40]), 'Resumen')
  const porArea = ind.porArea.map((a) => ({
    Área: a.area,
    'Reportados en el período': a.reportados,
    'Pendientes hoy': a.pendientes,
    'Vencidos hoy': a.vencidos,
    'Cerrados en el período': a.cerrados,
    'Cerrados en plazo': a.cerradosEnPlazo,
    '% en plazo': a.pctEnPlazo === null ? '' : a.pctEnPlazo / 100,
  }))
  const hojaArea = hojaConAnchos(XLSX, porArea, [28, 12, 12, 12, 12, 12, 10])
  // la última columna como porcentaje real, no como texto
  for (let r = 1; r <= porArea.length; r++) {
    const celda = hojaArea[XLSX.utils.encode_cell({ r, c: 6 })]
    if (celda && typeof celda.v === 'number') celda.z = '0%'
  }
  XLSX.utils.book_append_sheet(libro, hojaArea, 'Por área')
  const mensual = ind.tendencia.map((t) => ({ Mes: t.label, Reportados: t.reportados, Cerrados: t.cerrados }))
  XLSX.utils.book_append_sheet(libro, hojaConAnchos(XLSX, mensual, [10, 12, 12]), 'Mensual')
  XLSX.writeFile(libro, `prevencion-indicadores-${sello()}.xlsx`)
}

// ---------------------------------------------------------------- PDF

const MARGEN = 15
const ANCHO = 180
const ALTO_UTIL = 280

class Pdf {
  doc: JsPDF
  y = MARGEN

  constructor(Documento: new () => JsPDF) {
    this.doc = new Documento()
  }

  espacio(alto: number) {
    if (this.y + alto > ALTO_UTIL) {
      this.doc.addPage()
      this.y = MARGEN + 5
    }
  }

  titulo(texto: string, subtitulo: string) {
    this.doc.setFont('helvetica', 'bold').setFontSize(14).text(texto, MARGEN, this.y + 4)
    this.doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(subtitulo, MARGEN, this.y + 10)
    this.doc.setTextColor(0)
    this.y += 18
  }

  seccion(texto: string) {
    this.y += 3
    this.espacio(12)
    this.doc.setFont('helvetica', 'bold').setFontSize(10).text(texto.toUpperCase(), MARGEN, this.y)
    this.doc.setDrawColor(200).line(MARGEN, this.y + 1.5, MARGEN + ANCHO, this.y + 1.5)
    this.y += 7
  }

  parrafo(texto: string, opciones: { negrita?: boolean; tamano?: number } = {}) {
    const tamano = opciones.tamano ?? 9
    this.doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal').setFontSize(tamano)
    const lineas = this.doc.splitTextToSize(texto || '—', ANCHO) as string[]
    for (const l of lineas) {
      this.espacio(5)
      this.doc.text(l, MARGEN, this.y)
      this.y += tamano * 0.45
    }
    this.y += 1.5
  }

  /** Pares etiqueta/valor en dos columnas. */
  datos(pares: [string, string][]) {
    const col = ANCHO / 2
    for (let i = 0; i < pares.length; i += 2) {
      this.espacio(11)
      for (let j = 0; j < 2 && i + j < pares.length; j++) {
        const [etq, val] = pares[i + j]
        const x = MARGEN + j * col
        this.doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(110).text(etq.toUpperCase(), x, this.y)
        this.doc.setFontSize(9).setTextColor(0).text(this.doc.splitTextToSize(val || '—', col - 4)[0] as string, x, this.y + 4.5)
      }
      this.y += 11
    }
  }

  tabla(encabezados: string[], anchos: number[], filas: (string | number)[][]) {
    const fila = (celdas: (string | number)[], negrita: boolean) => {
      this.espacio(7)
      let x = MARGEN
      this.doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(8)
      celdas.forEach((c, i) => {
        const texto = this.doc.splitTextToSize(String(c), anchos[i] - 2)[0] as string
        // números a la derecha, texto a la izquierda
        if (typeof c === 'number' || i > 0) this.doc.text(texto, x + anchos[i] - 1, this.y, { align: 'right' })
        else this.doc.text(texto, x + 1, this.y)
        x += anchos[i]
      })
      this.y += 5.5
    }
    this.doc.setFillColor(240, 240, 242).rect(MARGEN, this.y - 4, ANCHO, 6, 'F')
    fila(encabezados, true)
    for (const f of filas) fila(f, false)
    this.y += 3
  }

  async fotos(evidencias: Evidencia[]) {
    if (evidencias.length === 0) {
      this.parrafo('Sin fotos.')
      return
    }
    const urls = await getSignedUrls(evidencias.map((e) => e.path), 600)
    const ancho = (ANCHO - 6) / 2
    const altoMax = 65
    let col = 0
    let altoFila = 0
    for (const e of evidencias) {
      const url = urls[e.path]
      if (!url) continue
      try {
        const dataUrl = await aDataUrl(url)
        const props = this.doc.getImageProperties(dataUrl)
        const escala = Math.min(ancho / props.width, altoMax / props.height)
        const w = props.width * escala
        const h = props.height * escala
        if (col === 0) this.espacio(h + 4)
        this.doc.addImage(dataUrl, 'JPEG', MARGEN + col * (ancho + 6), this.y, w, h)
        altoFila = Math.max(altoFila, h)
        col++
        if (col === 2) {
          this.y += altoFila + 4
          col = 0
          altoFila = 0
        }
      } catch {
        // una foto que no se pudo bajar no impide generar la ficha
      }
    }
    if (col !== 0) this.y += altoFila + 4
  }

  guardar(nombre: string) {
    const paginas = this.doc.getNumberOfPages()
    for (let p = 1; p <= paginas; p++) {
      this.doc.setPage(p)
      this.doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(140)
      this.doc.text(`Tecnopanel · Prevención de Riesgos · generado ${fmtFechaHora(new Date().toISOString())}`, MARGEN, 290)
      this.doc.text(`${p} / ${paginas}`, MARGEN + ANCHO, 290, { align: 'right' })
    }
    this.doc.save(nombre)
  }
}

async function aDataUrl(url: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const blob = await resp.blob()
  return await new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(lector.result as string)
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(blob)
  })
}

function describirEvento(e: EventoBitacora): string {
  switch (e.evento) {
    case 'creado':
      return 'Reportó el hallazgo'
    case 'estado':
      return `Estado: ${e.estado_anterior ? ESTADO_META[e.estado_anterior].label : '—'} a ${e.estado_nuevo ? ESTADO_META[e.estado_nuevo].label : '—'}`
    case 'responsable':
      return 'Cambió el responsable'
    case 'plazo':
      return 'Cambió el plazo'
    case 'accion_correctiva':
      return 'Registró la acción correctiva'
    case 'evidencia':
      return 'Agregó una foto'
    case 'comentario':
      return 'Comentó'
  }
}

/** Ficha del hallazgo con sus fotos y la bitácora completa, para auditoría o para imprimir. */
export async function exportarFichaPdf(h: Hallazgo, evidencias: Evidencia[], bitacora: EventoBitacora[], nombreUsuario: Nombre, nombreArea: Nombre) {
  const pdf = new Pdf(await cargarJsPDF())
  pdf.titulo(`Hallazgo N° ${h.numero} · ${ESTADO_META[h.estado].label}`, 'Ficha de no conformidad · Seguridad y Salud Ocupacional')

  pdf.datos([
    ['Área', nombreArea(h.area_id)],
    ['Ubicación', h.ubicacion],
    ['Detectado', `${fmtFecha(h.fecha_deteccion)} por ${nombreUsuario(h.reportado_por)}`],
    ['Responsable', nombreUsuario(h.responsable_user_id)],
    ['Plazo de cumplimiento', fmtFecha(h.fecha_compromiso)],
    [
      'Situación del plazo',
      h.estado === 'cerrado'
        ? h.cerrado_en_plazo
          ? 'Cerrado en plazo'
          : `Cerrado fuera de plazo (${h.dias_atraso} días)`
        : h.vencido
          ? `Vencido hace ${h.dias_atraso} días`
          : 'Dentro de plazo',
    ],
    ...(h.estado === 'cerrado' ? ([['Cierre', `${fmtFechaHora(h.fecha_cierre)} por ${nombreUsuario(h.cerrado_por)}`]] as [string, string][]) : []),
  ])

  pdf.seccion('Descripción de la condición')
  pdf.parrafo(h.descripcion)
  pdf.seccion('Fotos de la condición detectada')
  await pdf.fotos(evidencias.filter((e) => e.tipo === 'deteccion'))
  pdf.seccion('Acción correctiva')
  pdf.parrafo(h.accion_correctiva ?? 'Sin registrar.')
  pdf.seccion('Fotos de la corrección')
  await pdf.fotos(evidencias.filter((e) => e.tipo === 'cierre'))

  pdf.seccion('Bitácora')
  for (const e of bitacora) {
    pdf.parrafo(`${fmtFechaHora(e.created_at)} · ${nombreUsuario(e.user_id)} · ${describirEvento(e)}`, { negrita: true, tamano: 8 })
    if (e.comentario && e.evento !== 'creado') pdf.parrafo(e.comentario, { tamano: 8 })
  }

  pdf.guardar(`prevencion-hallazgo-${h.numero}.pdf`)
}

export async function exportarIndicadoresPdf(ind: Indicadores, periodo: Periodo, area: string) {
  const pdf = new Pdf(await cargarJsPDF())
  pdf.titulo('Indicadores de Prevención de Riesgos', `${textoPeriodo(periodo, ind)} · Área: ${area}`)

  pdf.seccion('Resumen')
  pdf.datos([
    ['Pendientes hoy', String(ind.pendientes)],
    ['Vencidos hoy', String(ind.vencidos)],
    ['Abiertos / en proceso / en verificación', `${ind.porEstado.abierto} / ${ind.porEstado.en_proceso} / ${ind.porEstado.pend_verificacion}`],
    ['Reportados en el período', String(ind.reportados)],
    ['Cerrados en el período', String(ind.cerrados)],
    ['% cumplimiento de plazo', ind.pctEnPlazo === null ? '—' : `${ind.pctEnPlazo}% (${ind.cerradosEnPlazo} de ${ind.cerrados})`],
    ['Días promedio de cierre', ind.diasPromedioCierre === null ? '—' : String(ind.diasPromedioCierre).replace('.', ',')],
  ])

  pdf.seccion('Por área')
  pdf.tabla(
    ['Área', 'Reportados', 'Pendientes', 'Vencidos', 'Cerrados', '% en plazo'],
    [60, 24, 24, 24, 24, 24],
    ind.porArea.map((a) => [a.area, a.reportados, a.pendientes, a.vencidos, a.cerrados, a.pctEnPlazo === null ? '—' : `${a.pctEnPlazo}%`]),
  )

  pdf.seccion('Tendencia mensual')
  pdf.tabla(
    ['Mes', 'Reportados', 'Cerrados'],
    [60, 30, 30],
    ind.tendencia.map((t) => [t.label, t.reportados, t.cerrados]),
  )

  pdf.guardar(`prevencion-indicadores-${sello()}.pdf`)
}

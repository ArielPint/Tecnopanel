// pptxgenjs pesa ~600 kB: se carga solo al apretar el botón de exportar.
import type pptxgen from 'pptxgenjs'
import { INST, INST_GRISES } from './coloresInstitucionales'

// Exporta el dashboard Ejecutivo a PowerPoint con objetos NATIVOS y editables:
// los gráficos son charts de Office (se abre "Editar datos" y se cambian colores,
// tipo y series), los títulos son cuadros de texto y los KPI son formas + texto.
// No se pegan imágenes: nada queda plano.
//
// Son dos láminas fijas: "Indicadores y avance económico" (KPI + 2 gráficos) y
// "Producción" (4 gráficos en cuadrícula 2x2 + la dotación como línea de texto).

const hex = (c: string) => c.replace('#', '')

export interface SeriePpt {
  name: string
  values: (number | null)[]
  color?: string
}

export interface GraficoPpt {
  titulo: string
  labels: string[]
  barras: SeriePpt[]
  // Sin líneas el gráfico sale de barras puro; con líneas, combo barra + línea.
  lineas?: SeriePpt[]
  sufijo?: '%'
}

interface Caja {
  x: number
  y: number
  w: number
  h: number
}

// Lámina 16:9 = 10 x 5.63 pulgadas.
const LAMINA1_CHARTS: Caja[] = [
  { x: 0.35, y: 2.25, w: 4.4, h: 3.1 },
  { x: 5.25, y: 2.25, w: 4.4, h: 3.1 },
]
const LAMINA2_CHARTS: Caja[] = [
  { x: 0.35, y: 1.5, w: 4.4, h: 1.8 },
  { x: 5.25, y: 1.5, w: 4.4, h: 1.8 },
  { x: 0.35, y: 3.55, w: 4.4, h: 1.8 },
  { x: 5.25, y: 3.55, w: 4.4, h: 1.8 },
]

function cabecera(slide: pptxgen.Slide, titulo: string, corteLbl: string) {
  slide.addText(titulo, { x: 0.35, y: 0.18, w: 9.3, h: 0.42, fontSize: 18, bold: true, color: hex(INST.plomo), fontFace: 'Arial' })
  slide.addShape('rect', { x: 0.35, y: 0.6, w: 1.2, h: 0.035, fill: { color: hex(INST.rojo) }, line: { color: hex(INST.rojo) } })
  slide.addText(corteLbl, { x: 0.35, y: 0.63, w: 9.3, h: 0.24, fontSize: 10, color: hex(INST.gris), fontFace: 'Arial' })
}

function opcionesChart(caja: Caja, labels: string[], colores: string[], sufijo?: '%') {
  return {
    ...caja,
    barDir: 'col' as const,
    barGapWidthPct: 60,
    chartColors: colores.map(hex),
    showValue: true,
    dataLabelFontSize: 8,
    dataLabelFontFace: 'Arial',
    dataLabelFormatCode: sufijo === '%' ? '0.0"%"' : '#,##0',
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLabelRotate: labels.length > 8 ? -35 : 0,
    showLegend: true,
    legendPos: 'b' as const,
    legendFontSize: 8,
    valGridLine: { style: 'solid' as const, color: hex(INST.grisClaro), size: 1 },
    catAxisLineShow: false,
    border: { pt: 0, color: 'FFFFFF' },
  }
}

function grafico(pptx: pptxgen, slide: pptxgen.Slide, g: GraficoPpt, caja: Caja) {
  slide.addText(g.titulo.toUpperCase(), {
    x: caja.x, y: caja.y - 0.26, w: caja.w, h: 0.24,
    fontSize: 9, bold: true, color: hex(INST.plomo), fontFace: 'Arial',
  })

  const colBarras = g.barras.map((s, i) => s.color ?? (i === 0 ? INST.rojo : INST_GRISES[(i - 1) % INST_GRISES.length]))
  // pptxgenjs tipa values como number[], pero en runtime acepta null y lo deja
  // como hueco en la serie (que es justo lo que queremos para los meses sin dato).
  const barras = g.barras.map((s) => ({ name: s.name, labels: g.labels, values: s.values as number[] }))

  if (!g.lineas?.length) {
    slide.addChart(pptx.ChartType.bar, barras, opcionesChart(caja, g.labels, colBarras, g.sufijo))
    return
  }

  const colLineas = g.lineas.map((s, i) => s.color ?? INST_GRISES[i % INST_GRISES.length])
  const lineas = g.lineas.map((s) => ({ name: s.name, labels: g.labels, values: s.values as number[] }))
  // En charts multi-tipo pptxgenjs toma el 2º argumento como opciones
  // (addChartDefinition: `tmpOpt = data || opt`), pero los tipos declaran `data`.
  const addChartMulti = slide.addChart.bind(slide) as unknown as (tipos: pptxgen.IChartMulti[], opciones: unknown) => void
  addChartMulti(
    [
      { type: pptx.ChartType.bar, data: barras, options: { chartColors: colBarras.map(hex), barGapWidthPct: 60 } },
      { type: pptx.ChartType.line, data: lineas, options: { chartColors: colLineas.map(hex), lineSize: 2.5, lineDataSymbolSize: 5 } },
    ],
    opcionesChart(caja, g.labels, [...colBarras, ...colLineas], g.sufijo),
  )
}

function tarjetasKpi(slide: pptxgen.Slide, kpis: { label: string; value: string }[]) {
  const w = 1.28
  const gap = 0.08
  kpis.slice(0, 7).forEach((kpi, i) => {
    const x = 0.35 + i * (w + gap)
    slide.addShape('roundRect', {
      x, y: 0.95, w, h: 0.9,
      rectRadius: 0.06,
      fill: { color: 'FFFFFF' },
      line: { color: hex(INST.grisClaro), width: 1 },
    })
    slide.addText(kpi.label.toUpperCase(), {
      x: x + 0.07, y: 1.0, w: w - 0.14, h: 0.32,
      fontSize: 6.5, bold: true, color: hex(INST.gris), fontFace: 'Arial', valign: 'top',
    })
    slide.addText(kpi.value, {
      x: x + 0.07, y: 1.32, w: w - 0.14, h: 0.45,
      fontSize: 13, bold: true, color: hex(INST.rojo), fontFace: 'Arial', valign: 'middle',
    })
  })
}

export async function exportarPptEjecutivo({
  proyecto,
  corteLbl,
  kpis,
  avance,
  produccion,
  nota,
}: {
  proyecto: string
  corteLbl: string
  kpis: { label: string; value: string }[]
  /** Lámina 1: hasta 2 gráficos bajo los KPI. */
  avance: GraficoPpt[]
  /** Lámina 2: hasta 4 gráficos en cuadrícula 2x2. */
  produccion: GraficoPpt[]
  /** Línea de texto al pie del título de la lámina 2 (dotación). */
  nota?: string
}) {
  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Tecnopanel'
  pptx.company = 'Tecnopanel'
  pptx.title = `Dashboard Ejecutivo — ${proyecto}`

  const lam1 = pptx.addSlide()
  cabecera(lam1, `Dashboard Ejecutivo · ${proyecto}`, corteLbl)
  tarjetasKpi(lam1, kpis)
  avance.slice(0, LAMINA1_CHARTS.length).forEach((g, i) => grafico(pptx, lam1, g, LAMINA1_CHARTS[i]))

  const lam2 = pptx.addSlide()
  cabecera(lam2, `Producción · ${proyecto}`, corteLbl)
  if (nota) {
    lam2.addText(nota, { x: 0.35, y: 0.87, w: 9.3, h: 0.22, fontSize: 8, color: hex(INST.plomo), fontFace: 'Arial' })
  }
  produccion.slice(0, LAMINA2_CHARTS.length).forEach((g, i) => grafico(pptx, lam2, g, LAMINA2_CHARTS[i]))

  const stamp = new Date().toISOString().slice(0, 10)
  await pptx.writeFile({ fileName: `Dashboard_Ejecutivo_${proyecto.replace(/\s+/g, '_')}_${stamp}.pptx` })
}

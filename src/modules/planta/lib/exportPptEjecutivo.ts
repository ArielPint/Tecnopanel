// pptxgenjs pesa ~600 kB: se carga solo al apretar el botón de exportar.
import type pptxgen from 'pptxgenjs'
import { INST, INST_GRISES } from './coloresInstitucionales'

// Exporta el dashboard Ejecutivo a PowerPoint con objetos NATIVOS y editables:
// los gráficos son charts de Office (se abre "Editar datos" y se cambian colores,
// tipo y series), los títulos son cuadros de texto y los KPI son formas + texto.
// No se pegan imágenes: nada queda plano.

const hex = (c: string) => c.replace('#', '')

export interface SerieLamina {
  name: string
  values: (number | null)[]
  color?: string
}

export type LaminaPpt =
  | { tipo: 'kpis'; titulo: string; items: { label: string; value: string }[] }
  | {
      tipo: 'barras'
      titulo: string
      labels: string[]
      series: SerieLamina[]
      sufijo?: string
      nota?: string
    }
  | {
      tipo: 'combo'
      titulo: string
      labels: string[]
      barras: SerieLamina[]
      lineas: SerieLamina[]
      sufijo?: string
      nota?: string
    }

const TITULO = { x: 0.4, y: 0.28, w: 9.2, h: 0.5 } as const
const CUERPO = { x: 0.45, y: 1.0, w: 9.1, h: 4.0 } as const

function tituloLamina(slide: pptxgen.Slide, texto: string, subtitulo: string) {
  slide.addText(texto, { ...TITULO, fontSize: 20, bold: true, color: hex(INST.plomo), fontFace: 'Arial' })
  slide.addText(subtitulo, { x: TITULO.x, y: 0.78, w: TITULO.w, h: 0.28, fontSize: 11, color: hex(INST.gris), fontFace: 'Arial' })
  slide.addShape('rect', { x: TITULO.x, y: 0.74, w: 1.2, h: 0.04, fill: { color: hex(INST.rojo) }, line: { color: hex(INST.rojo) } })
}

function opcionesChart(labels: string[], colores: string[], sufijo?: string) {
  return {
    ...CUERPO,
    barDir: 'col' as const,
    barGapWidthPct: 60,
    chartColors: colores.map(hex),
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelFontFace: 'Arial',
    dataLabelFormatCode: sufijo === '%' ? '0.0"%"' : '#,##0',
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 10,
    catAxisLabelRotate: labels.length > 8 ? -35 : 0,
    showLegend: true,
    legendPos: 'b' as const,
    legendFontSize: 10,
    valGridLine: { style: 'solid' as const, color: hex(INST.grisClaro), size: 1 },
    catAxisLineShow: false,
    border: { pt: 0, color: 'FFFFFF' },
  }
}

function laminaKpis(pptx: pptxgen, lam: Extract<LaminaPpt, { tipo: 'kpis' }>, subtitulo: string) {
  const slide = pptx.addSlide()
  tituloLamina(slide, lam.titulo, subtitulo)
  const porFila = 4
  const w = 2.15
  const h = 1.15
  lam.items.forEach((kpi, i) => {
    const x = 0.45 + (i % porFila) * (w + 0.2)
    const y = 1.15 + Math.floor(i / porFila) * (h + 0.25)
    slide.addShape('roundRect', {
      x, y, w, h,
      rectRadius: 0.08,
      fill: { color: 'FFFFFF' },
      line: { color: hex(INST.grisClaro), width: 1 },
    })
    slide.addText(kpi.label.toUpperCase(), {
      x: x + 0.12, y: y + 0.12, w: w - 0.24, h: 0.4,
      fontSize: 9, bold: true, color: hex(INST.gris), fontFace: 'Arial', valign: 'top',
    })
    slide.addText(kpi.value, {
      x: x + 0.12, y: y + 0.5, w: w - 0.24, h: 0.5,
      fontSize: 18, bold: true, color: hex(INST.rojo), fontFace: 'Arial', valign: 'middle',
    })
  })
}

function laminaGrafico(pptx: pptxgen, lam: Extract<LaminaPpt, { tipo: 'barras' | 'combo' }>, subtitulo: string) {
  const slide = pptx.addSlide()
  tituloLamina(slide, lam.titulo, subtitulo)

  if (lam.tipo === 'barras') {
    const colores = lam.series.map((s, i) => s.color ?? (i === 0 ? INST.rojo : INST_GRISES[(i - 1) % INST_GRISES.length]))
    slide.addChart(
      pptx.ChartType.bar,
      lam.series.map((s) => ({ name: s.name, labels: lam.labels, values: s.values as number[] })),
      opcionesChart(lam.labels, colores, lam.sufijo),
    )
  } else {
    // pptxgenjs tipa values como number[], pero en runtime acepta null y lo deja
    // como hueco en la serie (que es justo lo que queremos para los meses sin dato).
    const barras = lam.barras.map((s) => ({ name: s.name, labels: lam.labels, values: s.values as number[] }))
    const lineas = lam.lineas.map((s) => ({ name: s.name, labels: lam.labels, values: s.values as number[] }))
    const colBarras = lam.barras.map((s) => s.color ?? INST.rojo)
    const colLineas = lam.lineas.map((s, i) => s.color ?? INST_GRISES[i % INST_GRISES.length])
    // En charts multi-tipo pptxgenjs toma el 2º argumento como opciones
    // (addChartDefinition: `tmpOpt = data || opt`), pero los tipos declaran `data`.
    const addChartMulti = slide.addChart.bind(slide) as unknown as (tipos: pptxgen.IChartMulti[], opciones: unknown) => void
    addChartMulti(
      [
        { type: pptx.ChartType.bar, data: barras, options: { chartColors: colBarras.map(hex), barGapWidthPct: 60 } },
        { type: pptx.ChartType.line, data: lineas, options: { chartColors: colLineas.map(hex), lineSize: 2.5, lineDataSymbolSize: 6 } },
      ],
      opcionesChart(lam.labels, [...colBarras, ...colLineas], lam.sufijo),
    )
  }

  if (lam.nota) {
    slide.addText(lam.nota, { x: CUERPO.x, y: 5.05, w: CUERPO.w, h: 0.3, fontSize: 9, italic: true, color: hex(INST.gris), fontFace: 'Arial' })
  }
}

export async function exportarPptEjecutivo({
  proyecto,
  corteLbl,
  laminas,
}: {
  proyecto: string
  corteLbl: string
  laminas: LaminaPpt[]
}) {
  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Tecnopanel'
  pptx.company = 'Tecnopanel'
  pptx.title = `Dashboard Ejecutivo — ${proyecto}`

  // Portada
  const portada = pptx.addSlide()
  portada.addShape('rect', { x: 0, y: 0, w: 10, h: 1.55, fill: { color: hex(INST.rojo) }, line: { color: hex(INST.rojo) } })
  portada.addText('Dashboard Ejecutivo', { x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Arial' })
  portada.addText(proyecto, { x: 0.5, y: 0.95, w: 9, h: 0.4, fontSize: 16, color: 'FFFFFF', fontFace: 'Arial' })
  portada.addText(corteLbl, { x: 0.5, y: 1.85, w: 9, h: 0.4, fontSize: 13, bold: true, color: hex(INST.plomo), fontFace: 'Arial' })
  portada.addText(
    laminas.map((l) => `• ${l.titulo}`).join('\n'),
    { x: 0.5, y: 2.35, w: 9, h: 2.6, fontSize: 12, color: hex(INST.gris), fontFace: 'Arial', lineSpacingMultiple: 1.3 },
  )

  for (const lam of laminas) {
    if (lam.tipo === 'kpis') laminaKpis(pptx, lam, corteLbl)
    else laminaGrafico(pptx, lam, corteLbl)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  await pptx.writeFile({ fileName: `Dashboard_Ejecutivo_${proyecto.replace(/\s+/g, '_')}_${stamp}.pptx` })
}

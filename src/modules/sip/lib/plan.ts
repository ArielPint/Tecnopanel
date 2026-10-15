import type { LineaCorteV, LineaV, PlanFila } from './api'
import { inicioSemana } from './formato'

// Plan semanal contra lo registrado. La semana va de lunes a domingo (inicioSemana). Lo real del
// pegado son los paneles buenos fabricados; el del corte, los cortados (los rechazados no cuentan).
// En pesos: paneles × valor de venta por panel del proyecto (pnl_sap_ventas_v.valor_panel); lo que
// no tiene proyecto SAP, o cuyo proyecto no tiene OV de panel SIP, queda en $0.

export type Unidad = 'paneles' | 'm2' | 'pesos'

export interface Medida {
  paneles: number
  m2: number
  pesos: number
}

export interface Comparacion {
  pegadoPlan: Medida
  pegadoReal: Medida
  cortePlan: Medida
  corteReal: Medida
}

export interface FilaPanel {
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  c: Comparacion
}

export interface FilaProyecto {
  /** '' = producción sin proyecto SAP */
  codigo: string
  nombre: string
  /** sin valor de venta por panel (no tiene OV de panel SIP en SAP) */
  sinValor: boolean
  c: Comparacion
  paneles: FilaPanel[]
}

const medida = (): Medida => ({ paneles: 0, m2: 0, pesos: 0 })
export const comparacionVacia = (): Comparacion => ({ pegadoPlan: medida(), pegadoReal: medida(), cortePlan: medida(), corteReal: medida() })

function sumar(m: Medida, paneles: number, m2Panel: number, valorPanel: number) {
  m.paneles += paneles
  m.m2 += paneles * m2Panel
  m.pesos += paneles * valorPanel
}

export const valorDe = (m: Medida, u: Unidad) => (u === 'paneles' ? m.paneles : u === 'm2' ? m.m2 : m.pesos)

/** Real / plan; null si no hay plan */
export const cumplimiento = (real: number, plan: number) => (plan > 0 ? real / plan : null)

export function compararPlan({
  plan,
  lineas,
  cortes,
  valorPanel,
}: {
  plan: PlanFila[]
  lineas: LineaV[]
  cortes: LineaCorteV[]
  /** valor de venta por panel, por código de proyecto SAP */
  valorPanel: Map<string, number>
}) {
  const total = comparacionVacia()
  const porSemana = new Map<string, Comparacion>()
  const proyectos = new Map<string, FilaProyecto & { porPanel: Map<string, FilaPanel> }>()

  const semanaDe = (s: string) => {
    let c = porSemana.get(s)
    if (!c) porSemana.set(s, (c = comparacionVacia()))
    return c
  }
  const proyectoDe = (codigo: string, nombre: string) => {
    let p = proyectos.get(codigo)
    if (!p) {
      p = { codigo, nombre, sinValor: !!codigo && !valorPanel.has(codigo), c: comparacionVacia(), paneles: [], porPanel: new Map() }
      proyectos.set(codigo, p)
    }
    return p
  }
  const panelDe = (p: ReturnType<typeof proyectoDe>, id: string, codigo: string, descripcion: string) => {
    let f = p.porPanel.get(id)
    if (!f) p.porPanel.set(id, (f = { panel_id: id, panel_codigo: codigo, panel_descripcion: descripcion, c: comparacionVacia() }))
    return f
  }
  /** suma en el total, la semana, el proyecto y su panel */
  const anotar = (campo: keyof Comparacion, semana: string, proyecto: string, nombre: string, panel: { id: string; codigo: string; descripcion: string }, paneles: number, m2Panel: number) => {
    if (!paneles) return
    const v = valorPanel.get(proyecto) ?? 0
    const p = proyectoDe(proyecto, nombre)
    for (const c of [total, semanaDe(semana), p.c, panelDe(p, panel.id, panel.codigo, panel.descripcion).c]) sumar(c[campo], paneles, m2Panel, v)
  }

  for (const f of plan) {
    const panel = { id: f.panel_id, codigo: f.panel_codigo, descripcion: f.panel_descripcion }
    anotar('pegadoPlan', f.semana, f.proyecto_codigo, f.proyecto_nombre, panel, f.pegado, f.m2_panel)
    anotar('cortePlan', f.semana, f.proyecto_codigo, f.proyecto_nombre, panel, f.corte, f.m2_panel)
  }
  for (const l of lineas) {
    const codigo = l.sap_proyecto_codigo ?? ''
    anotar('pegadoReal', inicioSemana(l.fecha), codigo, codigo ? (l.proyecto_nombre ?? codigo) : 'Sin proyecto SAP', { id: l.panel_id, codigo: l.panel_codigo, descripcion: l.panel_descripcion }, l.buenos, l.m2_panel)
  }
  for (const l of cortes) {
    anotar('corteReal', inicioSemana(l.fecha), l.proyecto_codigo, l.proyecto_nombre, { id: l.panel_id, codigo: l.panel_codigo, descripcion: l.panel_descripcion }, l.cortados, l.m2_panel)
  }

  const porProyecto: FilaProyecto[] = [...proyectos.values()]
    .map(({ porPanel, ...p }) => ({ ...p, paneles: [...porPanel.values()].sort((a, b) => a.panel_codigo.localeCompare(b.panel_codigo)) }))
    // los proyectos SAP primero (los más nuevos arriba), lo sin proyecto al final
    .sort((a, b) => (a.codigo === '' ? 1 : b.codigo === '' ? -1 : b.codigo.localeCompare(a.codigo)))

  return { total, porSemana, porProyecto }
}

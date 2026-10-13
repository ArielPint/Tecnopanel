import type { ItemSap, LineaCorteV } from './api'

// Cálculos de los cortes: el costo de maquila es m² de panel cortado × precio por m² del tipo de
// corte en SAP (lo mismo que hace la Cubicación: 2,98 m² por panel × $500 en OSB).

/** "SEDE SOCIAL · PANEL OSB/SMP · 6602005 · corte SP" para los <select> */
export function etiquetaItem(i: ItemSap): string {
  return [i.modelo_vivienda || 'Sin modelo', i.tipo_panel || null, `${i.panel_codigo}`, nombreCorte(i.corte_descripcion)].filter(Boolean).join(' · ')
}

/** "MAQUILA CORTE PANEL SIP OSB" -> "corte OSB" */
export function nombreCorte(descripcion: string): string {
  const resto = descripcion.replace(/^MAQUILA\s+CORTE\s+PANEL\s+SIP\s*/i, '').trim()
  return resto ? `corte ${resto.toLowerCase().replace(/\b(osb|sp)\b/g, (m) => m.toUpperCase())}` : descripcion
}

export function resumirCortes(lineas: LineaCorteV[]) {
  let cortados = 0
  let rechazados = 0
  let m2 = 0
  let costo = 0
  for (const l of lineas) {
    cortados += l.cortados
    rechazados += l.rechazados
    m2 += l.cortados * l.m2_panel
    costo += l.cortados * l.m2_panel * (l.precio_m2 ?? 0)
  }
  const total = cortados + rechazados
  return { cortados, rechazados, m2, costo, tasaRechazo: total ? rechazados / total : 0 }
}

export interface AvanceProyecto {
  codigo: string
  nombre: string
  cliente: string | null
  of_numero: number | null
  activo: boolean
  plan: number
  cortados: number
  rechazados: number
  m2Plan: number
  costoPlan: number
  items: ItemSap[]
}

/** Avance por proyecto: paneles planificados en SAP contra los cortados (los rechazados no avanzan). */
export function avancePorProyecto(items: ItemSap[]): AvanceProyecto[] {
  const m = new Map<string, AvanceProyecto>()
  for (const i of items) {
    let p = m.get(i.proyecto_codigo)
    if (!p) {
      p = { codigo: i.proyecto_codigo, nombre: i.proyecto_nombre, cliente: i.cliente, of_numero: i.of_numero, activo: i.proyecto_activo, plan: 0, cortados: 0, rechazados: 0, m2Plan: 0, costoPlan: 0, items: [] }
      m.set(i.proyecto_codigo, p)
    }
    p.items.push(i)
    p.cortados += i.cortados
    p.rechazados += i.rechazados
    if (!i.vigente) continue
    p.plan += i.paneles_plan
    const m2 = i.corte_m2_plan ?? i.paneles_plan * i.m2_panel
    p.m2Plan += m2
    p.costoPlan += m2 * (i.precio_m2 ?? 0)
  }
  return [...m.values()].sort((a, b) => b.codigo.localeCompare(a.codigo))
}

export const fmtPesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`

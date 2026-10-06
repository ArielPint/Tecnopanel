import type { ConsumoV, LineaV, Material, Panel, RecetaFila } from './api'
import { inicioSemana, sumarDias } from './formato'

// Cálculos del portal, puros (sin React ni base) para poder probarlos aparte.

export interface MaterialConsumido {
  material_id: string
  codigo: string
  descripcion: string
  unidad: string
  buenos: number
  merma: number
  total: number
}

const redondear = (n: number) => Math.round(n * 1e6) / 1e6

/** Consumo registrado agrupado por material, de mayor a menor código. */
export function consumoPorMaterial(consumos: ConsumoV[]): MaterialConsumido[] {
  const mapa = new Map<string, MaterialConsumido>()
  for (const c of consumos) {
    const m = mapa.get(c.material_id) ?? {
      material_id: c.material_id,
      codigo: c.material_codigo,
      descripcion: c.material_descripcion,
      unidad: c.unidad,
      buenos: 0,
      merma: 0,
      total: 0,
    }
    m.buenos += c.cantidad_buenos
    m.merma += c.cantidad_merma
    m.total += c.cantidad_total
    mapa.set(c.material_id, m)
  }
  return [...mapa.values()]
    .map((m) => ({ ...m, buenos: redondear(m.buenos), merma: redondear(m.merma), total: redondear(m.total) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/** Lo que consumiría producir esas cantidades con la receta vigente (calculadora). */
export function calcularMateriales(
  pedido: { panel_id: string; cantidad: number }[],
  recetas: RecetaFila[],
  materiales: Material[],
): { materiales: MaterialConsumido[]; sinReceta: string[] } {
  const porMaterial = new Map(materiales.map((m) => [m.id, m]))
  const mapa = new Map<string, MaterialConsumido>()
  const sinReceta: string[] = []
  for (const p of pedido) {
    if (!(p.cantidad > 0)) continue
    const receta = recetas.filter((r) => r.panel_id === p.panel_id)
    if (receta.length === 0) sinReceta.push(p.panel_id)
    for (const r of receta) {
      const mat = porMaterial.get(r.material_id)
      if (!mat) continue
      const m = mapa.get(r.material_id) ?? { material_id: mat.id, codigo: mat.codigo, descripcion: mat.descripcion, unidad: mat.unidad, buenos: 0, merma: 0, total: 0 }
      m.buenos += r.cantidad * p.cantidad
      m.total = m.buenos
      mapa.set(r.material_id, m)
    }
  }
  return {
    materiales: [...mapa.values()].map((m) => ({ ...m, buenos: redondear(m.buenos), total: redondear(m.total) })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    sinReceta,
  }
}

export interface Resumen {
  buenos: number
  rechazados: number
  total: number
  m2: number
  /** rechazados / (buenos + rechazados); 0 si no hay producción */
  tasaRechazo: number
}

export function resumir(lineas: LineaV[]): Resumen {
  const buenos = lineas.reduce((s, l) => s + l.buenos, 0)
  const rechazados = lineas.reduce((s, l) => s + l.rechazados, 0)
  const m2 = lineas.reduce((s, l) => s + l.buenos * l.m2_panel, 0)
  const total = buenos + rechazados
  return { buenos, rechazados, total, m2: Math.round(m2 * 100) / 100, tasaRechazo: total ? rechazados / total : 0 }
}

export interface ProduccionPanel extends Resumen {
  panel_id: string
  codigo: string
  descripcion: string
}

/** Producción por tipo de panel, de más a menos fabricado. */
export function porPanel(lineas: LineaV[]): ProduccionPanel[] {
  const grupos = new Map<string, LineaV[]>()
  for (const l of lineas) grupos.set(l.panel_id, [...(grupos.get(l.panel_id) ?? []), l])
  return [...grupos.entries()]
    .map(([panel_id, ls]) => ({ panel_id, codigo: ls[0].panel_codigo, descripcion: ls[0].panel_descripcion, ...resumir(ls) }))
    .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo))
}

export type Agrupacion = 'dia' | 'semana' | 'mes'

export function claveGrupo(fecha: string, agrupacion: Agrupacion): string {
  if (agrupacion === 'mes') return `${fecha.slice(0, 7)}-01`
  if (agrupacion === 'semana') return inicioSemana(fecha)
  return fecha
}

/** Serie continua (incluye los días/semanas/meses sin producción) entre desde y hasta. */
export function serie(lineas: LineaV[], desde: string, hasta: string, agrupacion: Agrupacion): ({ clave: string } & Resumen)[] {
  const grupos = new Map<string, LineaV[]>()
  for (const l of lineas) {
    const k = claveGrupo(l.fecha, agrupacion)
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  const claves: string[] = []
  for (let f = claveGrupo(desde, agrupacion); f <= hasta; ) {
    claves.push(f)
    if (agrupacion === 'dia') f = sumarDias(f, 1)
    else if (agrupacion === 'semana') f = sumarDias(f, 7)
    else {
      const [a, m] = f.split('-').map(Number)
      f = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
    }
  }
  return claves.map((clave) => ({ clave, ...resumir(grupos.get(clave) ?? []) }))
}

/** m² de un panel según sus medidas (0 si no las tiene). */
export const m2Panel = (p: Pick<Panel, 'ancho_mm' | 'largo_mm'>) => (p.ancho_mm && p.largo_mm ? (p.ancho_mm * p.largo_mm) / 1e6 : 0)

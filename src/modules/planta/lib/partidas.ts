// Partidas constructivas por módulo — pesos y categorías portados 1:1 desde
// control-planta.html (fuente de verdad de estados/tiempos en planta_modulos).
// Cada partida se trackea con 3 checks: c1 ejecutado, c2 calidad, c3 (null|'aprobado'|'no_aplica').
export type Categoria = 'obra_gruesa' | 'sanitario' | 'electrico' | 'terminaciones'

export interface Partida {
  c: string
  l: string
  w: number
}

export const PARTIDAS: Record<Categoria, Partida[]> = {
  obra_gruesa: [
    { c: 'OG.01', l: 'Piso', w: 12.0 },
    { c: 'OG.02', l: 'Tabiques', w: 8.0 },
    { c: 'OG.03', l: 'Muros', w: 11.0 },
    { c: 'OG.04', l: 'Cielo', w: 8.0 },
    { c: 'OG.05', l: 'Estructura Balcón', w: 4.0 },
  ],
  electrico: [
    { c: 'EL.01', l: 'Canalización', w: 3.0 },
    { c: 'EL.02', l: 'Conductores (Cableado)', w: 3.0 },
    { c: 'EL.03', l: 'Artefactos', w: 1.0 },
    { c: 'EL.04', l: 'Tablero', w: 2.0 },
    { c: 'EL.05', l: 'Caja PAU', w: 2.0 },
  ],
  sanitario: [
    { c: 'SA.01', l: 'Red de Alcantarillado', w: 2.0 },
    { c: 'SA.02', l: 'Red de Agua', w: 2.0 },
    { c: 'SA.03', l: 'Tina', w: 1.0 },
    { c: 'SA.04', l: 'WC', w: 1.0 },
    { c: 'SA.05', l: 'Lavamanos', w: 2.0 },
  ],
  terminaciones: [
    { c: 'TE.01', l: 'OSB Cubierta', w: 2.0 },
    { c: 'TE.02', l: 'OSB Exterior', w: 3.0 },
    { c: 'TE.03', l: 'Lavadero', w: 0.5 },
    { c: 'TE.04', l: 'Impermeabilización Baño - Cocina - Logia', w: 1.0 },
    { c: 'TE.05', l: 'Revestimiento Interior Zona Seca', w: 2.0 },
    { c: 'TE.06', l: 'Revestimiento Interior Cocina - Logia', w: 2.0 },
    { c: 'TE.07', l: 'Revestimiento Interior Baño', w: 3.0 },
    { c: 'TE.08', l: 'Instalación Vinílico', w: 2.0 },
    { c: 'TE.09', l: 'Lavaplatos', w: 1.0 },
    { c: 'TE.10', l: 'Marcos Ventanas', w: 2.0 },
    { c: 'TE.11', l: 'Puertas', w: 2.0 },
    { c: 'TE.12', l: 'Extractores', w: 2.0 },
    { c: 'TE.13', l: 'Termopaneles', w: 1.0 },
    { c: 'TE.14', l: 'Cornizas', w: 1.0 },
    { c: 'TE.15', l: 'Pilastras', w: 1.0 },
    { c: 'TE.16', l: 'Endolados', w: 1.0 },
    { c: 'TE.17', l: 'Celosías', w: 0.5 },
    { c: 'TE.18', l: 'Baranda y Pintura Balcón', w: 2.0 },
    { c: 'TE.19', l: 'Smart Panel', w: 3.0 },
    { c: 'TE.20', l: 'Pintura Exterior', w: 2.5 },
    { c: 'TE.21', l: 'Ventilaciones Pasivas', w: 1.0 },
    { c: 'TE.22', l: 'Recepción Final', w: 2.5 },
  ],
}

export const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: 'obra_gruesa', label: 'Obra Gruesa' },
  { key: 'sanitario', label: 'Sanitario' },
  { key: 'electrico', label: 'Eléctrico' },
  { key: 'terminaciones', label: 'Terminaciones' },
]

const ALL_PARTIDAS: (Partida & { cat: Categoria })[] = (Object.keys(PARTIDAS) as Categoria[]).flatMap((cat) =>
  PARTIDAS[cat].map((p) => ({ ...p, cat })),
)

export interface EstadoCheck {
  c1: boolean
  c2: boolean
  c3: string | null
}

export interface TiempoPartida {
  t1?: string
  t2?: string
  t3?: string
}

export interface ModuloLive {
  estados: Record<string, unknown> | null
  tiempos: Record<string, TiempoPartida> | null
}

export function pS(m: ModuloLive, code: string): EstadoCheck {
  const s = m.estados?.[code]
  if (!s) return { c1: false, c2: false, c3: null }
  if (typeof s === 'string') {
    if (s === 'aprobado') return { c1: true, c2: true, c3: 'aprobado' }
    if (s === 'no_aplica') return { c1: false, c2: false, c3: 'no_aplica' }
    if (s === 'qc2') return { c1: true, c2: true, c3: null }
    if (s === 'qc1' || s === 'ejecutado') return { c1: true, c2: false, c3: null }
    return { c1: false, c2: false, c3: null }
  }
  const so = s as { c1?: boolean; c2?: boolean; c3?: string | null }
  return { c1: !!so.c1, c2: !!so.c2, c3: so.c3 ?? null }
}

export const isDone = (s: EstadoCheck) => s.c1 && s.c2 && s.c3 === 'aprobado'
export const isNA = (s: EstadoCheck) => s.c3 === 'no_aplica'

// % ponderado por peso de partida (0..1) — igual a tabProgress/moduleProgress de control-planta.html.
function weightedProgress(m: ModuloLive, partidas: Partida[]): number {
  const rel = partidas.filter((p) => !isNA(pS(m, p.c)))
  if (!rel.length) return 1
  const totalW = rel.reduce((s, p) => s + p.w, 0)
  const doneW = rel.filter((p) => isDone(pS(m, p.c))).reduce((s, p) => s + p.w, 0)
  return doneW / totalW
}

export function catProgress(m: ModuloLive, cat: Categoria): number {
  return weightedProgress(m, PARTIDAS[cat])
}

export function moduloProgress(m: ModuloLive): number {
  return weightedProgress(m, ALL_PARTIDAS)
}

// % de módulos (entre los relevantes, es decir no N/A para esa partida) donde la partida
// está aprobada — equivalente binario al promedio continuo que traía BD_AVANCE por columna.
export function partidaAvg(rows: ModuloLive[], code: string): number {
  const rel = rows.filter((r) => !isNA(pS(r, code)))
  if (!rel.length) return 0
  return rel.filter((r) => isDone(pS(r, code))).length / rel.length
}

export function isModuloIniciado(m: ModuloLive): boolean {
  return ALL_PARTIDAS.some((p) => {
    const s = pS(m, p.c)
    return s.c1 || s.c2 || s.c3 === 'aprobado'
  })
}

export function isModuloTerminado(m: ModuloLive): boolean {
  return ALL_PARTIDAS.every((p) => {
    const s = pS(m, p.c)
    return isDone(s) || isNA(s)
  })
}

function allTiemposDe(m: ModuloLive, code: string): string[] {
  const t = m.tiempos?.[code]
  if (!t) return []
  return [t.t1, t.t2, t.t3].filter((v): v is string => !!v)
}

export interface TiemposCategoria {
  avg: number
  min: number
  max: number
  n: number
}

// Días transcurridos (primer t1 → último t3) por categoría, solo en módulos donde esa
// categoría está 100% aprobada — equivalente en vivo a "tiempos.xlsx" de produccion.html.
export function tiemposCategoria(rows: ModuloLive[], cat: Categoria): TiemposCategoria {
  const partidas = PARTIDAS[cat]
  const dias: number[] = []
  for (const r of rows) {
    if (catProgress(r, cat) < 1) continue
    let min: string | null = null
    let max: string | null = null
    for (const p of partidas) {
      if (isNA(pS(r, p.c))) continue
      for (const f of allTiemposDe(r, p.c)) {
        if (!min || f < min) min = f
        if (!max || f > max) max = f
      }
    }
    if (min && max) dias.push((new Date(max).getTime() - new Date(min).getTime()) / 86400000)
  }
  const n = dias.length
  if (!n) return { avg: 0, min: 0, max: 0, n: 0 }
  return { avg: dias.reduce((s, d) => s + d, 0) / n, min: Math.min(...dias), max: Math.max(...dias), n }
}

// Fecha del primer movimiento registrado en cualquier partida relevante (proxy de "inicio real").
export function fechaInicioReal(m: ModuloLive): string | null {
  let min: string | null = null
  for (const p of ALL_PARTIDAS) {
    if (isNA(pS(m, p.c))) continue
    for (const f of allTiemposDe(m, p.c)) {
      if (!min || f < min) min = f
    }
  }
  return min
}

// Fecha del último movimiento (t1/t2/t3) en cualquier partida — proxy de "sin movimiento hace X días".
export function fechaUltimoMovimiento(m: ModuloLive): string | null {
  let max: string | null = null
  for (const p of ALL_PARTIDAS) {
    for (const f of allTiemposDe(m, p.c)) {
      if (!max || f > max) max = f
    }
  }
  return max
}

// Fecha de aprobación (t3) de la última partida relevante — solo tiene sentido si isModuloTerminado.
export function fechaTerminoReal(m: ModuloLive): string | null {
  let max: string | null = null
  for (const p of ALL_PARTIDAS) {
    const s = pS(m, p.c)
    if (isNA(s) || !isDone(s)) continue
    const t3 = m.tiempos?.[p.c]?.t3
    if (t3 && (!max || t3 > max)) max = t3
  }
  return max
}

export interface PartidaPendiente {
  cat: Categoria
  code: string
  label: string
}

// Partidas relevantes (no N/A) todavía no aprobadas — para Alertas/Detalle ("partidas pendientes").
export function partidasPendientes(m: ModuloLive): PartidaPendiente[] {
  return ALL_PARTIDAS.filter((p) => {
    const s = pS(m, p.c)
    return !isNA(s) && !isDone(s)
  }).map((p) => ({ cat: p.cat, code: p.c, label: p.l }))
}

export function formatPartidasPendientes(pend: PartidaPendiente[]): string {
  const porCat = new Map<Categoria, string[]>()
  for (const p of pend) {
    if (!porCat.has(p.cat)) porCat.set(p.cat, [])
    porCat.get(p.cat)!.push(p.label)
  }
  return CATEGORIAS.filter((c) => porCat.has(c.key))
    .map((c) => `${c.label}: ${porCat.get(c.key)!.join(', ')}`)
    .join(' | ')
}

export { ALL_PARTIDAS }

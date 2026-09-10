import { fmtMontoCLP } from '@/lib/montoCLP'

export const N = (v: unknown): number | null => (v == null || v === '' || isNaN(+v) ? null : +v)

export const fmt = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('es-CL').format(Math.round(v)))

export const fmtM = (v: number | null | undefined) => fmtMontoCLP(v)

// Recibe el valor YA en escala 0-100 (a diferencia de formatPct de financiero, que recibe fracción 0-1)
export const fmtPr = (v: number | null | undefined) => (v == null ? '—' : (+v).toFixed(2) + '%')

export const fmtDate = (v: unknown) => {
  if (!v) return '—'
  const d = parseDate(v)
  if (!d || isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Lunes de la semana de `date`, como timestamp — misma convención que dashboard.html (weekKey)
export function weekKey(date: unknown): number | null {
  const d = parseDate(date)
  if (!d) return null
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function weekLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return new Date(v)
  if (typeof v === 'number') return new Date((v - 25569) * 86400000)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00')
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

// Días hábiles (lun-vie) entre dos fechas, sin contar el día de inicio (no considera feriados)
export function businessDaysBetween(d1: Date, d2: Date): number {
  const cur = new Date(d1)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(d2)
  end.setHours(0, 0, 0, 0)
  let count = 0
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export interface MesOrden {
  n: number
  y: number
  lbl: string
}

// Orden de meses del proyecto: siempre Oct 2025 primero, luego 2026 completo
export const MESES_ORDER: MesOrden[] = [
  { n: 10, y: 2025, lbl: 'Oct 2025' }, { n: 11, y: 2025, lbl: 'Nov 2025' }, { n: 12, y: 2025, lbl: 'Dic 2025' },
  { n: 1, y: 2026, lbl: 'Ene 2026' }, { n: 2, y: 2026, lbl: 'Feb 2026' }, { n: 3, y: 2026, lbl: 'Mar 2026' },
  { n: 4, y: 2026, lbl: 'Abr 2026' }, { n: 5, y: 2026, lbl: 'May 2026' }, { n: 6, y: 2026, lbl: 'Jun 2026' },
  { n: 7, y: 2026, lbl: 'Jul 2026' }, { n: 8, y: 2026, lbl: 'Ago 2026' }, { n: 9, y: 2026, lbl: 'Sep 2026' },
]

// Etiqueta del mes en curso, con el mismo formato que MESES_ORDER y que el mesLbl
// de useDespachosData ("Sep 2026"), para poder marcarlo como parcial en los
// graficos mensuales: el mes corriente solo lleva los dias transcurridos.
export function mesActualLbl(hoy: Date = new Date()): string | null {
  const m = MESES_ORDER.find((x) => x.n === hoy.getMonth() + 1 && x.y === hoy.getFullYear())
  return m ? m.lbl : null
}

export function demoMesActual() {
  console.assert(mesActualLbl(new Date(2026, 8, 7)) === 'Sep 2026', mesActualLbl(new Date(2026, 8, 7)) ?? 'null')
  console.assert(mesActualLbl(new Date(2025, 9, 1)) === 'Oct 2025', mesActualLbl(new Date(2025, 9, 1)) ?? 'null')
  // fuera del rango del proyecto no marca nada en vez de inventar un mes
  console.assert(mesActualLbl(new Date(2027, 0, 15)) === null, 'fuera de rango debe dar null')
  const lbl = mesActualLbl(new Date(2026, 8, 7))
  console.assert(lbl != null && /^[A-Z][a-z]{2} \d{4}$/.test(lbl), `formato inesperado: ${lbl}`)
}

// ── Corte por mes (filtro del dashboard Ejecutivo) ─────────────────────────────

// Fin del día del corte: por defecto "ahora", o el último instante del mes elegido.
export function corteHasta(hasta?: Date | null): Date {
  if (hasta) return hasta
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

// Fecha real (inicio/término de módulo) que cae dentro del corte. Si el flag
// existe pero la fecha no parsea cuenta igual: hay módulos con termReal marcado
// sin fecha válida (RF/R1 del avance.xlsx) y no deben desaparecer del conteo.
export function dentroDeCorte(valor: unknown, hasta: Date): boolean {
  if (!valor) return false
  const d = parseDate(valor)
  return !d || isNaN(d.getTime()) ? true : d <= hasta
}

// Opciones del filtro de mes: meses del año en curso ya iniciados. El avance
// económico solo existe para el año actual, por eso no se ofrecen los de 2025.
export function mesesCorteOpts(hoy: Date = new Date()): MesOrden[] {
  return MESES_ORDER.filter((m) => m.y === hoy.getFullYear() && m.n <= hoy.getMonth() + 1)
}

// Último instante del mes elegido, sin pasarse de hoy (el mes en curso corta hoy).
export function finDeMesCorte(n: number, y: number, hoy: Date = new Date()): Date {
  const fin = new Date(y, n, 0, 23, 59, 59, 999)
  const tope = new Date(hoy)
  tope.setHours(23, 59, 59, 999)
  return fin > tope ? tope : fin
}

export function demoCorte() {
  const hoy = new Date(2026, 8, 10)
  console.assert(finDeMesCorte(8, 2026, hoy).getDate() === 31, 'agosto cierra el 31')
  console.assert(finDeMesCorte(9, 2026, hoy).getDate() === 10, 'mes en curso corta hoy')
  console.assert(mesesCorteOpts(hoy).length === 9, `esperaba Ene..Sep, dio ${mesesCorteOpts(hoy).length}`)
  console.assert(dentroDeCorte('2026-07-15', finDeMesCorte(7, 2026, hoy)), 'julio dentro del corte de julio')
  console.assert(!dentroDeCorte('2026-08-01', finDeMesCorte(7, 2026, hoy)), 'agosto fuera del corte de julio')
  console.assert(dentroDeCorte('SIN FECHA', finDeMesCorte(7, 2026, hoy)), 'flag sin fecha cuenta igual')
}

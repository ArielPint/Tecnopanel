export const N = (v: unknown): number | null => (v == null || v === '' || isNaN(+v) ? null : +v)

export const fmt = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('es-CL').format(Math.round(v)))

export const fmtM = (v: number | null | undefined) => {
  if (v == null) return '—'
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1e6) return s + '$' + new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(a / 1e6) + 'M'
  return s + '$' + fmt(Math.abs(v))
}

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

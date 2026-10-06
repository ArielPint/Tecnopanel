// Fechas y números del portal. Las fechas viajan como 'YYYY-MM-DD' (hora de Chile, igual que pnl_hoy()).

export function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Lunes de la semana de la fecha. */
export function inicioSemana(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 = domingo
  return sumarDias(fecha, -((dow + 6) % 7))
}

export function fmtFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const [a, m, d] = fecha.slice(0, 10).split('-')
  return `${d}-${m}-${a}`
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export function fmtFechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
}

export function fmtFechaHora(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

/** '08:00:00' -> '08:00' */
export const fmtHora = (h: string | null | undefined) => (h ? h.slice(0, 5) : '')

export function fmtTramo(desde: string | null, hasta: string | null): string {
  return desde && hasta ? `${fmtHora(desde)}–${fmtHora(hasta)}` : 'Día completo'
}

export function fmtNum(n: number, decimales = 0): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
}

/** Cantidad de material: hasta 4 decimales, sin ceros de relleno. */
export const fmtCant = (n: number) => fmtNum(n, 4)

export function fmtPct(n: number): string {
  return `${(n * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
}

/** Fecha de Excel (número de serie) para que la columna sea fecha y no texto. */
export const serialExcel = (f: string) =>
  (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000

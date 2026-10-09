import type { EstadoSso } from './tipos'

export const ESTADOS: { key: EstadoSso; label: string; clase: string }[] = [
  { key: 'abierto', label: 'Abierto', clase: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  { key: 'en_proceso', label: 'En proceso', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  { key: 'pend_verificacion', label: 'Pendiente de verificación', clase: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  { key: 'cerrado', label: 'Cerrado', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
]

export const ESTADO_META = Object.fromEntries(ESTADOS.map((e) => [e.key, e])) as Record<EstadoSso, (typeof ESTADOS)[number]>

/** Fecha 'YYYY-MM-DD' de la base a 'DD-MM-YYYY', sin pasar por Date (que la correría de día por zona horaria). */
export function fmtFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const [a, m, d] = fecha.slice(0, 10).split('-')
  return `${d}-${m}-${a}`
}

export function fmtFechaHora(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

/** Hoy en Chile como 'YYYY-MM-DD' (mismo criterio que sso_hoy() en la base). */
export function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export function formatCLP(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return CLP.format(value)
}

export function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(1)}%`
}

const CLP_COMPACT = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCLPCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return CLP_COMPACT.format(value)
}

export function formatFecha(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CL')
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

export function nombreMes(mes: number) {
  return MESES[mes - 1] ?? String(mes)
}

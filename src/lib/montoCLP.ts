// Convención de montos del sistema, la misma que ya usaban los indicadores de La Chacra:
// el monto va expresado en millones de pesos con separador de miles y sufijo M
// (ej: $2.119M, $18.400M). Bajo el millón se muestra el número completo.
// Para el monto exacto (facturas, órdenes de compra, formularios) va el valor completo,
// no esta escala.
export function fmtMontoCLP(n: number | null | undefined, vacio = '—'): string {
  if (n == null || Number.isNaN(n)) return vacio
  const signo = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const num = (v: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(v)
  if (abs >= 1_000_000) return signo + '$' + num(abs / 1_000_000) + 'M'
  return signo + '$' + num(abs)
}

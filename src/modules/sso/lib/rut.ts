// RUT chileno: mismo criterio que sso_rut_normalizar() / sso_rut_valido() en la base, para avisar
// antes de enviar (la base igual lo valida en el trigger).

/** '12.345.678-k' -> '12345678-K'; null si no tiene forma de RUT. */
export function normalizarRut(rut: string | null | undefined): string | null {
  const limpio = (rut ?? '').toUpperCase().replace(/[^0-9K]/g, '')
  if (!/^[0-9]{6,8}[0-9K]$/.test(limpio)) return null
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

export function rutValido(rut: string | null | undefined): boolean {
  const n = normalizarRut(rut)
  if (!n) return false
  const [cuerpo, dv] = n.split('-')
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return dv === esperado
}

/** '12345678-5' -> '12.345.678-5' (solo para mostrar). */
export function formatearRut(rut: string | null | undefined): string {
  const n = normalizarRut(rut)
  if (!n) return rut ?? ''
  const [cuerpo, dv] = n.split('-')
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

import { formatCLP } from '@/modules/financiero/utils/formatters'

/** Pesos con el signo antes del $ ("-$1.234"): en es-CL Intl lo deja como "$-1.234". */
export function pesos(v: number): string {
  return v < 0 ? `-${formatCLP(-v)}` : formatCLP(v)
}

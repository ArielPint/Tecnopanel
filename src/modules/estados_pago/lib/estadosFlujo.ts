import type { EstadoEP } from '../types'

// Flujo confirmado por el usuario 2026-08-01 (PLAN_AVANCE_GENERAL.md §3.9.1 punto 4),
// reemplaza la propuesta inicial de 9 estados. El trigger `estados_pago_validar_transicion`
// en la base de datos aplica la misma regla — esto es solo para la UI.
export const ESTADOS_EP: EstadoEP[] = ['emitido', 'en_revision', 'aprobado', 'rechazado', 'pagado']

export const ESTADO_LABEL: Record<EstadoEP, string> = {
  emitido: 'Emitido',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pagado: 'Pagado',
}

export const ESTADO_VARIANT: Record<EstadoEP, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  emitido: 'secondary',
  en_revision: 'warning',
  aprobado: 'success',
  rechazado: 'destructive',
  pagado: 'success',
}

const TRANSICIONES: Record<EstadoEP, EstadoEP[]> = {
  emitido: ['en_revision'],
  en_revision: ['aprobado', 'rechazado'],
  aprobado: ['pagado'],
  rechazado: [],
  pagado: [],
}

export function siguientesEstados(actual: EstadoEP): EstadoEP[] {
  return TRANSICIONES[actual]
}

// Aprobado/Rechazado/Pagado exigen accion 'aprobar' (RLS ya lo exige igual —
// esto solo evita mostrar un botón que la base va a rechazar).
export function requiereAprobar(destino: EstadoEP): boolean {
  return destino === 'aprobado' || destino === 'rechazado' || destino === 'pagado'
}

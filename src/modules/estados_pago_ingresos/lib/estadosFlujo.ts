import type { EstadoEPIngreso } from '../types'

// Mismo flujo que estados_pago (proveedores) — el trigger
// `estados_pago_ingresos_validar_transicion` en la base aplica la misma regla,
// esto es solo para la UI. 'pagado' se muestra como "Cobrado" (semántica ingreso).
export const ESTADOS_EP: EstadoEPIngreso[] = ['emitido', 'en_revision', 'aprobado', 'rechazado', 'pagado']

export const ESTADO_LABEL: Record<EstadoEPIngreso, string> = {
  emitido: 'Emitido',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pagado: 'Cobrado',
}

export const ESTADO_VARIANT: Record<EstadoEPIngreso, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  emitido: 'secondary',
  en_revision: 'warning',
  aprobado: 'success',
  rechazado: 'destructive',
  pagado: 'success',
}

const TRANSICIONES: Record<EstadoEPIngreso, EstadoEPIngreso[]> = {
  emitido: ['en_revision'],
  en_revision: ['aprobado', 'rechazado'],
  aprobado: ['pagado'],
  rechazado: [],
  pagado: [],
}

export function siguientesEstados(actual: EstadoEPIngreso): EstadoEPIngreso[] {
  return TRANSICIONES[actual]
}

// Aprobado/Rechazado/Cobrado exigen accion 'aprobar' (RLS ya lo exige igual —
// esto solo evita mostrar un botón que la base va a rechazar).
export function requiereAprobar(destino: EstadoEPIngreso): boolean {
  return destino === 'aprobado' || destino === 'rechazado' || destino === 'pagado'
}

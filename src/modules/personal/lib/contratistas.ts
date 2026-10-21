import { hoyChile } from '@/modules/sso/lib/estados'
import { DIA_LIMITE_EMPRESA, DOCS_EMPRESA } from './catalogos'
import type { DocEmpresa } from './api'

// Control mensual de las empresas contratistas: cada mes tienen que estar los DOCS_EMPRESA.

/** 'YYYY-MM-01' del mes de una fecha (por defecto, hoy en Chile). */
export function periodoDe(fecha: string = hoyChile()): string {
  return `${fecha.slice(0, 7)}-01`
}

export type EstadoMes = 'al_dia' | 'pendiente' | 'atrasado'

export const ESTADO_MES: Record<EstadoMes, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  al_dia: { label: 'Al día', variant: 'success' },
  pendiente: { label: 'Pendiente', variant: 'warning' },
  atrasado: { label: 'Atrasado', variant: 'destructive' },
}

/** Tipos de documento que faltan a una empresa en el mes, según los documentos de ese mes. */
export function faltantes(empresaId: string, docs: DocEmpresa[]) {
  return DOCS_EMPRESA.filter((t) => !docs.some((d) => d.empresa_id === empresaId && d.tipo === t.key))
}

/** Al día si no falta nada; si falta algo, pendiente hasta el día límite del mes y atrasado después. */
export function estadoMes(faltan: number, periodo: string, hoy: string = hoyChile()): EstadoMes {
  if (faltan === 0) return 'al_dia'
  const actual = periodoDe(hoy)
  if (periodo > actual) return 'pendiente'
  if (periodo < actual) return 'atrasado'
  return +hoy.slice(8, 10) > DIA_LIMITE_EMPRESA ? 'atrasado' : 'pendiente'
}

/** 'octubre de 2026' */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

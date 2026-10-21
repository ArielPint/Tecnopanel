import { hoyChile } from '@/modules/sso/lib/estados'
import { DIA_LIMITE_EMPRESA, DOCS_EMPRESA } from './catalogos'
import type { DocEmpresa, Listado } from './api'

// Control mensual de las empresas contratistas: cada mes tienen que estar los DOCS_EMPRESA.

/** 'YYYY-MM-01' del mes de una fecha (por defecto, hoy en Chile). */
export function periodoDe(fecha: string = hoyChile()): string {
  return `${fecha.slice(0, 7)}-01`
}

export type EstadoMes = 'al_dia' | 'en_revision' | 'pendiente' | 'atrasado'

export const ESTADO_MES: Record<EstadoMes, { label: string; variant: 'success' | 'default' | 'warning' | 'destructive' }> = {
  al_dia: { label: 'Al día', variant: 'success' },
  en_revision: { label: 'Por revisar', variant: 'default' },
  pendiente: { label: 'Pendiente', variant: 'warning' },
  atrasado: { label: 'Atrasado', variant: 'destructive' },
}

export interface SituacionMes {
  estado: EstadoMes
  /** lo que la empresa todavía tiene que subir o confirmar (o volver a subir, si se rechazó) */
  porCargar: string[]
  /** lo cargado que Tecnopanel todavía no revisa */
  porRevisar: string[]
}

/** Cómo está una empresa en el mes. Un tipo de documento cuenta como cargado si tiene alguno que no
 *  esté rechazado, y como al día si tiene uno aprobado (igual que ing_empresa_faltan()). */
export function situacionMes(empresaId: string, docs: DocEmpresa[], listados: Listado[], periodo: string, hoy: string = hoyChile()): SituacionMes {
  const porCargar: string[] = []
  const porRevisar: string[] = []
  const listado = listados.find((x) => x.empresa_id === empresaId)
  if (!listado || listado.estado === 'rechazado') porCargar.push('Listado')
  else if (listado.estado === 'por_revisar') porRevisar.push('Listado')
  for (const t of DOCS_EMPRESA) {
    const propios = docs.filter((d) => d.empresa_id === empresaId && d.tipo === t.key)
    if (propios.some((d) => d.estado === 'aprobado')) continue
    if (propios.some((d) => d.estado === 'por_revisar')) porRevisar.push(t.corto)
    else porCargar.push(t.corto)
  }
  let estado: EstadoMes = 'al_dia'
  if (porCargar.length) {
    const actual = periodoDe(hoy)
    estado = periodo < actual || (periodo === actual && +hoy.slice(8, 10) > DIA_LIMITE_EMPRESA) ? 'atrasado' : 'pendiente'
  } else if (porRevisar.length) estado = 'en_revision'
  return { estado, porCargar, porRevisar }
}

/** 'octubre de 2026' */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

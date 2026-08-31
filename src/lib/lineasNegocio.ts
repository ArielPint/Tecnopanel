import { supabase } from './supabaseClient'

export const SUCURSALES = ['Santiago', 'Puerto Varas'] as const
export type Sucursal = (typeof SUCURSALES)[number]

export interface LineaNegocio {
  id: string
  codigo: string
  nombre: string
  color: string | null
  orden: number
  activa: boolean
  /** Módulos que el wizard premarca al elegir esta línea. */
  modulos_default: string[]
  fuente_venta: 'despachos' | 'unidades'
}

// Catálogo cerrado que cambia una vez al año — se cachea igual que proyectoIds.
let cache: Promise<LineaNegocio[]> | null = null

export function getLineasNegocio(): Promise<LineaNegocio[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase
        .from('lineas_negocio')
        .select('*')
        .eq('activa', true)
        .order('orden')
      if (error) {
        cache = null
        throw new Error(error.message)
      }
      return (data ?? []) as LineaNegocio[]
    })()
  }
  return cache
}

/** Abreviatura de sucursal para slugs. Las iniciales solas dejaban "Santiago" en "s". */
const ABREVIATURAS: Record<string, string> = { Santiago: 'stgo', 'Puerto Varas': 'pv' }

export function abreviaturaSucursal(sucursal: string): string {
  return ABREVIATURAS[sucursal] ?? sucursal.toLowerCase().replace(/[^a-z]+/g, '')
}

import { supabase, unwrap } from '@/lib/supabaseClient'
import type { ChipEstado } from './crParser'
import type { AsignacionCategoria, ObraSubcontrato } from './categorias'

export interface ObraCrModuloDb {
  modulo_num: number
  code: string
  tipo: string
  estados: Record<string, ChipEstado>
  terminado: boolean
}

export async function loadObraCrModulos(proyectoId: string): Promise<ObraCrModuloDb[]> {
  const data = await unwrap(
    supabase
      .from('obra_cr_modulos')
      .select('modulo_num, code, tipo, estados, terminado')
      .eq('proyecto_id', proyectoId)
      .eq('activo', true)
      .order('modulo_num', { ascending: true }),
  )
  return (data ?? []) as ObraCrModuloDb[]
}

export interface ObraCrConfigDb {
  modulo_num: number
  categoria: AsignacionCategoria
  subcontrato: ObraSubcontrato | null
  fecha_entrega_final: string | null
}

export async function loadObraCrConfig(proyectoId: string): Promise<ObraCrConfigDb[]> {
  const data = await unwrap(
    supabase
      .from('obra_cr_config')
      .select('modulo_num, categoria, subcontrato, fecha_entrega_final')
      .eq('proyecto_id', proyectoId),
  )
  return (data ?? []) as ObraCrConfigDb[]
}

export interface ObraCrConfigCambio {
  moduloNum: number
  categoria: AsignacionCategoria
  subcontrato: ObraSubcontrato | null
  fechaEntrega: string | null
}

export async function guardarObraCrConfigBatch(proyectoId: string, cambios: ObraCrConfigCambio[]): Promise<void> {
  if (!cambios.length) return
  const ahora = new Date().toISOString()
  const rows = cambios.map((c) => ({
    proyecto_id: proyectoId,
    modulo_num: c.moduloNum,
    categoria: c.categoria,
    subcontrato: c.subcontrato,
    fecha_entrega_final: c.fechaEntrega,
    actualizado_at: ahora,
  }))
  const { error } = await supabase.from('obra_cr_config').upsert(rows, { onConflict: 'proyecto_id,modulo_num,categoria' })
  if (error) throw new Error(error.message)
}

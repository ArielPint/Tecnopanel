import { supabase, unwrap } from '@/lib/supabaseClient'
import type { ChipEstado } from './crParser'

export interface ObraCrModuloDb {
  modulo_num: number
  code: string
  tipo: string
  estados: Record<string, ChipEstado>
}

export async function loadObraCrModulos(proyectoId: string): Promise<ObraCrModuloDb[]> {
  const data = await unwrap(
    supabase
      .from('obra_cr_modulos')
      .select('modulo_num, code, tipo, estados')
      .eq('proyecto_id', proyectoId)
      .eq('activo', true)
      .order('modulo_num', { ascending: true }),
  )
  return (data ?? []) as ObraCrModuloDb[]
}

export interface ObraCrConfigDb {
  modulo_num: number
  subcontrato: 'W' | 'C' | null
  fecha_entrega_final: string | null
}

export async function loadObraCrConfig(proyectoId: string): Promise<ObraCrConfigDb[]> {
  const data = await unwrap(
    supabase
      .from('obra_cr_config')
      .select('modulo_num, subcontrato, fecha_entrega_final')
      .eq('proyecto_id', proyectoId),
  )
  return (data ?? []) as ObraCrConfigDb[]
}

export async function guardarObraCrConfig(
  proyectoId: string,
  moduloNum: number,
  cambios: { subcontrato: 'W' | 'C' | null; fechaEntregaFinal: string | null },
): Promise<void> {
  const { error } = await supabase.from('obra_cr_config').upsert(
    {
      proyecto_id: proyectoId,
      modulo_num: moduloNum,
      subcontrato: cambios.subcontrato,
      fecha_entrega_final: cambios.fechaEntregaFinal,
      actualizado_at: new Date().toISOString(),
    },
    { onConflict: 'proyecto_id,modulo_num' },
  )
  if (error) throw new Error(error.message)
}

import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { Presupuesto } from '@/modules/financiero/types/financiero'

type NuevoPresupuesto = Pick<
  Presupuesto,
  'codigo_articulo' | 'nombre' | 'tarea_wip' | 'presupuesto_original' | 'valor_servicio'
>

export function usePresupuestos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `presupuestos:${proyectoSlug}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_presupuestos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('codigo_articulo')
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  // Sin realtime acá: cache 1min + invalidación explícita tras cada mutación propia.
  const { data, loading, error, refetch } = useCachedQuery<Presupuesto[]>(cacheKey, fetcher, 60_000)

  const createPresupuesto = useCallback(
    async (input: NuevoPresupuesto) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error } = await supabase
        .from('financiero_presupuestos')
        .insert({ ...input, proyecto_id: proyectoId })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Presupuesto
    },
    [refetch, proyectoSlug],
  )

  const updatePresupuesto = useCallback(
    async (id: string, patch: Partial<NuevoPresupuesto & { activo: boolean }>) => {
      const { data, error } = await supabase
        .from('financiero_presupuestos')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Presupuesto
    },
    [refetch],
  )

  return { presupuestos: data ?? [], loading, error, refetch, createPresupuesto, updatePresupuesto }
}

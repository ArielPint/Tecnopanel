import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

type NuevoMonto = Pick<MontoMensual, 'mes' | 'anio' | 'monto' | 'observacion'>

export function useIngresos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `ingresos:${proyectoSlug}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_ingresos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  // Sin realtime acá: cache 1min + invalidación explícita tras cada mutación propia.
  const { data, loading, error, refetch } = useCachedQuery<MontoMensual[]>(cacheKey, fetcher, 60_000)

  const upsertIngreso = useCallback(
    async (input: NuevoMonto & { id?: string }) => {
      const { id, ...resto } = input
      let query
      if (id) {
        query = supabase.from('financiero_ingresos').update(resto).eq('id', id)
      } else {
        const proyectoId = await getProyectoId(proyectoSlug!)
        query = supabase.from('financiero_ingresos').insert({ ...resto, proyecto_id: proyectoId })
      }
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as MontoMensual
    },
    [refetch, proyectoSlug],
  )

  return { ingresos: data ?? [], loading, error, refetch, upsertIngreso }
}

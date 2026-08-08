import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { GastoDirecto } from '@/modules/financiero/types/financiero'

type NuevoGasto = Pick<GastoDirecto, 'presupuesto_id' | 'mes' | 'anio' | 'monto' | 'observacion' | 'proveedor_rut'>

export function useGastosDirectos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `gastos_directos:${proyectoSlug}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_gastos_directos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  // Sin realtime acá: cache 1min + invalidación explícita tras cada mutación propia.
  const { data, loading, error, refetch } = useCachedQuery<GastoDirecto[]>(cacheKey, fetcher, 60_000)

  const upsertGasto = useCallback(
    async (input: NuevoGasto & { id?: string }) => {
      const { id, ...resto } = input
      let query
      if (id) {
        query = supabase.from('financiero_gastos_directos').update(resto).eq('id', id)
      } else {
        const proyectoId = await getProyectoId(proyectoSlug!)
        query = supabase.from('financiero_gastos_directos').insert({ ...resto, proyecto_id: proyectoId })
      }
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as GastoDirecto
    },
    [refetch, proyectoSlug],
  )

  return { gastos: data ?? [], loading, error, refetch, upsertGasto }
}

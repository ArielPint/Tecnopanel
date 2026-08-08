import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

type NuevoMonto = {
  mes: number
  anio: number
  monto: number
  observacion: string | null
  categoria?: string
}

export function useRemuneraciones() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `remuneraciones:${proyectoSlug}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_remuneraciones')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  // Sin realtime acá: cache 1min + invalidación explícita tras cada mutación propia.
  const { data, loading, error, refetch } = useCachedQuery<MontoMensual[]>(cacheKey, fetcher, 60_000)

  const upsertRemuneracion = useCallback(
    async (input: NuevoMonto & { id?: string }) => {
      const { id, ...resto } = input
      let query
      if (id) {
        query = supabase.from('financiero_remuneraciones').update(resto).eq('id', id)
      } else {
        const proyectoId = await getProyectoId(proyectoSlug!)
        query = supabase.from('financiero_remuneraciones').insert({ ...resto, proyecto_id: proyectoId })
      }
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as MontoMensual
    },
    [refetch, proyectoSlug],
  )

  return { remuneraciones: data ?? [], loading, error, refetch, upsertRemuneracion }
}

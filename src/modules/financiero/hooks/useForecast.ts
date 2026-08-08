import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { ForecastPresupuesto } from '@/modules/financiero/types/financiero'

type ForecastInput = Pick<ForecastPresupuesto, 'presupuesto_id' | 'mes' | 'anio' | 'monto_forecast'>

export function useForecast(presupuestoId?: string) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `forecast:${proyectoSlug}:${presupuestoId ?? ''}` : null

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    let query = supabase
      .from('financiero_forecast_presupuesto')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio')
      .order('mes')
    if (presupuestoId) query = query.eq('presupuesto_id', presupuestoId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  }, [presupuestoId, proyectoSlug])

  // Sin realtime acá: cache 1min, la key ya incluye presupuestoId así que no
  // hace falta el contador de "última request" que evitaba el race al filtrar.
  const { data, loading, error, refetch } = useCachedQuery<ForecastPresupuesto[]>(cacheKey, fetcher, 60_000)

  // Un forecast por (presupuesto_id, mes, anio) — upsert evita duplicar la
  // fila si ya existe (choca con la UNIQUE de la migración 007).
  const upsertForecast = useCallback(
    async (input: ForecastInput) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error } = await supabase
        .from('financiero_forecast_presupuesto')
        .upsert({ ...input, proyecto_id: proyectoId }, { onConflict: 'presupuesto_id,mes,anio' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as ForecastPresupuesto
    },
    [refetch, proyectoSlug],
  )

  return { forecast: data ?? [], loading, error, refetch, upsertForecast }
}

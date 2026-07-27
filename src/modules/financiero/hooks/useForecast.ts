import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { ForecastPresupuesto } from '@/modules/financiero/types/financiero'

type ForecastInput = Pick<ForecastPresupuesto, 'presupuesto_id' | 'mes' | 'anio' | 'monto_forecast'>

export function useForecast(presupuestoId?: string) {
  const [forecast, setForecast] = useState<ForecastPresupuesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Si presupuestoId cambia justo después de montar (ej. de '' al id real),
  // el pedido anterior (sin filtro, más lento por traer más filas) puede
  // resolver DESPUÉS del nuevo y pisar el resultado correcto. Este contador
  // descarta cualquier respuesta que no sea la de la última request emitida.
  const ultimaRequestId = useRef(0)

  const refetch = useCallback(async () => {
    const idDeEstaRequest = ++ultimaRequestId.current
    setLoading(true)
    setError(null)
    let query = supabase
      .from('financiero_forecast_presupuesto')
      .select('*')
      .order('anio')
      .order('mes')
    if (presupuestoId) query = query.eq('presupuesto_id', presupuestoId)
    const { data, error } = await query
    if (idDeEstaRequest !== ultimaRequestId.current) return // llegó una request más nueva primero
    if (error) setError(error.message)
    else setForecast(data ?? [])
    setLoading(false)
  }, [presupuestoId])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Un forecast por (presupuesto_id, mes, anio) — upsert evita duplicar la
  // fila si ya existe (choca con la UNIQUE de la migración 007).
  const upsertForecast = useCallback(
    async (input: ForecastInput) => {
      const { data, error } = await supabase
        .from('financiero_forecast_presupuesto')
        .upsert(input, { onConflict: 'presupuesto_id,mes,anio' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as ForecastPresupuesto
    },
    [refetch],
  )

  return { forecast, loading, error, refetch, upsertForecast }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { EstadoResultadoDetallePartida } from '@/modules/financiero/types/financiero'

// Solo lectura: financiero_estado_resultado_detalle_mensual es una vista
// calculada (detalle por partida del Estado de Resultado agregado).
export function useEstadoResultadoDetalle() {
  const [detalle, setDetalle] = useState<EstadoResultadoDetallePartida[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_estado_resultado_detalle_mensual')
      .select('*')
      .order('anio')
      .order('mes')
    if (error) setError(error.message)
    else setDetalle(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel('financiero_estado_resultado_detalle_mensual')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_ordenes_compra' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_facturas' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_remuneraciones' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_gastos_directos' }, () => refetch())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  return { detalle, loading, error, refetch }
}

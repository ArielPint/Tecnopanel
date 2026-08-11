import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { EstadoResultadoMensual } from '@/modules/financiero/types/financiero'

// Solo lectura: financiero_estado_resultado_mensual es una vista calculada,
// se refresca sola ante cambios en facturas/remuneraciones/ingresos.
export function useEstadoResultado() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [estadoResultado, setEstadoResultado] = useState<EstadoResultadoMensual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`financiero_estado_resultado_mensual_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_estado_resultado_mensual')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio')
      .order('mes')
    if (error) setError(error.message)
    else setEstadoResultado(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_facturas' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_remuneraciones' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financiero_ingresos' }, () => refetch())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  return { estadoResultado, loading, error, refetch }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'

// Solo lectura: financiero_seguimiento_presupuesto es una vista calculada,
// se refresca sola ante cambios en OC/facturas (escucha esas dos tablas).
export function useSeguimiento() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [seguimiento, setSeguimiento] = useState<SeguimientoPresupuesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`financiero_seguimiento_presupuesto_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_seguimiento_presupuesto')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('codigo_articulo')
    if (error) setError(error.message)
    else setSeguimiento(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financiero_ordenes_compra' },
        () => refetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financiero_facturas' },
        () => refetch(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  return { seguimiento, loading, error, refetch }
}

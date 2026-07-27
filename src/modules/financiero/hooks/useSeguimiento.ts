import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'

// Solo lectura: financiero_seguimiento_presupuesto es una vista calculada,
// se refresca sola ante cambios en OC/facturas (escucha esas dos tablas).
export function useSeguimiento() {
  const [seguimiento, setSeguimiento] = useState<SeguimientoPresupuesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_seguimiento_presupuesto')
      .select('*')
      .order('codigo_articulo')
    if (error) setError(error.message)
    else setSeguimiento(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel('financiero_seguimiento_presupuesto')
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

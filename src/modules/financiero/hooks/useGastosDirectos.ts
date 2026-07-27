import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { GastoDirecto } from '@/modules/financiero/types/financiero'

type NuevoGasto = Pick<GastoDirecto, 'presupuesto_id' | 'mes' | 'anio' | 'monto' | 'observacion' | 'proveedor_rut'>

export function useGastosDirectos() {
  const [gastos, setGastos] = useState<GastoDirecto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_gastos_directos')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) setError(error.message)
    else setGastos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsertGasto = useCallback(
    async (input: NuevoGasto & { id?: string }) => {
      const { id, ...resto } = input
      const query = id
        ? supabase.from('financiero_gastos_directos').update(resto).eq('id', id)
        : supabase.from('financiero_gastos_directos').insert(resto)
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as GastoDirecto
    },
    [refetch],
  )

  return { gastos, loading, error, refetch, upsertGasto }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

type NuevoMonto = Pick<MontoMensual, 'mes' | 'anio' | 'monto' | 'observacion'>

export function useIngresos() {
  const [ingresos, setIngresos] = useState<MontoMensual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_ingresos')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) setError(error.message)
    else setIngresos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsertIngreso = useCallback(
    async (input: NuevoMonto & { id?: string }) => {
      const { id, ...resto } = input
      const query = id
        ? supabase.from('financiero_ingresos').update(resto).eq('id', id)
        : supabase.from('financiero_ingresos').insert(resto)
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as MontoMensual
    },
    [refetch],
  )

  return { ingresos, loading, error, refetch, upsertIngreso }
}

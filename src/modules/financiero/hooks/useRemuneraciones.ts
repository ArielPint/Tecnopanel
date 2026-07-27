import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

type NuevoMonto = {
  mes: number
  anio: number
  monto: number
  observacion: string | null
  categoria?: string
}

export function useRemuneraciones() {
  const [remuneraciones, setRemuneraciones] = useState<MontoMensual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_remuneraciones')
      .select('*')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) setError(error.message)
    else setRemuneraciones(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsertRemuneracion = useCallback(
    async (input: NuevoMonto & { id?: string }) => {
      const { id, ...resto } = input
      const query = id
        ? supabase.from('financiero_remuneraciones').update(resto).eq('id', id)
        : supabase.from('financiero_remuneraciones').insert(resto)
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as MontoMensual
    },
    [refetch],
  )

  return { remuneraciones, loading, error, refetch, upsertRemuneracion }
}

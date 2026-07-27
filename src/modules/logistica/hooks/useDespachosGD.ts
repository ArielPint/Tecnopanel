import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface DespachoGD {
  id: number
  fecha_gd: string | null
  fecha_despacho: string | null
  gd_numero: string | null
  modulo_nro_serie: string | null
  cantidad: number | null
  monto_neto: number | null
  modulo: string | null
  torre: string | null
  tipo: string | null
  avance: number | null
  created_by: string | null
  created_at: string | null
}

export type NuevoDespachoGD = Pick<
  DespachoGD,
  'fecha_gd' | 'fecha_despacho' | 'gd_numero' | 'modulo_nro_serie' | 'cantidad' | 'monto_neto' | 'modulo' | 'torre' | 'tipo' | 'avance'
>

export function useDespachosGD() {
  const [despachos, setDespachos] = useState<DespachoGD[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('despachos_gd').select('*').order('fecha_gd', { ascending: true }).order('id', { ascending: true })
    if (error) setError(error.message)
    else setDespachos((data ?? []) as DespachoGD[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel('logistica_despachos_gd')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despachos_gd' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crear = useCallback(
    async (input: NuevoDespachoGD, createdBy: string) => {
      const { error } = await supabase.from('despachos_gd').insert({ ...input, created_by: createdBy })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: number, input: NuevoDespachoGD) => {
      const { error } = await supabase.from('despachos_gd').update(input).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: number) => {
      const { error } = await supabase.from('despachos_gd').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { despachos, loading, error, refetch, crear, actualizar, eliminar }
}

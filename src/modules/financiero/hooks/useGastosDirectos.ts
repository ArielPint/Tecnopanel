import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { GastoDirecto } from '@/modules/financiero/types/financiero'

type NuevoGasto = Pick<GastoDirecto, 'presupuesto_id' | 'mes' | 'anio' | 'monto' | 'observacion' | 'proveedor_rut'>

export function useGastosDirectos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [gastos, setGastos] = useState<GastoDirecto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_gastos_directos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) setError(error.message)
    else setGastos(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsertGasto = useCallback(
    async (input: NuevoGasto & { id?: string }) => {
      const { id, ...resto } = input
      let query
      if (id) {
        query = supabase.from('financiero_gastos_directos').update(resto).eq('id', id)
      } else {
        const proyectoId = await getProyectoId(proyectoSlug!)
        query = supabase.from('financiero_gastos_directos').insert({ ...resto, proyecto_id: proyectoId })
      }
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as GastoDirecto
    },
    [refetch, proyectoSlug],
  )

  return { gastos, loading, error, refetch, upsertGasto }
}

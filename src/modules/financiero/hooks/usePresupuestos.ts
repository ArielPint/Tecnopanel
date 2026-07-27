import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Presupuesto } from '@/modules/financiero/types/financiero'

type NuevoPresupuesto = Pick<
  Presupuesto,
  'codigo_articulo' | 'nombre' | 'tarea_wip' | 'presupuesto_original' | 'valor_servicio'
>

export function usePresupuestos() {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('financiero_presupuestos')
      .select('*')
      .order('codigo_articulo')
    if (error) setError(error.message)
    else setPresupuestos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const createPresupuesto = useCallback(
    async (input: NuevoPresupuesto) => {
      const { data, error } = await supabase
        .from('financiero_presupuestos')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Presupuesto
    },
    [refetch],
  )

  const updatePresupuesto = useCallback(
    async (id: string, patch: Partial<NuevoPresupuesto & { activo: boolean }>) => {
      const { data, error } = await supabase
        .from('financiero_presupuestos')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Presupuesto
    },
    [refetch],
  )

  return { presupuestos, loading, error, refetch, createPresupuesto, updatePresupuesto }
}

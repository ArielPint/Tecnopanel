import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { Presupuesto } from '@/modules/financiero/types/financiero'

type NuevoPresupuesto = Pick<
  Presupuesto,
  'codigo_articulo' | 'nombre' | 'tarea_wip' | 'presupuesto_original' | 'valor_servicio'
>

export function usePresupuestos() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_presupuestos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('codigo_articulo')
    if (error) setError(error.message)
    else setPresupuestos(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const createPresupuesto = useCallback(
    async (input: NuevoPresupuesto) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error } = await supabase
        .from('financiero_presupuestos')
        .insert({ ...input, proyecto_id: proyectoId })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Presupuesto
    },
    [refetch, proyectoSlug],
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

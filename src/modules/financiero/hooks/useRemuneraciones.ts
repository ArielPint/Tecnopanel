import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

type NuevoMonto = {
  mes: number
  anio: number
  monto: number
  observacion: string | null
  categoria?: string
}

export function useRemuneraciones() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [remuneraciones, setRemuneraciones] = useState<MontoMensual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_remuneraciones')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) setError(error.message)
    else setRemuneraciones(data ?? [])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const upsertRemuneracion = useCallback(
    async (input: NuevoMonto & { id?: string }) => {
      const { id, ...resto } = input
      let query
      if (id) {
        query = supabase.from('financiero_remuneraciones').update(resto).eq('id', id)
      } else {
        const proyectoId = await getProyectoId(proyectoSlug!)
        query = supabase.from('financiero_remuneraciones').insert({ ...resto, proyecto_id: proyectoId })
      }
      const { data, error } = await query.select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as MontoMensual
    },
    [refetch, proyectoSlug],
  )

  return { remuneraciones, loading, error, refetch, upsertRemuneracion }
}

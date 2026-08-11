import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { Subcontrato } from '../types'

type NuevoSubcontrato = Pick<
  Subcontrato,
  'subcontratista_id' | 'especialidad' | 'responsable_interno_id' | 'monto_contractual' | 'documentacion_path' | 'estado'
>

export function useSubcontratos() {
  const [subcontratos, setSubcontratos] = useState<Subcontrato[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`subcontratos_la_chacra_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId('la-chacra')
    const { data, error } = await supabase
      .from('subcontratos')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setSubcontratos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontratos' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crear = useCallback(
    async (input: NuevoSubcontrato) => {
      const proyectoId = await getProyectoId('la-chacra')
      const { data, error } = await supabase
        .from('subcontratos')
        .insert({ ...input, proyecto_id: proyectoId })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Subcontrato
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: string, patch: Partial<NuevoSubcontrato>) => {
      const { error } = await supabase.from('subcontratos').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('subcontratos').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { subcontratos, loading, error, crear, actualizar, eliminar }
}

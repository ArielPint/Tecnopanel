import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Subcontratista } from '../types'

type NuevoSubcontratista = Pick<Subcontratista, 'nombre' | 'rut' | 'giro' | 'telefono' | 'email' | 'direccion' | 'notas' | 'activo'>

export function useSubcontratistas() {
  const [subcontratistas, setSubcontratistas] = useState<Subcontratista[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelNameRef = useRef(`subcontratistas_all_${Math.random().toString(36).slice(2)}`)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('subcontratistas').select('*').order('nombre')
    if (error) setError(error.message)
    else setSubcontratistas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcontratistas' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crear = useCallback(
    async (input: NuevoSubcontratista) => {
      const { data, error } = await supabase.from('subcontratistas').insert(input).select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Subcontratista
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: string, patch: Partial<NuevoSubcontratista>) => {
      const { error } = await supabase.from('subcontratistas').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('subcontratistas').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { subcontratistas, loading, error, crear, actualizar, eliminar }
}

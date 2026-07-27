import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface ItemSolicitud {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
  cantidad_real: number
  grupo: string
  cantidad_por_modulo: number | null
}

export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada' | 'usada'

export interface Solicitud {
  id: string
  numero: number
  usuario_id: string
  username: string
  nombre: string
  grupo_id: number | null
  responsable_id: number | null
  items: ItemSolicitud[]
  observacion: string | null
  estado: EstadoSolicitud
  created_at: string
}

export interface SolicitudInput {
  usuario_id: string
  username: string
  nombre: string
  grupo_id: number
  responsable_id: number
  items: ItemSolicitud[]
  observacion: string | null
  estado: EstadoSolicitud
}

export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false })
    if (!error) setSolicitudes((data ?? []) as Solicitud[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crear = useCallback(
    async (input: SolicitudInput) => {
      const { data, error } = await supabase.from('solicitudes').insert(input).select().single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Solicitud
    },
    [refetch],
  )

  const marcarUsada = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('solicitudes').update({ estado: 'usada' }).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('solicitudes').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { solicitudes, loading, crear, marcarUsada, eliminar }
}

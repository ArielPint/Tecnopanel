import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'

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
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (!error) setSolicitudes((data ?? []) as Solicitud[])
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crear = useCallback(
    async (input: SolicitudInput) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error } = await supabase
        .from('solicitudes')
        .insert({ ...input, proyecto_id: proyectoId })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Solicitud
    },
    [refetch, proyectoSlug],
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

  const actualizarItems = useCallback(
    async (id: string, items: ItemSolicitud[]) => {
      const { error } = await supabase.from('solicitudes').update({ items }).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { solicitudes, loading, crear, marcarUsada, eliminar, actualizarItems }
}

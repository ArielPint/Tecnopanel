import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'

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
  usada_en: string | null
}

export interface SolicitudInput {
  usuario_id: string
  username: string
  nombre: string
  grupo_id: number
  responsable_id: number | null
  items: ItemSolicitud[]
  observacion: string | null
  estado: EstadoSolicitud
}

export function useSolicitudes() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `solicitudes:${proyectoSlug}` : null

  const fetcher = useCallback(async (): Promise<Solicitud[]> => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as Solicitud[]
  }, [proyectoSlug])

  // Sin realtime: cache 60s + invalidación explícita tras mutación propia
  // (también invalidada cruzadamente desde useRegistroCompras al marcar 'usada').
  const { data, loading, refetch } = useCachedQuery<Solicitud[]>(cacheKey, fetcher, 60_000)
  const solicitudes = data ?? []

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
      const { error } = await supabase.from('solicitudes').update({ estado: 'usada', usada_en: new Date().toISOString() }).eq('id', id)
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

  // observacion opcional: solo se sobrescribe cuando se pasa explícitamente
  // (la edición desde Historial toca únicamente los items).
  const actualizarItems = useCallback(
    async (id: string, items: ItemSolicitud[], observacion?: string | null) => {
      const patch = observacion === undefined ? { items } : { items, observacion }
      const { error } = await supabase.from('solicitudes').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { solicitudes, loading, crear, marcarUsada, eliminar, actualizarItems }
}

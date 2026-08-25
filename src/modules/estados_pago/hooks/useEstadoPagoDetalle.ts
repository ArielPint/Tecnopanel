import { useCallback } from 'react'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { EstadoPagoDocumento, EstadoPagoHistorialItem, EstadoPagoItem } from '../types'

interface Detalle {
  documentos: EstadoPagoDocumento[]
  historial: EstadoPagoHistorialItem[]
  items: EstadoPagoItem[]
}

// Documentos + historial + ítems de un EP puntual — se cargan aparte de la lista
// principal (useEstadosPago) porque solo hacen falta al abrir el detalle.
// Sin realtime: cache 60s por estadoPagoId, refetch tras mutación propia.
export function useEstadoPagoDetalle(estadoPagoId: string | null) {
  const cacheKey = estadoPagoId ? `estado_pago_detalle:${estadoPagoId}` : null

  const fetcher = useCallback(async (): Promise<Detalle> => {
    const [docs, hist, items] = await Promise.all([
      unwrap(supabase.from('estados_pago_documentos').select('*').eq('estado_pago_id', estadoPagoId).order('created_at')),
      unwrap(supabase.from('estados_pago_historial').select('*').eq('estado_pago_id', estadoPagoId).order('created_at')),
      unwrap(supabase.from('estados_pago_modulos').select('*').eq('estado_pago_id', estadoPagoId)),
    ])
    return { documentos: docs ?? [], historial: hist ?? [], items: items ?? [] }
  }, [estadoPagoId])

  const { data, loading, refetch } = useCachedQuery<Detalle>(cacheKey, fetcher, 60_000)
  const documentos = estadoPagoId ? data?.documentos ?? [] : []
  const historial = estadoPagoId ? data?.historial ?? [] : []
  const items = estadoPagoId ? data?.items ?? [] : []

  const agregarDocumento = useCallback(
    async (nombre: string, storagePath: string) => {
      if (!estadoPagoId) return
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_documentos')
        .insert({ estado_pago_id: estadoPagoId, nombre, storage_path: storagePath, subido_por: userData.user?.id ?? null })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [estadoPagoId, refetch],
  )

  const eliminarDocumentoFila = useCallback(
    async (documentoId: string) => {
      const { error } = await supabase.from('estados_pago_documentos').delete().eq('id', documentoId)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { documentos, historial, items, loading: estadoPagoId ? loading : false, refetch, agregarDocumento, eliminarDocumentoFila }
}

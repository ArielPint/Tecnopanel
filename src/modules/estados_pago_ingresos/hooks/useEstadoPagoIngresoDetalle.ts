import { useCallback } from 'react'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { EstadoPagoIngresoDocumento, EstadoPagoIngresoHistorialItem } from '../types'

interface Detalle {
  documentos: EstadoPagoIngresoDocumento[]
  historial: EstadoPagoIngresoHistorialItem[]
}

// Documentos + historial de un EP puntual — se cargan aparte de la lista
// principal (useEstadosPagoIngresos) porque solo hacen falta al abrir el detalle.
// Sin realtime: cache 60s por estadoPagoIngresoId, refetch tras mutación propia.
export function useEstadoPagoIngresoDetalle(estadoPagoIngresoId: string | null) {
  const cacheKey = estadoPagoIngresoId ? `estado_pago_ingreso_detalle:${estadoPagoIngresoId}` : null

  const fetcher = useCallback(async (): Promise<Detalle> => {
    const [docs, hist] = await Promise.all([
      unwrap(supabase.from('estados_pago_ingresos_documentos').select('*').eq('estado_pago_ingreso_id', estadoPagoIngresoId).order('created_at')),
      unwrap(supabase.from('estados_pago_ingresos_historial').select('*').eq('estado_pago_ingreso_id', estadoPagoIngresoId).order('created_at')),
    ])
    return { documentos: docs ?? [], historial: hist ?? [] }
  }, [estadoPagoIngresoId])

  const { data, loading, refetch } = useCachedQuery<Detalle>(cacheKey, fetcher, 60_000)
  const documentos = estadoPagoIngresoId ? data?.documentos ?? [] : []
  const historial = estadoPagoIngresoId ? data?.historial ?? [] : []

  const agregarDocumento = useCallback(
    async (nombre: string, storagePath: string) => {
      if (!estadoPagoIngresoId) return
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('estados_pago_ingresos_documentos')
        .insert({ estado_pago_ingreso_id: estadoPagoIngresoId, nombre, storage_path: storagePath, subido_por: userData.user?.id ?? null })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [estadoPagoIngresoId, refetch],
  )

  const eliminarDocumentoFila = useCallback(
    async (documentoId: string) => {
      const { error } = await supabase.from('estados_pago_ingresos_documentos').delete().eq('id', documentoId)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { documentos, historial, loading: estadoPagoIngresoId ? loading : false, refetch, agregarDocumento, eliminarDocumentoFila }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { EstadoPagoDocumento, EstadoPagoHistorialItem } from '../types'

// Documentos + historial de un EP puntual — se cargan aparte de la lista
// principal (useEstadosPago) porque solo hacen falta al abrir el detalle.
export function useEstadoPagoDetalle(estadoPagoId: string | null) {
  const [documentos, setDocumentos] = useState<EstadoPagoDocumento[]>([])
  const [historial, setHistorial] = useState<EstadoPagoHistorialItem[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!estadoPagoId) {
      setDocumentos([])
      setHistorial([])
      return
    }
    setLoading(true)
    const [{ data: docs }, { data: hist }] = await Promise.all([
      supabase.from('estados_pago_documentos').select('*').eq('estado_pago_id', estadoPagoId).order('created_at'),
      supabase.from('estados_pago_historial').select('*').eq('estado_pago_id', estadoPagoId).order('created_at'),
    ])
    setDocumentos(docs ?? [])
    setHistorial(hist ?? [])
    setLoading(false)
  }, [estadoPagoId])

  useEffect(() => {
    refetch()
  }, [refetch])

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

  return { documentos, historial, loading, refetch, agregarDocumento, eliminarDocumentoFila }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type {
  EstadoResultadoDetallePartida,
  EstadoResultadoMensual,
  SeguimientoPresupuesto,
} from '@/modules/financiero/types/financiero'

export interface ReportesFinancieros {
  seguimiento: SeguimientoPresupuesto[]
  estadoResultado: EstadoResultadoMensual[]
  detalle: EstadoResultadoDetallePartida[]
  loading: boolean
  error: string | null
}

// v1 de Reportes (§3.6.1): reusa las 4 vistas de Financiero ya filtrables por proyecto_id
// (financiero_presupuestos_lookup no aporta nada nuevo para reporte, se omite acá).
// A diferencia de los hooks de Financiero (useSeguimiento.ts, etc.), este no lee
// useParams().proyectoSlug — Gestión no vive bajo /proyectos/:slug, el contexto lo elige
// el usuario con el selector de la pestaña Reportes.
export function useReportesFinancieros(proyectoId: string | null): ReportesFinancieros {
  const [seguimiento, setSeguimiento] = useState<SeguimientoPresupuesto[]>([])
  const [estadoResultado, setEstadoResultado] = useState<EstadoResultadoMensual[]>([])
  const [detalle, setDetalle] = useState<EstadoResultadoDetallePartida[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!proyectoId) {
      setSeguimiento([])
      setEstadoResultado([])
      setDetalle([])
      return
    }
    setLoading(true)
    setError(null)
    const [seg, er, det] = await Promise.all([
      supabase.from('financiero_seguimiento_presupuesto').select('*').eq('proyecto_id', proyectoId).order('codigo_articulo'),
      supabase.from('financiero_estado_resultado_mensual').select('*').eq('proyecto_id', proyectoId).order('anio').order('mes'),
      supabase
        .from('financiero_estado_resultado_detalle_mensual')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('anio')
        .order('mes'),
    ])
    const err = seg.error ?? er.error ?? det.error
    if (err) setError(err.message)
    else {
      setSeguimiento(seg.data ?? [])
      setEstadoResultado(er.data ?? [])
      setDetalle(det.data ?? [])
    }
    setLoading(false)
  }, [proyectoId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { seguimiento, estadoResultado, detalle, loading, error }
}

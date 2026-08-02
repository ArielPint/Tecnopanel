import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import type { AuditLogEntry } from '@/modules/financiero/types/financiero'

interface AuditFiltros {
  tablaAfectada?: string
  registroId?: string
  usuarioId?: string
}

export function useAudit(filtros: AuditFiltros = {}) {
  const { tablaAfectada, registroId, usuarioId } = filtros
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Evita que una request vieja (con otro filtro) resuelva después de una
  // más nueva y la pise.
  const ultimaRequestId = useRef(0)

  const refetch = useCallback(async () => {
    const idDeEstaRequest = ++ultimaRequestId.current
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    let query = supabase
      .from('financiero_audit_log')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('fecha', { ascending: false })
    if (tablaAfectada) query = query.eq('tabla_afectada', tablaAfectada)
    if (registroId) query = query.eq('registro_id', registroId)
    if (usuarioId) query = query.eq('usuario_id', usuarioId)
    const { data, error } = await query
    if (idDeEstaRequest !== ultimaRequestId.current) return
    if (error) setError(error.message)
    else setAuditLog(data ?? [])
    setLoading(false)
  }, [tablaAfectada, registroId, usuarioId, proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { auditLog, loading, error, refetch }
}

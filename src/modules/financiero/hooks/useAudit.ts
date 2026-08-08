import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { AuditLogEntry } from '@/modules/financiero/types/financiero'

interface AuditFiltros {
  tablaAfectada?: string
  registroId?: string
  usuarioId?: string
}

export function useAudit(filtros: AuditFiltros = {}) {
  const { tablaAfectada, registroId, usuarioId } = filtros
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug
    ? `audit:${proyectoSlug}:${tablaAfectada ?? ''}:${registroId ?? ''}:${usuarioId ?? ''}`
    : null

  const fetcher = useCallback(async () => {
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
    if (error) throw new Error(error.message)
    return data ?? []
  }, [tablaAfectada, registroId, usuarioId, proyectoSlug])

  // Sin realtime acá (audit log es de solo lectura, sin mutaciones propias):
  // cache 1min por combinación de filtros, la key ya distingue cada variante
  // así que no hace falta el contador de "última request" que evitaba el race.
  const { data, loading, error, refetch } = useCachedQuery<AuditLogEntry[]>(cacheKey, fetcher, 60_000)

  return { auditLog: data ?? [], loading, error, refetch }
}

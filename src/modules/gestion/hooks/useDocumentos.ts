import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface DocumentoItem {
  id: string
  nombre: string
  fecha: string | null
  fuente: string
  // 'link': abre `ref` directo. 'storage': genera signed URL contra `bucket`+`ref` (ref = storage path).
  apertura: { tipo: 'link'; ref: string } | { tipo: 'storage'; bucket: string; ref: string }
}

interface Estado {
  documentos: DocumentoItem[]
  loading: boolean
  error: string | null
}

async function documentosCrm(): Promise<DocumentoItem[]> {
  const [{ data: opDocs }, { data: ingDocs }] = await Promise.all([
    supabase
      .from('oportunidad_documentos')
      .select('id, nombre, tipo, url, created_at, oportunidad:oportunidades(codigo, nombre)')
      .order('created_at', { ascending: false }),
    supabase
      .from('archivos_ingenieria')
      .select('id, nombre, storage_path, created_at, oportunidad:oportunidades(codigo, nombre)')
      .order('created_at', { ascending: false }),
  ])

  const items: DocumentoItem[] = []
  for (const d of opDocs ?? []) {
    const opp = (Array.isArray(d.oportunidad) ? d.oportunidad[0] : d.oportunidad) as { codigo: string; nombre: string } | null
    items.push({
      id: d.id,
      nombre: `${d.nombre} — ${opp ? `${opp.codigo} ${opp.nombre}` : 'Oportunidad'}`,
      fecha: d.created_at,
      fuente: 'Oportunidad',
      apertura: d.tipo === 'link' ? { tipo: 'link', ref: d.url } : { tipo: 'storage', bucket: 'oportunidades', ref: d.url },
    })
  }
  for (const d of ingDocs ?? []) {
    const opp = (Array.isArray(d.oportunidad) ? d.oportunidad[0] : d.oportunidad) as { codigo: string; nombre: string } | null
    items.push({
      id: d.id,
      nombre: `${d.nombre} — ${opp ? `${opp.codigo} ${opp.nombre}` : 'Ingeniería'}`,
      fecha: d.created_at,
      fuente: 'Ingeniería',
      apertura: { tipo: 'storage', bucket: 'oportunidades', ref: d.storage_path },
    })
  }
  return items
}

async function documentosProyecto(proyectoId: string): Promise<DocumentoItem[]> {
  const { data } = await supabase
    .from('estados_pago_documentos')
    .select('id, nombre, storage_path, created_at, estado_pago:estados_pago!inner(numero_ep, proyecto_id)')
    .eq('estado_pago.proyecto_id', proyectoId)
    .order('created_at', { ascending: false })

  return (data ?? []).map((d) => {
    const ep = d.estado_pago as unknown as { numero_ep: string }
    return {
      id: d.id,
      nombre: `${d.nombre} — EP ${ep?.numero_ep ?? ''}`,
      fecha: d.created_at,
      fuente: 'Estado de Pago',
      apertura: { tipo: 'storage', bucket: 'estados-pago-docs', ref: d.storage_path },
    } satisfies DocumentoItem
  })
}

// v1 de Documentos (§3.6.3): agregador de solo lectura sobre las 3 tablas de adjuntos
// existentes, sin tabla/columna nueva — mismo patrón que Calendarización (JOIN en vez de
// proyecto_id nuevo). La carga real sigue viviendo en OportunidadDrawer/Estados de Pago.
export function useDocumentos(contexto: { tipo: 'crm' } | { tipo: 'proyecto'; proyectoId: string } | null): Estado {
  const [estado, setEstado] = useState<Estado>({ documentos: [], loading: false, error: null })

  const refetch = useCallback(async () => {
    if (!contexto) {
      setEstado({ documentos: [], loading: false, error: null })
      return
    }
    setEstado((s) => ({ ...s, loading: true, error: null }))
    try {
      const documentos = contexto.tipo === 'crm' ? await documentosCrm() : await documentosProyecto(contexto.proyectoId)
      setEstado({ documentos, loading: false, error: null })
    } catch (err) {
      setEstado({ documentos: [], loading: false, error: err instanceof Error ? err.message : 'Error al cargar documentos' })
    }
  }, [contexto?.tipo, contexto?.tipo === 'proyecto' ? contexto.proyectoId : null])

  useEffect(() => {
    refetch()
  }, [refetch])

  return estado
}

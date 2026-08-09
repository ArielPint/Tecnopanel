import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'

export interface PresupuestoLookup {
  id: string
  codigo_articulo: string
  nombre: string
  tarea_wip: string | null
}

// Vista mínima (sin montos) legible por cualquier autenticado — ver migración 015.
// Usar esta, no usePresupuestos, en formularios de OC/Facturas.
// Catálogo, cambia poco: cache 5min, sin invalidación por escritura (no hay mutaciones acá).
export function usePresupuestosLookup() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const { data, error } = await supabase
      .from('financiero_presupuestos_lookup')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('nombre')
    if (error) throw new Error(error.message)
    return data ?? []
  }, [proyectoSlug])

  const { data, loading } = useCachedQuery<PresupuestoLookup[]>(
    proyectoSlug ? `presupuestos_lookup:${proyectoSlug}` : null,
    fetcher,
    5 * 60_000,
  )

  return { presupuestos: data ?? [], loading }
}

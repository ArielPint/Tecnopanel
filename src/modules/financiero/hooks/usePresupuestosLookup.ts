import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'

export interface PresupuestoLookup {
  id: string
  codigo_articulo: string
  nombre: string
  tarea_wip: string | null
}

// Vista mínima (sin montos) legible por cualquier autenticado — ver migración 015.
// Usar esta, no usePresupuestos, en formularios de OC/Facturas.
export function usePresupuestosLookup() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [presupuestos, setPresupuestos] = useState<PresupuestoLookup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data } = await supabase
        .from('financiero_presupuestos_lookup')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('nombre')
      if (cancelado) return
      setPresupuestos(data ?? [])
      setLoading(false)
    })()
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return { presupuestos, loading }
}

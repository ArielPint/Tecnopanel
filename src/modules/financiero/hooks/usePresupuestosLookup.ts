import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface PresupuestoLookup {
  id: string
  codigo_articulo: string
  nombre: string
  tarea_wip: string | null
}

// Vista mínima (sin montos) legible por cualquier autenticado — ver migración 015.
// Usar esta, no usePresupuestos, en formularios de OC/Facturas.
export function usePresupuestosLookup() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoLookup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('financiero_presupuestos_lookup')
      .select('*')
      .order('nombre')
      .then(({ data }) => {
        setPresupuestos(data ?? [])
        setLoading(false)
      })
  }, [])

  return { presupuestos, loading }
}

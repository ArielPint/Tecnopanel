import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'

// Escribe los KPIs calculados desde el Excel al hub central (tabla project_kpis),
// que es lo que lee el Dashboard Tecnopanel (hub) para el resumen consolidado.
export function useSyncProjectKpis(valores: Record<string, number | null | undefined>, ready: boolean) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const valoresKey = JSON.stringify(valores)

  useEffect(() => {
    if (!ready || !proyectoSlug) return
    let cancelado = false
    async function sync() {
      const proyectoId = await getProyectoId(proyectoSlug!)
      if (cancelado) return
      const timestamp = new Date().toISOString()
      const rows = Object.entries(valores)
        .filter((e): e is [string, number] => e[1] != null)
        .map(([key, valor]) => ({ proyecto_id: proyectoId, key, valor, timestamp }))
      if (rows.length === 0) return
      await supabase.from('project_kpis').upsert(rows, { onConflict: 'proyecto_id,key' })
    }
    sync()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoSlug, ready, valoresKey])
}

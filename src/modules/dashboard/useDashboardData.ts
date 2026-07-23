import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto, ProjectKpi } from './types'

interface DashboardData {
  proyectos: Proyecto[]
  kpisPorProyecto: Record<string, ProjectKpi[]>
  loading: boolean
  error: string | null
}

export function useDashboardData(): DashboardData {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [kpisPorProyecto, setKpisPorProyecto] = useState<Record<string, ProjectKpi[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: proyectosData, error: proyectosError } = await supabase
        .from('proyectos')
        .select('*')
        .order('nombre')

      if (proyectosError) {
        if (!cancelled) {
          setError(proyectosError.message)
          setLoading(false)
        }
        return
      }

      const { data: kpisData, error: kpisError } = await supabase
        .from('project_kpis')
        .select('*')
        .order('timestamp', { ascending: false })

      if (kpisError) {
        if (!cancelled) {
          setError(kpisError.message)
          setLoading(false)
        }
        return
      }

      if (!cancelled) {
        const grouped: Record<string, ProjectKpi[]> = {}
        for (const kpi of kpisData ?? []) {
          if (!grouped[kpi.proyecto_id]) grouped[kpi.proyecto_id] = []
          grouped[kpi.proyecto_id].push(kpi)
        }
        setProyectos(proyectosData ?? [])
        setKpisPorProyecto(grouped)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { proyectos, kpisPorProyecto, loading, error }
}

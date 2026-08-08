import { useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { Proyecto, ProjectKpi } from './types'

interface DashboardData {
  proyectos: Proyecto[]
  kpisPorProyecto: Record<string, ProjectKpi[]>
  loading: boolean
  error: string | null
}

interface DashboardRaw {
  proyectos: Proyecto[]
  kpisPorProyecto: Record<string, ProjectKpi[]>
}

// Global (todos los proyectos, sin scope por proyectoSlug). Sin realtime y sin
// mutaciones propias acá — cache 60s.
export function useDashboardData(): DashboardData {
  const fetcher = useCallback(async (): Promise<DashboardRaw> => {
    const { data: proyectosData, error: proyectosError } = await supabase.from('proyectos').select('*').order('nombre')
    if (proyectosError) throw new Error(proyectosError.message)

    const { data: kpisData, error: kpisError } = await supabase
      .from('project_kpis')
      .select('*')
      .order('timestamp', { ascending: false })
    if (kpisError) throw new Error(kpisError.message)

    const grouped: Record<string, ProjectKpi[]> = {}
    for (const kpi of kpisData ?? []) {
      if (!grouped[kpi.proyecto_id]) grouped[kpi.proyecto_id] = []
      grouped[kpi.proyecto_id].push(kpi)
    }
    return { proyectos: proyectosData ?? [], kpisPorProyecto: grouped }
  }, [])

  const { data, loading, error } = useCachedQuery<DashboardRaw>('dashboard_data', fetcher, 60_000)

  return {
    proyectos: data?.proyectos ?? [],
    kpisPorProyecto: data?.kpisPorProyecto ?? {},
    loading,
    error,
  }
}

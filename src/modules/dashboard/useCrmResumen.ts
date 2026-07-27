import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface CrmResumen {
  oportunidadesAbiertas: number
  montoGanadoMes: number
  tasaConversion: number
  pipelineMonto: number
  loading: boolean
}

interface OppRow {
  etapa_actual: string
  monto_estimado: number | null
  updated_at: string
}

// CRM ya vive en la misma base que el hub (fusión completa) — calcula estos
// KPIs directo de `oportunidades` en vez de esperar la tabla project_kpis,
// que dependía de un sync (Fase 3) que nunca se implementó y quedó vacía.
// Mismas fórmulas que modules/crm/pages/Dashboard.tsx.
export function useCrmResumen(): CrmResumen {
  const [data, setData] = useState({
    oportunidadesAbiertas: 0,
    montoGanadoMes: 0,
    tasaConversion: 0,
    pipelineMonto: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('oportunidades')
      .select('etapa_actual, monto_estimado, updated_at')
      .then(({ data: opps }) => {
        if (cancelled) return
        const rows = (opps ?? []) as OppRow[]
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

        const activas = rows.filter((o) => !['Ganado', 'Perdido'].includes(o.etapa_actual))
        const pipelineMonto = activas.reduce((s, o) => s + (o.monto_estimado ?? 0), 0)

        const ganadasMes = rows.filter((o) => o.etapa_actual === 'Ganado' && new Date(o.updated_at) >= startOfMonth)
        const montoGanadoMes = ganadasMes.reduce((s, o) => s + (o.monto_estimado ?? 0), 0)

        const ganadas = rows.filter((o) => o.etapa_actual === 'Ganado').length
        const perdidas = rows.filter((o) => o.etapa_actual === 'Perdido').length
        const tasaConversion = ganadas + perdidas > 0 ? Math.round((ganadas / (ganadas + perdidas)) * 100) : 0

        setData({ oportunidadesAbiertas: activas.length, montoGanadoMes, tasaConversion, pipelineMonto })
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { ...data, loading }
}

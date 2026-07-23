import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto, ProjectKpi } from '../dashboard/types'
import { KPI_LABELS } from '../dashboard/types'
import KpiCard from '../dashboard/KpiCard'
import ProjectChart from '../dashboard/ProjectChart'

// El CRM es un sistema de gestión interna de Tecnopanel (tipo Salesforce),
// no una obra/proyecto de construcción — por eso vive en su propia sección
// "Gestión" del sidebar en vez de en /proyectos.
export default function CrmPage() {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [kpis, setKpis] = useState<ProjectKpi[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: proyectoData } = await supabase
        .from('proyectos')
        .select('*')
        .ilike('tipo', 'crm')
        .maybeSingle()

      if (cancelled) return

      if (proyectoData) {
        const { data: kpisData } = await supabase
          .from('project_kpis')
          .select('*')
          .eq('proyecto_id', proyectoData.id)
          .order('timestamp', { ascending: false })

        if (!cancelled) setKpis(kpisData ?? [])
      }

      if (!cancelled) {
        setProyecto(proyectoData ?? null)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-sm text-gray-500 dark:text-white/50">Cargando…</p>

  if (!proyecto) {
    return (
      <p className="text-sm text-gray-500 dark:text-white/50">
        El sistema CRM aún no está registrado en el hub.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">CRM Tecnopanel</h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          Sistema de gestión comercial interno de la empresa — no es una obra ni un proyecto de
          construcción, por lo que se gestiona aparte de la sección Proyectos.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-neutral-800 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{proyecto.nombre}</h2>
            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-white/40">{proyecto.estado}</p>
          </div>
          {proyecto.url_app && (
            <a
              href={proyecto.url_app}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-tecnopanel hover:text-tecnopanel-hover hover:underline"
            >
              Abrir CRM →
            </a>
          )}
        </div>

        {kpis.length === 0 ? (
          <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-500 dark:bg-white/5 dark:text-white/50">
            Sin datos aún — la sincronización automática de KPIs (Fase 3) todavía no está
            implementada para este sistema.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.id} label={KPI_LABELS[kpi.key] ?? kpi.key} value={kpi.valor} />
              ))}
            </div>
            <ProjectChart kpis={kpis} />
          </>
        )}
      </section>
    </div>
  )
}

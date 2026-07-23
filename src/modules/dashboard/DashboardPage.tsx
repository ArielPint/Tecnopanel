import { useDashboardData } from './useDashboardData'
import { KPI_LABELS } from './types'
import KpiCard from './KpiCard'
import ProjectChart from './ProjectChart'

export default function DashboardPage() {
  const { proyectos, kpisPorProyecto, loading, error } = useDashboardData()

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando dashboard…</p>
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error al cargar datos: {error}
      </div>
    )
  }

  // El CRM es un sistema de gestión interna (tipo Salesforce), no una obra de
  // Tecnopanel, así que se muestra en su propia sección — igual que en el
  // menú, donde vive bajo "Gestión" y no bajo "Proyectos".
  const proyectosConstruccion = proyectos.filter((p) => p.tipo?.toLowerCase() !== 'crm')
  const sistemasGestion = proyectos.filter((p) => p.tipo?.toLowerCase() === 'crm')

  function renderProyecto(proyecto: (typeof proyectos)[number]) {
    const kpis = kpisPorProyecto[proyecto.id] ?? []
    return (
      <section key={proyecto.id} className="rounded-lg border bg-white p-5 shadow-sm dark:bg-neutral-800 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{proyecto.nombre}</h2>
            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-white/40">{proyecto.tipo}</p>
          </div>
          {proyecto.url_app && (
            <a
              href={proyecto.url_app}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-tecnopanel hover:text-tecnopanel-hover hover:underline"
            >
              Abrir app →
            </a>
          )}
        </div>

        {kpis.length === 0 ? (
          <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-500 dark:bg-white/5 dark:text-white/50">
            Sin datos aún — la sincronización automática de KPIs (Fase 3) todavía no está
            implementada para este proyecto.
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
    )
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Dashboard Tecnopanel</h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          Vista consolidada de La Chacra y CRM. Todos los usuarios autenticados ven todos los
          proyectos en esta versión (el filtrado por rol llega en la Fase 4 — Admin Panel).
        </p>
      </div>

      {proyectos.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-white/50">Aún no hay proyectos cargados en el hub.</p>
      )}

      {proyectosConstruccion.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">Proyectos</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {proyectosConstruccion.map(renderProyecto)}
          </div>
        </div>
      )}

      {sistemasGestion.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
            Gestión interna
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {sistemasGestion.map(renderProyecto)}
          </div>
        </div>
      )}
    </div>
  )
}

import { Building2, CheckCircle2, Clock, LineChart, Receipt, Target, TrendingUp, Truck, Lock, ArrowRight } from 'lucide-react'
import { Navigate, Link } from 'react-router-dom'
import { useDashboardData } from './useDashboardData'
import { useCrmResumen } from './useCrmResumen'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { KPI_LABELS } from './types'
import KpiCard from './KpiCard'
import { fmtM } from '@/modules/planta/lib/format'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/financiero/components/ui/table'

function findKpi(kpis: { key: string; valor: number }[] | undefined, key: string): number | undefined {
  return kpis?.find((k) => k.key === key)?.valor
}

function aggregate(
  kpisPorProyecto: Record<string, { key: string; valor: number }[]>,
  proyectoIds: string[],
  key: string,
  mode: 'sum' | 'avg'
): number | undefined {
  const values = proyectoIds.map((id) => findKpi(kpisPorProyecto[id], key)).filter((v): v is number => v != null)
  if (values.length === 0) return undefined
  const sum = values.reduce((a, b) => a + b, 0)
  return mode === 'sum' ? sum : sum / values.length
}

function PercentBar({ value }: { value: number | undefined }) {
  if (value == null) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] w-14 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="font-mono-tabular text-[12.5px] text-muted-foreground">{Math.round(value)}%</span>
    </div>
  )
}

// Orden de prioridad de aterrizaje para 'solo_proyecto' — el primero al que el usuario
// tenga acceso real (módulo habilitado en el proyecto + permiso). 'dashboard' ya no se
// asume por defecto: un usuario con solo 'solicitudes' rebotaba sin acceso (ver DashboardPlantaGate).
const MODULOS_ATERRIZAJE: { modulo: string; ruta: string }[] = [
  { modulo: 'dashboard', ruta: 'dashboard' },
  { modulo: 'obra', ruta: 'obra' },
  { modulo: 'produccion', ruta: 'produccion' },
  { modulo: 'logistica', ruta: 'logistica' },
  { modulo: 'solicitudes', ruta: 'solicitudes' },
  { modulo: 'financiero', ruta: 'financiero' },
  { modulo: 'estados_pago', ruta: 'estados-pago' },
]

export default function DashboardPage() {
  const acceso = useAccesoUsuario()
  const { proyectos, kpisPorProyecto, loading, error } = useDashboardData()
  const crmResumen = useCrmResumen()
  const soloProyectoSlug =
    acceso.escenario === 'solo_proyecto' && acceso.proyectosObra.length === 1 ? acceso.proyectosObra[0].slug : ''
  const permisosSoloProyecto = usePermisosProyecto(soloProyectoSlug)

  if (acceso.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (acceso.escenario === 'solo_crm') {
    return <Navigate to="/crm" replace />
  }

  if (acceso.escenario === 'solo_proyecto') {
    // Si tiene más de un proyecto obra (futuro, hoy siempre 1), manda al selector /proyectos en vez de adivinar cuál.
    if (!soloProyectoSlug) return <Navigate to="/proyectos" replace />
    if (permisosSoloProyecto.loading) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          Cargando…
        </div>
      )
    }
    const aterrizaje = MODULOS_ATERRIZAJE.find((m) => permisosSoloProyecto.tieneAccion(m.modulo))
    // Sin ningún módulo del listado con acceso real, no hay ruta segura a la que mandarlo
    // dentro del proyecto (asumir 'dashboard' repetía el mismo dead-end que este listado
    // existe para evitar) — al selector de proyectos en vez de adivinar.
    if (!aterrizaje) return <Navigate to="/proyectos" replace />
    return <Navigate to={`/proyectos/${soloProyectoSlug}/${aterrizaje.ruta}`} replace />
  }

  if (acceso.escenario === 'sin_acceso') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-bold">Sin acceso</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu cuenta no tiene módulos ni proyectos asignados. Contacta a un administrador para que te habilite el acceso.
        </p>
      </div>
    )
  }

  if (acceso.escenario === 'selector_portales') {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4">
        <div>
          <h1 className="text-lg font-bold">¿A dónde quieres ingresar?</h1>
          <p className="text-sm text-muted-foreground">Tienes acceso a más de un portal.</p>
        </div>
        {acceso.proyectosObra.map((p) => (
          <Link
            key={p.id}
            to={`/proyectos/${p.slug}/dashboard`}
            className="flex items-center justify-between rounded-md border bg-white p-4 text-sm font-medium hover:bg-muted dark:bg-neutral-800"
          >
            {p.nombre}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ))}
        <Link
          to="/crm"
          className="flex items-center justify-between rounded-md border bg-white p-4 text-sm font-medium hover:bg-muted dark:bg-neutral-800"
        >
          CRM Tecnopanel
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar datos: {error}
      </div>
    )
  }

  // 'sistema' es el pseudo-proyecto ancla del módulo Gestión (§3.6) — no es una obra real, se excluye
  // igual que 'crm' (mismo criterio que ProyectosPage.rutaInterna: 'construccion'/'custom' sí son obra).
  const proyectosConstruccion = proyectos.filter((p) => !['crm', 'sistema'].includes(p.tipo?.toLowerCase() ?? ''))
  const construccionIds = proyectosConstruccion.map((p) => p.id)

  const laChacraKpis = {
    avance_fisico: aggregate(kpisPorProyecto, construccionIds, 'avance_fisico', 'avg'),
    avance_economico: aggregate(kpisPorProyecto, construccionIds, 'avance_economico', 'avg'),
    modulos_terminados: aggregate(kpisPorProyecto, construccionIds, 'modulos_terminados', 'sum'),
    modulos_despachados: aggregate(kpisPorProyecto, construccionIds, 'modulos_despachados', 'sum'),
    modulos_en_proceso: aggregate(kpisPorProyecto, construccionIds, 'modulos_en_proceso', 'sum'),
    compras_total: aggregate(kpisPorProyecto, construccionIds, 'compras_total', 'sum'),
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-extrabold">Dashboard Tecnopanel</h1>
        <p className="text-sm text-muted-foreground">Vista consolidada de proyectos y CRM.</p>
      </div>

      <section aria-label="Indicadores Proyectos" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <span className="h-[7px] w-[7px] rounded-full bg-info" />
            Indicadores Proyectos
          </div>
          <IndicadoresFecha />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={Building2} tone="brand" label={KPI_LABELS.avance_fisico} value={laChacraKpis.avance_fisico} format="percent" loading={loading} />
          <KpiCard icon={TrendingUp} tone="info" label={KPI_LABELS.avance_economico} value={laChacraKpis.avance_economico} format="percent" loading={loading} />
          <KpiCard icon={CheckCircle2} tone="success" label={KPI_LABELS.modulos_terminados} value={laChacraKpis.modulos_terminados} loading={loading} />
          <KpiCard icon={Truck} tone="purple" label={KPI_LABELS.modulos_despachados} value={laChacraKpis.modulos_despachados} loading={loading} />
          <KpiCard icon={Clock} tone="warning" label={KPI_LABELS.modulos_en_proceso} value={laChacraKpis.modulos_en_proceso} loading={loading} />
          <KpiCard icon={Receipt} tone="info" label={KPI_LABELS.compras_total} value={laChacraKpis.compras_total} format="currency" loading={loading} />
        </div>
      </section>

      <section aria-label="Indicadores CRM" className="space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="h-[7px] w-[7px] rounded-full bg-brand" />
          Indicadores CRM
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard icon={Target} tone="warning" label={KPI_LABELS.oportunidades_abiertas} value={crmResumen.oportunidadesAbiertas} loading={crmResumen.loading} />
          <KpiCard icon={TrendingUp} tone="success" label={KPI_LABELS.monto_ganado_mes} value={crmResumen.montoGanadoMes} format="currency" loading={crmResumen.loading} />
          <KpiCard icon={LineChart} tone="brand" label={KPI_LABELS.tasa_conversion} value={crmResumen.tasaConversion} format="percent" loading={crmResumen.loading} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Proyectos</CardTitle>
          <CardDescription>Avance por proyecto</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : proyectosConstruccion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay proyectos cargados en el portal.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Avance físico</TableHead>
                  <TableHead>Avance económico</TableHead>
                  <TableHead className="text-right">Terminados</TableHead>
                  <TableHead className="text-right">Despachados</TableHead>
                  <TableHead className="text-right">En proceso</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proyectosConstruccion.map((p) => {
                  const kpis = kpisPorProyecto[p.id]
                  const compras = findKpi(kpis, 'compras_total')
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-bold">
                        <Link to={`/proyectos/${p.slug}/dashboard`} className="hover:underline hover:text-brand">
                          {p.nombre}
                        </Link>
                      </TableCell>
                      <TableCell><PercentBar value={findKpi(kpis, 'avance_fisico')} /></TableCell>
                      <TableCell><PercentBar value={findKpi(kpis, 'avance_economico')} /></TableCell>
                      <TableCell className="text-right font-mono-tabular">{findKpi(kpis, 'modulos_terminados') ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{findKpi(kpis, 'modulos_despachados') ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{findKpi(kpis, 'modulos_en_proceso') ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono-tabular">
                        {compras == null ? '—' : `$${(compras / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Link to="/crm" className="hover:underline hover:text-brand">CRM Tecnopanel</Link>
          </CardTitle>
          <CardDescription>Pipeline de oportunidades</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {crmResumen.loading ? (
            <div className="h-10 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{fmtM(crmResumen.pipelineMonto)}</span> en pipeline activo
              {' · '}
              <span className="font-bold text-foreground">{crmResumen.oportunidadesAbiertas}</span> oportunidad
              {crmResumen.oportunidadesAbiertas !== 1 ? 'es' : ''} abierta{crmResumen.oportunidadesAbiertas !== 1 ? 's' : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

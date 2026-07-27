import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtM, fmtPr } from '../lib/format'
import {
  AvanceEconomicoAcumChart,
  AvanceEconomicoChart,
  ComprasVsPresupuestoChart,
  CrecimientoMensualTabla,
  DistribucionModulosChart,
  M2AcumuladoChart,
} from '../components/ResumenCharts'

interface Kpi {
  label: string
  value: string
  sub?: string
  tono?: 'success' | 'warning' | 'destructive'
}

function KpiCards({ kpis }: { kpis: ReturnType<typeof useResumenData>['kpis'] }) {
  const items: Kpi[] = [
    {
      label: 'Ejecución ppto',
      value: kpis.ejecucionPpto != null ? fmtPr(kpis.ejecucionPpto) : '—',
      tono: kpis.ejecucionSobrePresupuesto ? 'destructive' : 'success',
    },
    { label: '% Avance físico', value: fmtPr(kpis.avanceFisico) },
    { label: 'Total comprado', value: fmtM(kpis.totalComprado) },
    {
      label: 'Módulos terminados',
      value: fmt(kpis.modulosTerminados),
      sub: kpis.pctTerminados != null ? `${fmtPr(kpis.pctTerminados)} del total` : undefined,
      tono: 'success',
    },
    { label: 'Módulos en proceso', value: fmt(kpis.modulosEnProceso), tono: 'warning' },
    {
      label: 'Módulos despachados',
      value: fmt(kpis.modulosDespachados),
      sub: kpis.totalModulos ? `${fmtPr(kpis.pctDespachados)} del total` : undefined,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p
            className={
              'mt-1 text-2xl font-bold tabular-nums ' +
              (kpi.tono === 'success' ? 'text-success' : kpi.tono === 'warning' ? 'text-warning' : kpi.tono === 'destructive' ? 'text-destructive' : '')
            }
          >
            {kpi.value}
          </p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

export default function Resumen({ excelData }: { excelData: ParsedDashboardData }) {
  const resumen = useResumenData(excelData)

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCards kpis={resumen.kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Distribución de módulos por avance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DistribucionModulosChart data={resumen.distribucionBuckets} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">M² acumulado real vs. programado</CardTitle>
          </CardHeader>
          <CardContent>
            <M2AcumuladoChart data={resumen.m2Acumulado} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Compras reales vs. presupuesto por mes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ComprasVsPresupuestoChart data={resumen.comprasVsPresupuesto} />
          <CrecimientoMensualTabla data={resumen.crecimientoMensual} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoChart data={resumen.avanceEconomico} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoAcumChart data={resumen.avanceEconomicoAcumulado} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

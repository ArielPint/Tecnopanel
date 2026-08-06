import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import { useDespachosData } from '../hooks/useDespachosData'
import { useCurvaData } from '../hooks/useCurvaData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtPr } from '../lib/format'
import { AvanceEconomicoAcumChart, AvanceEconomicoChart } from '../components/ResumenCharts'
import { DespachosDiarioChart } from '../components/DespachosCharts'
import { TiempoTorreChart } from '../components/CurvaCharts'
import { cn } from '@/lib/utils'

export default function Ejecutivo({ excelData }: { excelData: ParsedDashboardData }) {
  const resumen = useResumenData(excelData)
  const despachos = useDespachosData(excelData)
  const curva = useCurvaData(excelData)

  const items = [
    {
      label: 'Avance económico %',
      value: resumen.kpis.ejecucionPpto != null ? fmtPr(resumen.kpis.ejecucionPpto) : '—',
      tono: resumen.kpis.ejecucionSobrePresupuesto ? ('destructive' as const) : ('success' as const),
    },
    { label: 'Módulos terminados', value: fmt(resumen.kpis.modulosTerminados), tono: 'success' as const },
    { label: 'Módulos despachados', value: fmt(resumen.kpis.modulosDespachados) },
    { label: 'Módulos en proceso', value: fmt(resumen.kpis.modulosEnProceso), tono: 'warning' as const },
  ]

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4">
            <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', kpi.tono === 'success' && 'text-success', kpi.tono === 'warning' && 'text-warning', kpi.tono === 'destructive' && 'text-destructive')}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoChart data={resumen.avanceEconomico} readOnly />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoAcumChart data={resumen.avanceEconomicoAcumulado} forecastLabels={resumen.forecastLabels} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Despachos diarios acumulados</CardTitle>
          </CardHeader>
          <CardContent>
            <DespachosDiarioChart data={despachos.diario} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Tiempo real vs proyectado por torre</CardTitle>
          </CardHeader>
          <CardContent>
            <TiempoTorreChart data={curva.torreTiempo} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

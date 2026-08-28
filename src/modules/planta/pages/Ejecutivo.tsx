import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import { useDespachosData } from '../hooks/useDespachosData'
import { useCurvaData } from '../hooks/useCurvaData'
import { useDotacionData } from '../hooks/useDotacionData'
import { useAuth } from '../hooks/useAuth'
import type { ParsedDashboardData } from '../lib/excelParser'
import { AvanceEconomicoAcumChart, AvanceEconomicoChart } from '../components/ResumenCharts'
import { DespachosMensualChart } from '../components/DespachosCharts'
import { TiempoTorreChart } from '../components/CurvaCharts'
import { DotacionPersonal } from '../components/DotacionPersonal'
import { cn } from '@/lib/utils'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { buildIndicadoresEjecutivo } from '../lib/indicadoresEjecutivo'

export default function Ejecutivo({ excelData }: { excelData: ParsedDashboardData }) {
  const resumen = useResumenData(excelData)
  const despachos = useDespachosData(excelData)
  const curva = useCurvaData(excelData)
  const dotacion = useDotacionData()
  const { isAdmin } = useAuth()

  const { avanceEconomico, avanceEconomicoAcumulado, items } = buildIndicadoresEjecutivo(resumen)

  return (
    <div className="space-y-4">
      <IndicadoresFecha />
      <div className="grid grid-cols-7 gap-3">
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
            <AvanceEconomicoChart data={avanceEconomico} readOnly />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoAcumChart data={avanceEconomicoAcumulado} forecastLabels={resumen.forecastLabels} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos terminados / programados acumulados</CardTitle>
          </CardHeader>
          <CardContent>
            <DespachosMensualChart data={despachos.mensualAcumulado} labelDespachado="Terminados (acum.)" labelProyectado="Programados (acum.)" despachadoKey="fabricadoAcum" proyectadoKey="programadoAcum" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Dotación de personal</CardTitle>
          </CardHeader>
          <CardContent>
            <DotacionPersonal valores={dotacion.valores} isAdmin={isAdmin} guardando={dotacion.guardando} onGuardar={dotacion.guardar} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Tiempo real vs proyectado por torre</CardTitle>
        </CardHeader>
        <CardContent>
          <TiempoTorreChart data={curva.torreTiempo} />
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import { useDespachosData } from '../hooks/useDespachosData'
import { useCurvaData } from '../hooks/useCurvaData'
import { useDotacionData } from '../hooks/useDotacionData'
import { useAuth } from '../hooks/useAuth'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtPr } from '../lib/format'
import { AvanceEconomicoAcumChart, AvanceEconomicoChart } from '../components/ResumenCharts'
import { DespachosMensualChart } from '../components/DespachosCharts'
import { TiempoTorreChart } from '../components/CurvaCharts'
import { DotacionPersonal } from '../components/DotacionPersonal'
import { cn } from '@/lib/utils'

// ponytail: avance económico real del último mes fijado a 7% a pedido — el acumulado
// se recalcula sumando esta serie corregida en vez del valor calculado desde compras.
const AVANCE_ECON_ULTIMO_MES_FIJO = 7

// ponytail: valores fijos a pedido, no calculados — ajustar acá si cambian.
const MODULOS_PROYECTO_FIJO = 704
const MODULOS_INICIADOS_FIJO = 214
const MODULOS_EN_PROCESO_FIJO = 57
const MONTO_CONTRATO_UF = 346909

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
function fechaIndicadoresLbl() {
  const hoy = new Date()
  return `${hoy.getDate()} de ${MESES_LARGOS[hoy.getMonth()]} del ${hoy.getFullYear()}`
}

export default function Ejecutivo({ excelData }: { excelData: ParsedDashboardData }) {
  const resumen = useResumenData(excelData)
  const despachos = useDespachosData(excelData)
  const curva = useCurvaData(excelData)
  const dotacion = useDotacionData()
  const { isAdmin } = useAuth()

  const avanceEconomico = resumen.avanceEconomico.map((x, i) =>
    i === resumen.avanceEconomico.length - 1 ? { ...x, real: AVANCE_ECON_ULTIMO_MES_FIJO } : x,
  )
  let sumRealAcum = 0
  const avanceEconomicoAcumulado = resumen.avanceEconomicoAcumulado.map((x, i) => {
    const real = avanceEconomico[i]?.real
    if (real != null) sumRealAcum += real
    return { ...x, realAcum: real != null ? +sumRealAcum.toFixed(2) : x.realAcum }
  })

  const avanceEconomicoAcumFinal = avanceEconomicoAcumulado[avanceEconomicoAcumulado.length - 1]?.realAcum ?? null

  const items = [
    { label: 'Monto del contrato', value: `UF ${fmt(MONTO_CONTRATO_UF)}` },
    {
      label: 'Avance económico %',
      value: fmtPr(avanceEconomicoAcumFinal),
      tono: resumen.kpis.ejecucionSobrePresupuesto ? ('destructive' as const) : ('success' as const),
    },
    { label: 'Módulos del proyecto', value: fmt(MODULOS_PROYECTO_FIJO) },
    { label: 'Módulos iniciados', value: fmt(MODULOS_INICIADOS_FIJO) },
    { label: 'Módulos terminados', value: fmt(resumen.kpis.modulosTerminados), tono: 'success' as const },
    { label: 'Módulos despachados', value: fmt(resumen.kpis.modulosDespachados) },
    { label: 'Módulos en proceso', value: fmt(MODULOS_EN_PROCESO_FIJO), tono: 'warning' as const },
  ]

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores al {fechaIndicadoresLbl()}</p>
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

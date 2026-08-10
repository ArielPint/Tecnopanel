import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import { useDespachosData } from '../hooks/useDespachosData'
import { useSyncProjectKpis } from '../hooks/useSyncProjectKpis'
import { useAuth } from '../hooks/useAuth'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtM, fmtPr } from '../lib/format'
import {
  AvanceEconomicoAcumChart,
  AvanceEconomicoChart,
  ComprasVsPresupuestoChart,
  CrecimientoMensualTabla,
  DespachosPorMesChart,
  DiferenciaAvanceEconFisicoAcumChart,
  DiferenciaAvanceEconFisicoChart,
  DistribucionModulosChart,
  M2AcumuladoChart,
  ModulosIniciadosPorMesChart,
  ModulosTerminadosPorMesChart,
  SalidaGalponPorMesChart,
} from '../components/ResumenCharts'

// ponytail: M2 acumulado oculto a pedido, dejar false hasta nuevo aviso
const MOSTRAR_M2_ACUMULADO = false

const SECCIONES = [
  { key: 'kpis', label: 'Indicadores' },
  { key: 'avanceEconomico', label: 'Avance económico mensual' },
  { key: 'avanceEconomicoAcum', label: 'Avance económico acumulado' },
  { key: 'comprasVsPresupuesto', label: 'Compras reales vs. presupuesto' },
  { key: 'distribucionModulos', label: 'Distribución de módulos' },
  { key: 'diferenciaAcum', label: 'Diferencia avance económico vs. físico (acumulado)' },
  { key: 'diferenciaMensualOM2', label: 'Diferencia avance económico vs. físico (mensual) / M² acumulado' },
  { key: 'despachosPorMes', label: 'Despachos por mes' },
  { key: 'modulosTerminadosPorMes', label: 'Módulos terminados por mes' },
  { key: 'modulosIniciadosPorMes', label: 'Inicio de módulos por mes' },
  { key: 'salidaGalponPorMes', label: 'Salida de galpón por mes' },
] as const

type SeccionKey = (typeof SECCIONES)[number]['key']

const VISIBLE_STORAGE_KEY = 'resumen.seccionesVisibles'

function useSeccionesVisibles() {
  const [ocultas, setOcultas] = useState<Set<SeccionKey>>(() => {
    try {
      const raw = localStorage.getItem(VISIBLE_STORAGE_KEY)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    localStorage.setItem(VISIBLE_STORAGE_KEY, JSON.stringify([...ocultas]))
  }, [ocultas])

  const toggle = (key: SeccionKey) =>
    setOcultas((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return { esVisible: (key: SeccionKey) => !ocultas.has(key), toggle }
}

function SectionCard({
  title,
  visible,
  onToggle,
  children,
}: {
  title: string
  visible: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">{title}</CardTitle>
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Minimizar' : 'Expandir'}
          className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted/50"
        >
          {visible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </CardHeader>
      {visible && <CardContent>{children}</CardContent>}
    </Card>
  )
}

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
  const despachos = useDespachosData(excelData)
  const { isAdmin } = useAuth()
  const { esVisible, toggle } = useSeccionesVisibles()

  const avanceEconomicoAcum = resumen.avanceEconomicoAcumulado
  useSyncProjectKpis(
    {
      avance_fisico: resumen.kpis.avanceFisico,
      avance_economico: avanceEconomicoAcum[avanceEconomicoAcum.length - 1]?.realAcum ?? null,
      modulos_terminados: resumen.kpis.modulosTerminados,
      modulos_despachados: resumen.kpis.modulosDespachados,
      modulos_en_proceso: resumen.kpis.modulosEnProceso,
      compras_total: resumen.kpis.totalComprado,
    },
    !resumen.loading,
  )

  return (
    <div className="space-y-4">
      <SectionCard title="Indicadores" visible={esVisible('kpis')} onToggle={() => toggle('kpis')}>
        <KpiCards kpis={resumen.kpis} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Avance económico mensual" visible={esVisible('avanceEconomico')} onToggle={() => toggle('avanceEconomico')}>
          <AvanceEconomicoChart data={resumen.avanceEconomico} isAdmin={isAdmin} />
        </SectionCard>
        <SectionCard title="Avance económico acumulado" visible={esVisible('avanceEconomicoAcum')} onToggle={() => toggle('avanceEconomicoAcum')}>
          <AvanceEconomicoAcumChart data={resumen.avanceEconomicoAcumulado} forecastLabels={resumen.forecastLabels} />
        </SectionCard>
      </div>

      <SectionCard
        title="Compras reales vs. presupuesto por mes"
        visible={esVisible('comprasVsPresupuesto')}
        onToggle={() => toggle('comprasVsPresupuesto')}
      >
        <div className="space-y-4">
          <ComprasVsPresupuestoChart data={resumen.comprasVsPresupuesto} />
          <CrecimientoMensualTabla data={resumen.crecimientoMensual} />
        </div>
      </SectionCard>

      <SectionCard title="Distribución de módulos por avance" visible={esVisible('distribucionModulos')} onToggle={() => toggle('distribucionModulos')}>
        <DistribucionModulosChart data={resumen.distribucionBuckets} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Diferencia avance económico real vs. físico real (acumulado)"
          visible={esVisible('diferenciaAcum')}
          onToggle={() => toggle('diferenciaAcum')}
        >
          <DiferenciaAvanceEconFisicoAcumChart data={resumen.diferenciaEconomicoFisicoAcum} />
        </SectionCard>
        <SectionCard
          title={MOSTRAR_M2_ACUMULADO ? 'M² acumulado real vs. programado' : 'Diferencia avance económico real vs. físico real (mensual)'}
          visible={esVisible('diferenciaMensualOM2')}
          onToggle={() => toggle('diferenciaMensualOM2')}
        >
          {MOSTRAR_M2_ACUMULADO ? (
            <M2AcumuladoChart data={resumen.m2Acumulado} />
          ) : (
            <DiferenciaAvanceEconFisicoChart data={resumen.diferenciaEconomicoFisico} />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Despachos por mes" visible={esVisible('despachosPorMes')} onToggle={() => toggle('despachosPorMes')}>
          <DespachosPorMesChart data={despachos.mensual.map((d) => ({ mes: d.mes, cantidad: d.despachado }))} />
        </SectionCard>
        <SectionCard
          title="Módulos terminados por mes"
          visible={esVisible('modulosTerminadosPorMes')}
          onToggle={() => toggle('modulosTerminadosPorMes')}
        >
          <ModulosTerminadosPorMesChart data={resumen.modulosTerminadosPorMes} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Inicio de módulos por mes"
          visible={esVisible('modulosIniciadosPorMes')}
          onToggle={() => toggle('modulosIniciadosPorMes')}
        >
          <ModulosIniciadosPorMesChart data={resumen.modulosIniciadosPorMes} />
        </SectionCard>
        <SectionCard title="Salida de galpón por mes" visible={esVisible('salidaGalponPorMes')} onToggle={() => toggle('salidaGalponPorMes')}>
          <SalidaGalponPorMesChart data={resumen.salidaGalponPorMes} />
        </SectionCard>
      </div>
    </div>
  )
}

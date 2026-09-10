import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useResumenData } from '../hooks/useResumenData'
import { useDespachosData } from '../hooks/useDespachosData'
import { useCurvaData } from '../hooks/useCurvaData'
import { useDotacionData } from '../hooks/useDotacionData'
import { useAuth } from '../hooks/useAuth'
import type { ParsedDashboardData } from '../lib/excelParser'
import {
  AvanceEconomicoAcumChart,
  AvanceEconomicoChart,
  ModulosTerminadosPorMesChart,
  SalidaGalponPorMesChart,
} from '../components/ResumenCharts'
import { DespachosMensualChart } from '../components/DespachosCharts'
import { TiempoTorreChart } from '../components/CurvaCharts'
import { DotacionPersonal } from '../components/DotacionPersonal'
import { cn } from '@/lib/utils'
import { IndicadoresFecha, fechaIndicadoresLbl } from '@/components/IndicadoresFecha'
import { buildIndicadoresEjecutivo } from '../lib/indicadoresEjecutivo'
import { finDeMesCorte, mesesCorteOpts } from '../lib/format'
import { INST } from '../lib/coloresInstitucionales'
import { exportarPptEjecutivo, type GraficoPpt } from '../lib/exportPptEjecutivo'

// La salida de galpón es el término de obra gruesa del módulo — ese es el nombre
// oficial del gráfico en el dashboard Ejecutivo.
const TITULO_OBRA_GRUESA = 'Módulos terminados obra gruesa'

function nombreProyecto(slug?: string) {
  return (slug ?? 'proyecto')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function Ejecutivo({ excelData }: { excelData: ParsedDashboardData }) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const mesesOpts = useMemo(() => mesesCorteOpts(), [])
  const ultimo = mesesOpts[mesesOpts.length - 1]
  const [mesCorte, setMesCorte] = useState(ultimo ? `${ultimo.n}-${ultimo.y}` : '')
  const hasta = useMemo(() => {
    const [n, y] = mesCorte.split('-').map(Number)
    return n && y ? finDeMesCorte(n, y) : undefined
  }, [mesCorte])

  const resumen = useResumenData(excelData, hasta)
  const despachos = useDespachosData(excelData, hasta)
  const curva = useCurvaData(excelData, hasta)
  const dotacion = useDotacionData()
  const { isAdmin } = useAuth()
  const [exportando, setExportando] = useState(false)

  const { avanceEconomico, avanceEconomicoAcumulado, items } = buildIndicadoresEjecutivo(resumen)
  const corteLbl = `Indicadores al ${fechaIndicadoresLbl(hasta)}`

  async function exportarPpt() {
    setExportando(true)
    try {
      const avance: GraficoPpt[] = [
        {
          titulo: 'Avance económico mensual',
          labels: avanceEconomico.map((d) => d.mes),
          barras: [{ name: 'Real', values: avanceEconomico.map((d) => d.real), color: INST.rojo }],
          lineas: [{ name: 'Proyectado mensual', values: avanceEconomico.map((d) => d.proyectado), color: INST.plomo }],
          sufijo: '%',
        },
        {
          titulo: 'Avance económico acumulado',
          labels: avanceEconomicoAcumulado.map((d) => String(d.mes)),
          barras: [{ name: 'Real acumulado', values: avanceEconomicoAcumulado.map((d) => d.realAcum), color: INST.rojo }],
          lineas: resumen.forecastLabels.map((label) => ({
            name: label,
            values: avanceEconomicoAcumulado.map((d) => (typeof d[label] === 'number' ? (d[label] as number) : null)),
          })),
          sufijo: '%',
        },
      ]
      const produccion: GraficoPpt[] = [
        {
          titulo: 'Módulos terminados / programados acumulados',
          labels: despachos.mensualAcumulado.map((d) => d.mes),
          barras: [{ name: 'Terminados (acum.)', values: despachos.mensualAcumulado.map((d) => d.fabricadoAcum), color: INST.rojo }],
          lineas: [{ name: 'Programados (acum.)', values: despachos.mensualAcumulado.map((d) => d.programadoAcum), color: INST.plomo }],
        },
        {
          titulo: 'Tiempo real vs proyectado por torre',
          labels: curva.torreTiempo.map((d) => d.torre),
          barras: [{ name: 'Tiempo real (días)', values: curva.torreTiempo.map((d) => d.real), color: INST.rojo }],
          lineas: [{ name: 'Tiempo proyectado (días)', values: curva.torreTiempo.map((d) => d.proy), color: INST.plomo }],
        },
        {
          titulo: 'Módulos terminados por mes',
          labels: resumen.modulosTerminadosPorMes.map((d) => d.mes),
          barras: [{ name: 'Módulos terminados', values: resumen.modulosTerminadosPorMes.map((d) => d.cantidad), color: INST.rojo }],
        },
        {
          titulo: TITULO_OBRA_GRUESA,
          labels: resumen.salidaGalponPorMes.map((d) => d.mes),
          barras: [{ name: 'Terminados obra gruesa', values: resumen.salidaGalponPorMes.map((d) => d.cantidad), color: INST.plomo }],
        },
      ]
      const d = dotacion.valores
      const nota = `Dotación: ${d.administrativos} administrativos · ${d.supervisores} supervisores · ${d.operarios} operarios · ${d.sanitarios} sanitarios · ${d.electricos} eléctricos · ${d.terminaciones} terminaciones`

      await exportarPptEjecutivo({
        proyecto: nombreProyecto(proyectoSlug),
        corteLbl,
        kpis: items.map((k) => ({ label: k.label, value: k.value })),
        avance,
        produccion,
        nota,
      })
      toast.success('PPT generado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PPT')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IndicadoresFecha fecha={hasta} />
        <div className="flex items-center gap-2">
          <label htmlFor="mes-corte" className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
            Información hasta
          </label>
          <select
            id="mes-corte"
            value={mesCorte}
            onChange={(e) => setMesCorte(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {mesesOpts.map((m) => (
              <option key={`${m.n}-${m.y}`} value={`${m.n}-${m.y}`}>
                {m.lbl}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportarPpt}
            disabled={exportando}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar a PPT
          </button>
        </div>
      </div>

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
            <AvanceEconomicoChart data={avanceEconomico} readOnly institucional />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <AvanceEconomicoAcumChart data={avanceEconomicoAcumulado} forecastLabels={resumen.forecastLabels} institucional />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos terminados / programados acumulados</CardTitle>
          </CardHeader>
          <CardContent>
            <DespachosMensualChart
              data={despachos.mensualAcumulado}
              labelDespachado="Terminados (acum.)"
              labelProyectado="Programados (acum.)"
              despachadoKey="fabricadoAcum"
              proyectadoKey="programadoAcum"
              colorDespachado={INST.rojo}
              colorProyectado={INST.plomo}
            />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Módulos terminados por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <ModulosTerminadosPorMesChart data={resumen.modulosTerminadosPorMes} color={INST.rojo} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">{TITULO_OBRA_GRUESA}</CardTitle>
          </CardHeader>
          <CardContent>
            <SalidaGalponPorMesChart data={resumen.salidaGalponPorMes} color={INST.plomo} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Tiempo real vs proyectado por torre</CardTitle>
        </CardHeader>
        <CardContent>
          <TiempoTorreChart data={curva.torreTiempo} institucional />
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { useDespachosData } from '../hooks/useDespachosData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtM } from '../lib/format'
import { cn } from '@/lib/utils'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { DespachosDiarioChart, DespachosMensualChart, DespachosSemanalChart, DespachosTorreTipoChart } from '../components/DespachosCharts'

function KpiCards({ kpis }: { kpis: ReturnType<typeof useDespachosData>['kpis'] }) {
  const items = [
    { label: 'Módulos despachados', value: fmt(kpis.nMods), tono: 'success' as const },
    { label: 'Total GDs emitidas', value: fmt(kpis.totalGDs) },
    { label: 'Monto total despach.', value: fmtM(kpis.totalMonto), tono: 'warning' as const },
    { label: 'Monto prom./módulo', value: fmtM(kpis.montoPromMod) },
    { label: 'Módulos terminados', value: fmt(kpis.modsTerminados), sub: 'total avance real' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', kpi.tono === 'success' && 'text-success', kpi.tono === 'warning' && 'text-warning')}>{kpi.value}</p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}

export default function Despachos({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useDespachosData(excelData)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">🗓 Filtrar por mes:</span>
        {data.mesesOpts.map((m) => (
          <Chip key={m.key} label={m.lbl} active={data.mesesSeleccionados == null || data.mesesSeleccionados.has(m.key)} onClick={() => data.toggleMes(m.key)} />
        ))}
      </div>

      <IndicadoresFecha />
      <KpiCards kpis={data.kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Despachos mensuales — real vs proyectado</CardTitle>
        </CardHeader>
        <CardContent>
          <DespachosMensualChart data={data.mensual} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Despachos semanales</CardTitle>
        </CardHeader>
        <CardContent>
          <DespachosSemanalChart data={data.semanal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Despachos diarios acumulados</span>
            <span className={cn('text-sm font-bold normal-case', data.gapDia < 0 ? 'text-destructive' : 'text-success')}>
              GAP: {data.gapDia >= 0 ? '+' : ''}{fmt(data.gapDia)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DespachosDiarioChart data={data.diario} />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Resumen mensual</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Mes</th>
                <th className="px-2 py-1.5 text-right">Proy. mes</th>
                <th className="px-2 py-1.5 text-right">Despachado</th>
                <th className="px-2 py-1.5 text-right">Pendiente acum.</th>
                <th className="px-2 py-1.5 text-right">Acum. proy.</th>
                <th className="px-2 py-1.5 text-right">Acum. real</th>
              </tr>
            </thead>
            <tbody>
              {data.resumenMensual.map((r) => (
                <tr key={r.mes} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{r.mes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.proyMesOnly)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-success">{fmt(r.despachado)}</td>
                  <td className={'px-2 py-1.5 text-right tabular-nums ' + (r.pendiente > 0 ? 'text-destructive' : 'text-success')}>{fmt(r.pendiente)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.acumProy)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-primary">{fmt(r.acumReal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Despachos por torre y tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <DespachosTorreTipoChart data={data.torreTipo} tipos={data.tipos} />
        </CardContent>
      </Card>
    </div>
  )
}

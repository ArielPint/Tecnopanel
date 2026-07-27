import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { cn } from '@/lib/utils'
import { useProyeccionData } from '../hooks/useProyeccionData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt } from '../lib/format'
import { ProyeccionEconAcumChart, ProyeccionEconChart, ProyeccionEscenariosChart, ProyeccionTerminoChart } from '../components/ProyeccionCharts'

export default function Proyeccion({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useProyeccionData(excelData)
  const { kpis } = data

  const items = [
    { label: 'Término estimado — escenario', value: kpis.fechaEtaTotal, sub: kpis.torreEscenario ? `ritmo ${kpis.torreEscenario}: ${kpis.ritmoEscenario?.toFixed(1)} mód/sem` : 'sin torres con término', tono: 'info' as const },
    { label: 'Módulos pendientes', value: fmt(kpis.pendientesF), sub: `${fmt(kpis.sinIniciarF)} sin iniciar`, tono: 'warning' as const },
    { label: 'Semanas restantes — escenario', value: kpis.semanasRestantes != null ? kpis.semanasRestantes.toFixed(1) : '—', tono: 'success' as const },
    { label: 'Presupuesto — mes estimado agotamiento', value: kpis.mesAgotamiento ?? '—', sub: kpis.burnMensual ? `burn rate ⌀ ${(kpis.burnMensual * 100).toFixed(2)}%/mes` : 'sin gasto reciente', tono: 'destructive' as const },
  ]

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4">
            <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className={cn('mt-1 text-xl font-bold tabular-nums', kpi.tono === 'success' && 'text-success', kpi.tono === 'warning' && 'text-warning', kpi.tono === 'destructive' && 'text-destructive', kpi.tono === 'info' && 'text-primary')}>
              {kpi.value}
            </p>
            {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {data.torresConTermino.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Escenario (torre):</span>
          {data.torresConTermino.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => data.setTorreSel(t)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                t === data.torreSel ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted/30 text-muted-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Proyección de término — módulos acumulados</CardTitle>
          </CardHeader>
          <CardContent>
            <ProyeccionTerminoChart data={data.proyeccionTermino} torreSel={data.torreSel} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Comparación de escenarios por torre</CardTitle>
          </CardHeader>
          <CardContent>
            <ProyeccionEscenariosChart data={data.escenarios} torreSel={data.torreSel} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Detalle por escenario</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Torre (escenario)</th>
                <th className="px-2 py-1.5 text-right">Ritmo (mód/sem)</th>
                <th className="px-2 py-1.5 text-right">Pendientes proyecto</th>
                <th className="px-2 py-1.5 text-right">Semanas restantes</th>
                <th className="px-2 py-1.5 text-right">Fecha estimada</th>
              </tr>
            </thead>
            <tbody>
              {data.escenarios.length ? (
                data.escenarios.map((e) => (
                  <tr key={e.torre} className={cn('border-b last:border-0', e.torre === data.torreSel && 'bg-success/10')}>
                    <td className="px-2 py-1.5">{e.torre}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{e.ritmo.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.pendientesF)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{e.semanas != null ? e.semanas.toFixed(1) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{e.fecha ? e.fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">Sin torres con módulos terminados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico mensual — real vs proyección vs burn rate</CardTitle>
          </CardHeader>
          <CardContent>
            <ProyeccionEconChart data={data.econMensual} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance económico acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <ProyeccionEconAcumChart data={data.econMensual} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

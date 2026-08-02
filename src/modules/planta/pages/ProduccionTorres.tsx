import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { fmtPr } from '../lib/format'
import { useProduccionModulos } from '../hooks/useProduccionModulos'
import { VBarChart, GroupedVBarChart, colorPorAvance, COLOR_VERDE, COLOR_AZUL } from '../components/ProduccionCharts'
import type { ParsedDashboardData } from '../lib/excelParser'

type Tono = 'success' | 'warning' | 'destructive' | 'info' | 'purple'

function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: Tono }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={'mt-1 text-2xl font-bold tabular-nums ' + (tono ? `text-${tono}` : '')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function ProduccionTorres({ excelData }: { excelData: ParsedDashboardData | null }) {
  const { modulos, loading } = useProduccionModulos(excelData)

  const data = useMemo(() => {
    const torres = [...new Set(modulos.map((m) => m.torre).filter(Boolean))].sort()
    const porTorre = torres.map((t) => {
      const mm = modulos.filter((m) => m.torre === t)
      const av = mm.length ? (mm.reduce((s, m) => s + m.avance, 0) / mm.length) * 100 : 0
      return {
        torre: t.replace('TORRE ', 'T'),
        torreFull: t,
        avance: +av.toFixed(1),
        terminados: mm.filter((m) => m.terminado).length,
        enProceso: mm.filter((m) => m.iniciado && !m.terminado).length,
        sinIniciar: mm.filter((m) => !m.iniciado).length,
      }
    })
    const activas = porTorre.filter((t) => modulos.some((m) => m.torre === t.torreFull && m.iniciado)).length
    const completas = porTorre.filter((t) => t.terminados > 0 && t.terminados + t.enProceso + t.sinIniciar === t.terminados).length
    const mayor = porTorre.reduce((a, b) => (b.avance > a.avance ? b : a), porTorre[0])
    const menor = porTorre.reduce((a, b) => (b.avance < a.avance ? b : a), porTorre[0])
    return { porTorre, activas, completas, mayor, menor }
  }, [modulos])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Torres activas" value={String(data.activas)} tono="info" />
        <Kpi label="Torres completadas" value={String(data.completas)} tono="success" />
        {data.mayor && <Kpi label="Mayor avance" value={data.mayor.torre} sub={fmtPr(data.mayor.avance)} tono="purple" />}
        {data.menor && <Kpi label="Menor avance" value={data.menor.torre} sub={fmtPr(data.menor.avance)} tono="destructive" />}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">% Avance promedio por torre</CardTitle></CardHeader>
        <CardContent><VBarChart data={data.porTorre} labelKey="torre" valueKey="avance" pct colorFn={colorPorAvance} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Estado de módulos por torre</CardTitle></CardHeader>
        <CardContent>
          <GroupedVBarChart
            data={data.porTorre}
            labelKey="torre"
            series={[{ key: 'terminados', label: 'Terminados', color: COLOR_VERDE }, { key: 'enProceso', label: 'En proceso', color: COLOR_AZUL }]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Vista detallada de torres</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.porTorre.map((t) => {
              const color = colorPorAvance(t.avance)
              return (
                <div key={t.torreFull} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[.68rem] font-bold uppercase text-muted-foreground">{t.torreFull}</p>
                  <p className="mt-0.5 text-xl font-bold" style={{ color }}>{t.avance.toFixed(1)}%</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(t.avance, 100)}%`, background: color }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[.68rem] text-muted-foreground">
                    <span>✓{t.terminados}</span><span>↻{t.enProceso}</span><span>⏳{t.sinIniciar}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

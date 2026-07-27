import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { useComprasData } from '../hooks/useComprasData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { MESES_ORDER, fmt, fmtDate, fmtM, fmtPr } from '../lib/format'
import { ComprasPorMesChart, ComprasPorTipoChart, TopMaterialesChart } from '../components/ComprasCharts'

interface Kpi {
  label: string
  value: string
  sub?: string
  tono?: 'success' | 'destructive'
}

function KpiCards({ kpis }: { kpis: ReturnType<typeof useComprasData>['kpis'] }) {
  const items: Kpi[] = [
    { label: 'Total comprado', value: fmtM(kpis.total) },
    { label: 'Ppto acumulado (GD)', value: fmtM(kpis.totalPpto) },
    { label: 'Dif. real – ppto', value: fmtM(kpis.difRealPpto), sub: 'neg = más barato', tono: kpis.difRealPpto <= 0 ? 'success' : 'destructive' },
    { label: 'N° guías (GD)', value: fmt(kpis.nGD) },
    { label: 'Ppto total proyecto', value: fmtM(kpis.pptoTotalProyecto) },
    {
      label: 'Ejec. ppto total',
      value: kpis.ejecPptoTotal != null ? fmtPr(kpis.ejecPptoTotal) : '—',
      tono: kpis.ejecSobrePresupuesto ? 'destructive' : 'success',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={'mt-1 text-2xl font-bold tabular-nums ' + (kpi.tono === 'success' ? 'text-success' : kpi.tono === 'destructive' ? 'text-destructive' : '')}>
            {kpi.value}
          </p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

export default function Compras({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useComprasData(excelData)
  const [busqueda, setBusqueda] = useState('')
  const [mes, setMes] = useState('Todos')

  const mesesOpts = useMemo(
    () => ['Todos', ...MESES_ORDER.filter((m) => data.criticos.some((c) => c.mes === m.n && c.anioGuia === m.y)).map((m) => m.lbl)],
    [data.criticos],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    const mo = MESES_ORDER.find((m) => m.lbl === mes)
    return data.criticos
      .filter((c) => {
        if (mes !== 'Todos' && mo && !(c.mes === mo.n && c.anioGuia === mo.y)) return false
        if (q) {
          const hay = `${c.desc ?? ''} ${c.gd ?? ''} ${c.oc ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .slice(0, 300)
  }, [data.criticos, busqueda, mes])

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCards kpis={data.kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Compras vs Presupuesto por mes (2025 → 2026)</CardTitle>
        </CardHeader>
        <CardContent>
          <ComprasPorMesChart data={data.comprasPorMes} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Top 10 materiales por monto comprado</CardTitle>
          </CardHeader>
          <CardContent>
            <TopMaterialesChart data={data.topMateriales} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Compras por tipo de producto</CardTitle>
          </CardHeader>
          <CardContent>
            <ComprasPorTipoChart data={data.porTipo} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Detalle guías de despacho — Productos críticos</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar material, GD, OC..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-64" />
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mesesOpts.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtrados.length} de {data.criticos.length}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Fecha</th>
                <th className="px-2 py-1.5 text-left">GD</th>
                <th className="px-2 py-1.5 text-left">Material</th>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-right">Val. unit.</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-right">Ppto unit.</th>
                <th className="px-2 py-1.5 text-right">Dif. total</th>
                <th className="px-2 py-1.5 text-right">Dif. %</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c, i) => {
                const dp = c.difPct != null ? c.difPct * 100 : null
                return (
                  <tr key={`${c.gd}-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{fmtDate(c.fechaGuia)}</td>
                    <td className="px-2 py-1.5">{String(c.gd ?? '—')}</td>
                    <td className="px-2 py-1.5">{String(c.desc ?? '—').substring(0, 35)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.cant)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(c.valorUN)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(c.valorTotal)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(c.valorPpto)}</td>
                    <td className={'px-2 py-1.5 text-right tabular-nums ' + (c.difTotal == null ? '' : c.difTotal < 0 ? 'text-destructive' : 'text-success')}>
                      {fmtM(c.difTotal)}
                    </td>
                    <td className={'px-2 py-1.5 text-right tabular-nums ' + (dp == null ? '' : dp < 0 ? 'text-destructive' : 'text-success')}>
                      {dp != null ? dp.toFixed(2) + '%' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

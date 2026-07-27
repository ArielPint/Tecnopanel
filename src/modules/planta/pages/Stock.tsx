import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { useStockData } from '../hooks/useStockData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtM } from '../lib/format'
import { StockComparacionChart } from '../components/StockCharts'

function KpiCards({ kpis }: { kpis: ReturnType<typeof useStockData>['kpis'] }) {
  const items = [
    { label: 'Materiales en stock', value: fmt(kpis.materiales) },
    { label: 'Valor total stock', value: fmtM(kpis.totalValor), tono: 'success' as const },
    { label: 'Stock crítico (<5 mód)', value: fmt(kpis.criticos), tono: 'destructive' as const },
    { label: 'Módulos construidos', value: fmt(kpis.modConstruidos) },
    { label: 'Val. pérdidas/proceso', value: fmtM(kpis.totalPerdida), tono: kpis.totalPerdida > 0 ? ('warning' as const) : undefined },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={'mt-1 text-2xl font-bold tabular-nums ' + (kpi.tono === 'success' ? 'text-success' : kpi.tono === 'destructive' ? 'text-destructive' : kpi.tono === 'warning' ? 'text-warning' : '')}>
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function Stock({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useStockData(excelData)
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState('Todos')

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return data.stockData
      .filter((x) => {
        if (tipo !== 'Todos' && x.critico !== tipo) return false
        if (q) {
          const hay = `${x.codigo} ${x.desc} ${x.material}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.alcanceMod ?? 999) - (b.alcanceMod ?? 999))
  }, [data.stockData, busqueda, tipo])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">📅 Semana:</span>
        <Select value={data.selectedWeekTs != null ? String(data.selectedWeekTs) : ''} onValueChange={(v) => data.setSelectedWeekTs(v ? +v : null)}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Todas las semanas" /></SelectTrigger>
          <SelectContent>
            {data.semanas.map((s) => (
              <SelectItem key={s.ts} value={String(s.ts)}>{s.lbl}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="size-9" onClick={data.goPrev}><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="icon" className="size-9" onClick={data.goNext}><ChevronRight className="size-4" /></Button>
        <Button variant="outline" size="sm" onClick={data.goLast}>Última</Button>
        {data.semanaActual && <span className="text-xs text-muted-foreground">{data.semanaActual.lbl}</span>}
      </div>

      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCards kpis={data.kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Stock actual vs semana anterior por producto (top 20 variación)</CardTitle>
        </CardHeader>
        <CardContent>
          <StockComparacionChart data={data.comparacion} />
        </CardContent>
      </Card>

      {data.perdidas.length > 0 && (
        <div className="space-y-2">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Pérdidas en proceso</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Código</th>
                  <th className="px-2 py-1.5 text-left">Material</th>
                  <th className="px-2 py-1.5 text-right">Stock físico</th>
                  <th className="px-2 py-1.5 text-right">Pérdida (ud)</th>
                  <th className="px-2 py-1.5 text-right">Val. pérdida</th>
                  <th className="px-2 py-1.5 text-right">Val. unitario</th>
                </tr>
              </thead>
              <tbody>
                {data.perdidas.map((x, i) => (
                  <tr key={`${x.codigo}-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{x.codigo || '—'}</td>
                    <td className="px-2 py-1.5" title={x.desc || x.material}>{(x.desc || x.material || '—').substring(0, 45)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(x.stockFisico)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-warning">{x.perdida != null ? x.perdida.toFixed(2) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-destructive">{fmtM(x.valorPerdida)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(x.valorUN)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Detalle stock</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar código, material..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-64" />
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="PRODUCTO CRITICO">PRODUCTO CRITICO</SelectItem>
              <SelectItem value="NO CRITICO">NO CRITICO</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtrados.length} materiales</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Código</th>
                <th className="px-2 py-1.5 text-left">Descripción</th>
                <th className="px-2 py-1.5 text-right">Stock Físico</th>
                <th className="px-2 py-1.5 text-right">Alcance x Módulo</th>
                <th className="px-2 py-1.5 text-right">Consumo Total</th>
                <th className="px-2 py-1.5 text-right">Equiv. Módulos</th>
                <th className="px-2 py-1.5 text-right">Pérdida/Tránsito</th>
                <th className="px-2 py-1.5 text-right">Equiv. Módulos</th>
                <th className="px-2 py-1.5 text-right">Stock Valorizado</th>
                <th className="px-2 py-1.5 text-right">Consumo Valorizado</th>
                <th className="px-2 py-1.5 text-right">Pérdida Valorizada</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Sin resultados</td></tr>
              ) : (
                filtrados.map((x, i) => {
                  const alc = x.alcanceMod ?? 0
                  const perdida = x.perdida
                  const perdidaClr = perdida == null ? '' : perdida > 0 ? 'text-destructive' : perdida < 0 ? 'text-info' : ''
                  return (
                    <tr key={`${x.codigo}-${i}`} className="border-b last:border-0">
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{x.codigo || '—'}</td>
                      <td className="px-2 py-1.5" title={x.desc}>{(x.desc || '—').substring(0, 40)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(x.stockFisico)}</td>
                      <td className={'px-2 py-1.5 text-right tabular-nums ' + (alc < 5 ? 'text-destructive' : alc < 15 ? 'text-warning' : 'text-success')}>{alc.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(x.consumo)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{x.consumoEquivMod != null ? x.consumoEquivMod.toFixed(2) : '—'}</td>
                      <td className={'px-2 py-1.5 text-right tabular-nums ' + perdidaClr}>{perdida != null ? perdida.toFixed(2) : '—'}</td>
                      <td className={'px-2 py-1.5 text-right tabular-nums ' + perdidaClr}>{x.perdidaEquivMod != null ? x.perdidaEquivMod.toFixed(2) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(x.valorStock)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(x.consumoValorizado)}</td>
                      <td className={'px-2 py-1.5 text-right tabular-nums ' + perdidaClr}>{fmtM(x.valorPerdida)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

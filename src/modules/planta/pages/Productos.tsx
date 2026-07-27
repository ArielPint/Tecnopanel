import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { useProductosData } from '../hooks/useProductosData'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmt, fmtM } from '../lib/format'
import { AvancePedidosChart, AvanceTeoricoChart, VariacionUnitariaChart } from '../components/ProductosCharts'

function KpiCards({ kpis }: { kpis: ReturnType<typeof useProductosData>['kpis'] }) {
  const items = [
    { label: 'Total productos', value: fmt(kpis.total) },
    { label: 'Productos críticos', value: fmt(kpis.criticos) },
    { label: 'Av. teórico >100%', value: fmt(kpis.sobre100), sub: 'exceso consumo', tono: 'destructive' as const },
    { label: 'Av. teórico <50%', value: fmt(kpis.bajo50), sub: 'en riesgo', tono: 'warning' as const },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          <p className={'mt-1 text-2xl font-bold tabular-nums ' + (kpi.tono === 'destructive' ? 'text-destructive' : kpi.tono === 'warning' ? 'text-warning' : '')}>
            {kpi.value}
          </p>
          {kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

export default function Productos({ excelData }: { excelData: ParsedDashboardData }) {
  const data = useProductosData(excelData)
  const [busqueda, setBusqueda] = useState('')
  const [critico, setCritico] = useState('Todos')

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return data.productos
      .filter((p) => {
        if (critico !== 'Todos' && p.critico !== critico) return false
        if (q) {
          const hay = `${p.desc ?? ''} ${p.codigo ?? ''} ${p.descCorta ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .slice(0, 200)
  }, [data.productos, busqueda, critico])

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCards kpis={data.kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Avance teórico módulo — Productos críticos (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <AvanceTeoricoChart data={data.avanceTeorico} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">% Avance pedidos — Productos críticos</CardTitle>
          </CardHeader>
          <CardContent>
            <AvancePedidosChart data={data.avancePedidos} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Variación precio unitario vs presupuesto (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <VariacionUnitariaChart data={data.variacion} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Tabla productos</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar nombre, código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-64" />
          <Select value={critico} onValueChange={setCritico}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="PRODUCTO CRITICO">PRODUCTO CRITICO</SelectItem>
              <SelectItem value="NO CRITICO">NO CRITICO</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtrados.length} de {data.productos.length}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Código</th>
                <th className="px-2 py-1.5 text-left">Descripción</th>
                <th className="px-2 py-1.5 text-left">Tipo</th>
                <th className="px-2 py-1.5 text-right">Av. teórico</th>
                <th className="px-2 py-1.5 text-right">% Av. pedidos</th>
                <th className="px-2 py-1.5 text-right">Cant. comprada</th>
                <th className="px-2 py-1.5 text-right">Precio compra</th>
                <th className="px-2 py-1.5 text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const av = p.avTeorico
                const avp = p.pctAvPedidos
                const vc = p.variacion ?? 0
                return (
                  <tr key={`${p.codigo}-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{String(p.codigo ?? '—')}</td>
                    <td className="px-2 py-1.5" title={String(p.desc ?? '')}>{String(p.descCorta ?? p.desc ?? '').substring(0, 35)}</td>
                    <td className="px-2 py-1.5">
                      {p.critico === 'PRODUCTO CRITICO' ? (
                        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">Crítico</span>
                      ) : (
                        <span className="rounded bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info">Normal</span>
                      )}
                    </td>
                    <td className={'px-2 py-1.5 text-right tabular-nums ' + (av == null ? '' : av > 100 ? 'text-destructive' : av >= 80 ? 'text-success' : av >= 50 ? 'text-warning' : 'text-destructive')}>
                      {av != null ? av.toFixed(2) + '%' : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{avp != null ? (avp * 100).toFixed(2) + '%' : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(p.cantComprada)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(p.precioUN)}</td>
                    <td className={'px-2 py-1.5 text-right tabular-nums ' + (vc < 0 ? 'text-success' : vc > 0 ? 'text-destructive' : '')}>
                      {(vc * 100).toFixed(2)}%
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

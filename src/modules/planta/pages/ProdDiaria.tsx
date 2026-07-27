import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { useProdDiariaData } from '../hooks/useProdDiariaData'
import { ProdDiariaChart } from '../components/ProdDiariaCharts'
import { fmt } from '../lib/format'

export default function ProdDiaria() {
  const data = useProdDiariaData()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input type="date" value={data.desde} onChange={(e) => data.setDesde(e.target.value)} className="h-8 w-36" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input type="date" value={data.hasta} onChange={(e) => data.setHasta(e.target.value)} className="h-8 w-36" />
        </label>
      </div>

      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {data.kpis.map((k) => (
          <div key={k.cat} className="rounded-lg border bg-card p-4">
            <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{k.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{fmt(k.total)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">etapas completadas</p>
          </div>
        ))}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Total período</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{fmt(data.totalPeriodo)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">eventos</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Producción diaria por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <ProdDiariaChart data={data.chartData} cats={data.cats} catKeys={data.catKeys} />
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-2 py-1.5 text-left">Fecha</th>
              {data.catKeys.map((c) => (
                <th key={c} className="px-2 py-1.5 text-center">{data.cats[c].label}</th>
              ))}
              <th className="px-2 py-1.5 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.tabla.length ? (
              data.tabla.map((r) => (
                <tr key={r.fecha} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{r.fecha}</td>
                  {data.catKeys.map((c) => (
                    <td key={c} className="px-2 py-1.5 text-center tabular-nums">{r[c] || '—'}</td>
                  ))}
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={data.catKeys.length + 2} className="px-2 py-5 text-center text-muted-foreground">Sin datos en el rango seleccionado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

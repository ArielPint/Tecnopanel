import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLPCompact } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import BarraFiltros, { useFiltros } from '../components/Filtros'
import { Aviso, Cargando, PieFuente } from '../components/Estados'
import { useCatalogos, useEerr } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { useProrrateo } from '../hooks/useProrrateo'
import { filtrar, resumenPorLinea, type ResumenLinea } from '../lib/eerr'

const NUM = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fmt = (v: number) => (Math.round(v) === 0 ? '–' : NUM.format(v))
const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : '–')

const configGrafico = {
  margen: { label: 'Margen bruto', color: 'hsl(var(--chart-1))' },
  resultado: { label: 'Resultado', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums">{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

export default function PorLinea() {
  const permisos = usePermisosFin()
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { periodo, filtros, desde, hasta } = useFiltros()
  const { filas, loading, error } = useEerr(desde, hasta, periodo.prorratear)
  const { aniosConProrrateo } = useProrrateo()
  const [porSucursal, setPorSucursal] = useState(false)

  const cecos = useMemo(() => new Map((catalogos?.cecos ?? []).map((c) => [c.codigo, c])), [catalogos])
  const resumen = useMemo(
    () => (catalogos ? resumenPorLinea(filtrar(filas, cecos, filtros), catalogos, porSucursal) : []),
    [catalogos, filas, cecos, filtros, porSucursal],
  )
  const total = useMemo(
    () =>
      resumen.reduce(
        (t, r) => ({
          ingresos: t.ingresos + r.ingresos,
          costos: t.costos + r.costos,
          gastos: t.gastos + r.gastos,
          otros: t.otros + r.otros,
          margen: t.margen + r.margen,
          resultado: t.resultado + r.resultado,
          prorrateado: t.prorrateado + r.prorrateado,
        }),
        { ingresos: 0, costos: 0, gastos: 0, otros: 0, margen: 0, resultado: 0, prorrateado: 0 },
      ),
    [resumen],
  )
  const conReparto = periodo.prorratear && aniosConProrrateo.has(periodo.anio)
  const nombre = (r: ResumenLinea) => (r.sucursal ? `${r.linea} · ${r.sucursal}` : r.linea)
  const grafico = resumen.map((r) => ({ nombre: nombre(r), margen: Math.round(r.margen), resultado: Math.round(r.resultado) }))

  async function exportar() {
    try {
      await exportarExcel(
        `resultado-por-linea-${desde}-a-${hasta}`,
        resumen.map((r) => ({
          Línea: r.linea,
          ...(porSucursal ? { Sucursal: r.sucursal } : {}),
          Ingresos: Math.round(r.ingresos),
          'Costos de ventas': Math.round(r.costos),
          'Margen bruto': Math.round(r.margen),
          '% margen': r.ingresos ? Number(((r.margen / r.ingresos) * 100).toFixed(1)) : null,
          'Gastos de explotación': Math.round(r.gastos),
          'Otros ingresos y egresos': Math.round(r.otros),
          Resultado: Math.round(r.resultado),
          '% resultado': r.ingresos ? Number(((r.resultado / r.ingresos) * 100).toFixed(1)) : null,
          ...(conReparto ? { 'Administración asignada': Math.round(r.prorrateado) } : {}),
        })),
      )
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    }
  }

  const fallo = errorCat ?? error
  if (fallo) return <Aviso error={fallo} />

  return (
    <div className="space-y-4">
      <BarraFiltros catalogos={catalogos} estado={estado} sucursales={permisos.eerr} detalle={false} />

      {!catalogos || loading ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi titulo="Ingresos operacionales" valor={formatCLPCompact(total.ingresos)} />
            <Kpi titulo="Margen bruto" valor={formatCLPCompact(total.margen)} detalle={`${pct(total.margen, total.ingresos)} de los ingresos`} />
            <Kpi titulo="Resultado" valor={formatCLPCompact(total.resultado)} detalle={`${pct(total.resultado, total.ingresos)} de los ingresos`} />
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold">Margen bruto y resultado por línea</p>
              <ChartContainer config={configGrafico} className="aspect-auto h-[280px] w-full">
                <BarChart data={grafico} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="nombre" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} width={70} tickFormatter={(v) => formatCLPCompact(v)} fontSize={11} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${configGrafico[n as keyof typeof configGrafico]?.label ?? n}: ${formatCLPCompact(Number(v))}`} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="margen" fill="var(--color-margen)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="resultado" fill="var(--color-resultado)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select value={porSucursal ? 'si' : 'no'} onValueChange={(v) => setPorSucursal(v === 'si')}>
              <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Por línea</SelectItem>
                <SelectItem value="si">Por línea y sucursal</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportar} disabled={resumen.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Exportar a Excel
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Línea</th>
                  <th className="px-3 py-2 text-right font-semibold">Ingresos</th>
                  <th className="px-3 py-2 text-right font-semibold">Costos de ventas</th>
                  <th className="px-3 py-2 text-right font-semibold">Margen bruto</th>
                  <th className="px-3 py-2 text-right font-semibold">% margen</th>
                  <th className="px-3 py-2 text-right font-semibold">Gastos explotación</th>
                  <th className="px-3 py-2 text-right font-semibold">Otros</th>
                  <th className="px-3 py-2 text-right font-semibold">Resultado</th>
                  <th className="px-3 py-2 text-right font-semibold">% resultado</th>
                  {conReparto && <th className="px-3 py-2 text-right font-semibold">Adm. asignada</th>}
                </tr>
              </thead>
              <tbody>
                {[...resumen, null].map((r) => {
                  const x = r ?? { ...total, linea: 'Total', sucursal: null }
                  const celda = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums'
                  return (
                    <tr key={r ? nombre(r) : 'total'} className={cn('border-b last:border-0', !r && 'bg-accent font-bold')}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium">{r ? nombre(r) : 'Total'}</td>
                      <td className={celda}>{fmt(x.ingresos)}</td>
                      <td className={celda}>{fmt(x.costos)}</td>
                      <td className={cn(celda, 'font-semibold')}>{fmt(x.margen)}</td>
                      <td className={cn(celda, 'text-muted-foreground')}>{pct(x.margen, x.ingresos)}</td>
                      <td className={celda}>{fmt(x.gastos)}</td>
                      <td className={celda}>{fmt(x.otros)}</td>
                      <td className={cn(celda, 'font-semibold', x.resultado < 0 && 'text-destructive')}>{fmt(x.resultado)}</td>
                      <td className={cn(celda, 'text-muted-foreground')}>{pct(x.resultado, x.ingresos)}</td>
                      {conReparto && <td className={cn(celda, 'text-muted-foreground')}>{fmt(x.prorrateado)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PieFuente
        estado={estado}
        extra={
          conReparto
            ? 'La administración (CECO 9xxx) está repartida a las líneas con los % de prorrateo del año; "Adm. asignada" es esa parte.'
            : 'La administración (CECO 9xxx) va aparte, sin repartir.'
        }
      />
    </div>
  )
}

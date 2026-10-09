import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/modules/financiero/components/ui/chart'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { cn } from '@/lib/utils'
import { listarHallazgos } from '../lib/api'
import { calcularIndicadores, PERIODOS, type Periodo } from '../lib/indicadores'
import { exportarIndicadoresExcel, exportarIndicadoresPdf } from '../lib/export'
import type { Hallazgo } from '../lib/tipos'
import { ESTADO_META } from '../lib/estados'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

// Colores validados con dataviz/validate_palette.js (claro sobre #ffffff, oscuro sobre la tarjeta
// #1A1E28): azul = --chart-1 del hub; el naranjo --chart-4 (#F7A64F) no pasa la banda de
// luminosidad ni el 3:1 sobre blanco, así que se usa un paso más oscuro del mismo matiz.
// El rojo --chart-2 se evita a propósito: se confunde con los estados de alerta (vencido).
const AZUL = '#4F8DF7'
const NARANJO = '#D2691E'

const configTendencia = {
  reportados: { label: 'Reportados', color: AZUL },
  cerrados: { label: 'Cerrados', color: NARANJO },
} satisfies ChartConfig

const configAreas = { reportados: { label: 'Reportados', color: AZUL } } satisfies ChartConfig

const selectClase =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function Tile({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className={cn('mt-1 font-mono-tabular text-2xl font-extrabold', alerta && 'text-red-700 dark:text-red-400')}>{valor}</p>
        {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

export default function Indicadores() {
  const { puede } = usePermisosSso('hallazgos')
  const { areas, nombreArea } = useDatosSso()
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [areaId, setAreaId] = useState('')

  useEffect(() => {
    listarHallazgos()
      .then(setHallazgos)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar hallazgos'))
      .finally(() => setLoading(false))
  }, [])

  const ind = useMemo(() => calcularIndicadores(hallazgos, areas, periodo, areaId), [hallazgos, areas, periodo, areaId])
  const areaLbl = areaId ? nombreArea(areaId) : 'Todas'
  const topAreas = ind.porArea.filter((a) => a.reportados > 0).slice(0, 8)

  async function exportar(fn: () => Promise<void>) {
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo exportar')
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (error) return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IndicadoresFecha />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={selectClase} aria-label="Período">
            {PERIODOS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase} aria-label="Área">
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          {puede('exportar') && (
            <>
              <Button size="sm" variant="outline" onClick={() => exportar(() => exportarIndicadoresExcel(ind, periodo, areaLbl))}>
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportar(() => exportarIndicadoresPdf(ind, periodo, areaLbl))}>
                <FileText className="mr-1 h-4 w-4" /> PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          titulo="Pendientes hoy"
          valor={String(ind.pendientes)}
          detalle={`${ind.porEstado.abierto} ${ESTADO_META.abierto.label.toLowerCase()} · ${ind.porEstado.en_proceso} en proceso · ${ind.porEstado.pend_verificacion} en verificación`}
        />
        <Tile titulo="Vencidos hoy" valor={String(ind.vencidos)} alerta={ind.vencidos > 0} detalle="Pendientes con el plazo cumplido" />
        <Tile titulo="Cerrados en el período" valor={String(ind.cerrados)} detalle={`${ind.reportados} reportados en el mismo período`} />
        <Tile
          titulo="Cumplimiento de plazo"
          valor={ind.pctEnPlazo === null ? '—' : `${ind.pctEnPlazo}%`}
          detalle={ind.cerrados ? `${ind.cerradosEnPlazo} de ${ind.cerrados} cerrados a tiempo` : 'Sin cierres en el período'}
        />
        <Tile
          titulo="Días promedio de cierre"
          valor={ind.diasPromedioCierre === null ? '—' : String(ind.diasPromedioCierre).replace('.', ',')}
          detalle="Desde la detección hasta el cierre"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-bold">Tendencia mensual</p>
            <p className="mb-2 text-xs text-muted-foreground">Hallazgos reportados y cerrados por mes</p>
            <ChartContainer config={configTendencia} className="aspect-auto h-[260px] w-full">
              <LineChart data={ind.tendencia} margin={{ left: 0, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="reportados" type="monotone" stroke="var(--color-reportados)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                <Line dataKey="cerrados" type="monotone" stroke="var(--color-cerrados)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-bold">Áreas con más hallazgos</p>
            <p className="mb-2 text-xs text-muted-foreground">Reportados en el período</p>
            {topAreas.length === 0 ? (
              <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sin hallazgos en el período.</p>
            ) : (
              <ChartContainer config={configAreas} className="aspect-auto h-[260px] w-full">
                <BarChart data={topAreas} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="area" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                  <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="reportados" fill="var(--color-reportados)" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-2 text-sm font-bold">Detalle por área</p>
          {ind.porArea.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin hallazgos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Reportados</TableHead>
                  <TableHead className="text-right">Pendientes</TableHead>
                  <TableHead className="text-right">Vencidos</TableHead>
                  <TableHead className="text-right">Cerrados</TableHead>
                  <TableHead className="text-right">% en plazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ind.porArea.map((a) => (
                  <TableRow key={a.areaId ?? 'sin-area'}>
                    <TableCell className="font-medium">{a.area}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{a.reportados}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{a.pendientes}</TableCell>
                    <TableCell className={cn('text-right font-mono-tabular', a.vencidos > 0 && 'font-bold text-red-700 dark:text-red-400')}>{a.vencidos}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{a.cerrados}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{a.pctEnPlazo === null ? '—' : `${a.pctEnPlazo}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

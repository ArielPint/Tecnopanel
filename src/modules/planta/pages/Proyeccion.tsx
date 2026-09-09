import { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, XAxis, YAxis } from 'recharts'
import { Download, Info } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { formatCLP, formatCLPCompact, formatFecha, formatPct } from '@/modules/financiero/utils/formatters'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { cn } from '@/lib/utils'
import { yHeadroom } from '@/lib/chartDomain'
import { useProyeccionData } from '../hooks/useProyeccionData'
import { BASE_PRECIO_LABEL, type BasePrecio } from '../lib/proyeccionCostos'

const BASES: BasePrecio[] = ['ppp', 'ppto', 'ultimo']

const fmtNum = (v: number | null | undefined, dec = 0) =>
  v == null ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** Precios unitarios bajo $100 necesitan decimales: formatCLP los redondearía a "$3". */
const fmtUnitario = (v: number | null | undefined) => {
  if (v == null) return '—'
  return Math.abs(v) >= 100 ? formatCLP(v) : `$${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: 'success' | 'warning' | 'destructive' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tono === 'success' && 'text-success', tono === 'warning' && 'text-warning', tono === 'destructive' && 'text-destructive')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function Proyeccion() {
  const [base, setBase] = useState<BasePrecio>('ppp')
  const [ritmoInput, setRitmoInput] = useState('')
  const ritmoManual = ritmoInput.trim() === '' ? null : Number(ritmoInput) || 0
  const d = useProyeccionData({ base, ritmoManual })

  const curva = useMemo(
    () => d.proyeccion.curva.map((p) => ({ mes: p.mes, real: p.real, proyectado: p.proyectado, acumulado: p.acumulado })),
    [d.proyeccion.curva],
  )

  const chartConfig = {
    acumulado: { label: 'Acumulado (eje izq.)', color: '#4f8ef7' },
    real: { label: 'Real del mes (eje der.)', color: '#3fb950' },
    proyectado: { label: 'Proyectado del mes (eje der.)', color: '#f2a340' },
  } satisfies ChartConfig

  function exportarDesglose() {
    exportarExcel(
      `costo_por_modulo_${base}`,
      d.costoModulo.lineas.map((l) => ({
        Código: l.codigo,
        Descripción: l.descripcion,
        Unidad: l.unidad,
        Grupo: l.grupo,
        'Cant/Módulo': l.cantidad,
        [`Precio (${BASE_PRECIO_LABEL[base]})`]: l.precio ?? '',
        'Costo por módulo': Math.round(l.costo),
        'Incidencia %': +(l.incidencia * 100).toFixed(2),
        'Costo 32 módulos (torre)': Math.round(l.costo * 32),
        [`Costo ${d.modulosTotales} módulos (proyecto)`]: Math.round(l.costo * d.modulosTotales),
      })),
    )
  }

  function exportarTorres() {
    exportarExcel(
      `monto_por_torre_${base}`,
      d.torres.map((t) => ({
        Torre: t.torre,
        Módulos: t.modulos,
        Terminados: t.terminados,
        Pendientes: t.pendientes,
        'Avance %': +(t.avance * 100).toFixed(1),
        'Monto torre completa': Math.round(t.costoTotal),
        'Monto terminado': Math.round(t.costoTerminado),
        'Monto pendiente': Math.round(t.costoPendiente),
      })),
    )
  }

  if (d.error) return <p className="text-destructive">{d.error}</p>

  const pctPresupuesto = d.presupuestoTotal ? d.proyeccion.totalProyectado / d.presupuestoTotal : null
  const sobrePresupuesto = !!(d.presupuestoTotal && d.proyeccion.totalProyectado > d.presupuestoTotal)

  return (
    <div className="space-y-4">
      <IndicadoresFecha />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Supuestos del análisis</CardTitle>
          <CardDescription>
            El costo por módulo se valoriza con la receta del catálogo (cantidad por módulo) al precio que elijas.
            No existe gasto real por módulo: el campo de módulo en el registro de compras es texto libre, así que el
            costo por módulo es siempre una valorización o un promedio, nunca un rastreo módulo a módulo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Precio de valorización</Label>
            <div className="flex gap-1">
              {BASES.map((b) => (
                <Button key={b} size="sm" variant={base === b ? 'default' : 'outline'} className="h-8" onClick={() => setBase(b)}>
                  {BASE_PRECIO_LABEL[b]}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inp-ritmo" className="text-xs">Ritmo (módulos/mes)</Label>
            <Input
              id="inp-ritmo"
              type="number"
              min={0}
              step={1}
              className="h-8 w-32"
              placeholder={d.ritmoObservado != null ? `obs. ${fmtNum(d.ritmoObservado, 1)}` : 'sin dato'}
              value={ritmoInput}
              onChange={(e) => setRitmoInput(e.target.value)}
            />
            <span className="text-[.7rem] text-muted-foreground">
              {d.ritmoObservado != null
                ? `Observado: ${fmtNum(d.ritmoObservado, 1)} mód/mes (despachos, últimos 3 meses cerrados)`
                : 'Sin despachos para estimar el ritmo'}
            </span>
          </div>
          {d.costoModulo.sinPrecio > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0" />
              {d.costoModulo.sinPrecio} de {d.costoModulo.productos} productos de la receta no tienen {BASE_PRECIO_LABEL[base].toLowerCase()}: van en $0.
            </p>
          )}
        </CardContent>
      </Card>

      {d.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Módulos del proyecto" value={fmtNum(d.modulosTotales)} sub={`${d.torres.length} torres × ${d.torres[0]?.modulos ?? 0} módulos`} />
            <Kpi label="Terminados" value={fmtNum(d.terminados)} sub={formatPct(d.modulosTotales ? d.terminados / d.modulosTotales : null)} tono="success" />
            <Kpi label="Por fabricar" value={fmtNum(d.restantes)} tono="warning" />
            <Kpi
              label="Término estimado"
              value={d.proyeccion.fechaTermino ? formatFecha(d.proyeccion.fechaTermino.toISOString().slice(0, 10)) : '—'}
              sub={d.proyeccion.mesesRestantes ? `${fmtNum(d.proyeccion.mesesRestantes, 1)} meses al ritmo de ${fmtNum(d.ritmo, 1)} mód/mes` : undefined}
            />

            <Kpi label="Costo teórico por módulo" value={formatCLP(d.costoModulo.total)} sub={`Receta de ${d.costoModulo.productos} productos a ${BASE_PRECIO_LABEL[base].toLowerCase()}`} />
            <Kpi
              label="Costo real por módulo"
              value={formatCLP(d.real.porModuloAjustado)}
              sub={`Sin ajustar: ${formatCLP(d.real.porModuloCrudo)} · descuenta ${formatCLPCompact(d.real.stockValorizado)} de stock`}
            />
            <Kpi
              label="Brecha real vs teórico"
              value={d.brecha ? `${d.brecha.relativa > 0 ? '+' : ''}${formatPct(d.brecha.relativa)}` : '—'}
              sub={d.brecha ? `${d.brecha.absoluta > 0 ? '+' : ''}${formatCLP(d.brecha.absoluta)} por módulo` : undefined}
              tono={d.brecha && d.brecha.relativa > 0 ? 'destructive' : 'success'}
            />
            <Kpi label="Comprado a la fecha" value={formatCLP(d.real.comprado)} sub={d.presupuestoTotal ? `${formatPct(d.real.comprado / d.presupuestoTotal)} del presupuesto` : undefined} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Proyecto completo — {d.modulosTotales} módulos</CardTitle>
              <CardDescription>Valorizado a {BASE_PRECIO_LABEL[base].toLowerCase()}, en pesos de hoy y sin reajuste de precios</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Comprado a la fecha ({fmtNum(d.terminados)} módulos terminados)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(d.real.comprado)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Falta comprar — teórico ({fmtNum(d.restantes)} módulos × {formatCLP(d.costoModulo.total)})</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">{formatCLP(d.proyeccion.faltante)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-bold">Total proyectado fin de proyecto — teórico</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatCLP(d.proyeccion.totalProyectado)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Total proyectado al costo real por módulo ({formatCLP(d.real.porModuloAjustado)})</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatCLP(d.proyeccionReal.totalProyectado)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Presupuesto del proyecto</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(d.presupuestoTotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-bold">Desviación proyectada vs presupuesto</TableCell>
                    <TableCell className={cn('text-right font-bold tabular-nums', sobrePresupuesto ? 'text-destructive' : 'text-success')}>
                      {d.presupuestoTotal ? `${formatCLP(d.proyeccion.totalProyectado - d.presupuestoTotal)} (${formatPct(pctPresupuesto != null ? pctPresupuesto - 1 : null)})` : '—'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Compras acumuladas — real y proyección hasta las {d.torres.length} torres</CardTitle>
              <CardDescription>
                La proyección arranca el mes siguiente al actual, a {fmtNum(d.ritmo, 1)} módulos/mes × {formatCLP(d.costoModulo.total)} por módulo
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* El acumulado llega a ~$11 mil M y el gasto mensual ronda los $500 M: en un
                  solo eje las barras del mes quedan pegadas al piso, así que el mensual va
                  en el eje derecho. */}
              <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
                <ComposedChart data={curva} margin={{ left: 8, right: 8, top: 16 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-40} textAnchor="end" height={60} interval="preserveStartEnd" />
                  <YAxis yAxisId="acum" domain={yHeadroom} tickFormatter={(v) => formatCLPCompact(Number(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                  <YAxis yAxisId="mes" orientation="right" domain={yHeadroom} tickFormatter={(v) => formatCLPCompact(Number(v))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCLP(Number(v))} />} />
                  <Bar yAxisId="mes" dataKey="real" fill="var(--color-real)" radius={3} />
                  <Bar yAxisId="mes" dataKey="proyectado" fill="var(--color-proyectado)" radius={3} fillOpacity={0.55} />
                  <Area yAxisId="acum" type="monotone" dataKey="acumulado" stroke="var(--color-acumulado)" fill="var(--color-acumulado)" fillOpacity={0.16} strokeWidth={2.5} />
                  <Legend content={<ChartLegendContent />} />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Monto por torre</CardTitle>
                <CardDescription>{formatCLP(d.costoModulo.total)} por módulo × los módulos de cada torre</CardDescription>
              </div>
              <CardAction>
                <Button variant="outline" size="sm" className="h-8" onClick={exportarTorres}>
                  <Download className="mr-1 h-4 w-4" /> Excel
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Torre</TableHead>
                      <TableHead className="text-right">Módulos</TableHead>
                      <TableHead className="text-right">Terminados</TableHead>
                      <TableHead className="text-right">Avance</TableHead>
                      <TableHead className="text-right">Monto torre</TableHead>
                      <TableHead className="text-right">Terminado</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.torres.map((t) => (
                      <TableRow key={t.torre}>
                        <TableCell className="font-medium">{t.torre}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(t.modulos)}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">{fmtNum(t.terminados)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPct(t.avance)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(t.costoTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">{formatCLP(t.costoTerminado)}</TableCell>
                        <TableCell className="text-right tabular-nums text-warning">{formatCLP(t.costoPendiente)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell>Total proyecto</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(d.modulosTotales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(d.terminados)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPct(d.modulosTotales ? d.terminados / d.modulosTotales : null)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(d.modulosTotales * d.costoModulo.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(d.terminados * d.costoModulo.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(d.restantes * d.costoModulo.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Costo por módulo — desglose</CardTitle>
                <CardDescription>
                  {d.costoModulo.productos} productos con cantidad por módulo · {formatCLP(d.costoModulo.total)} por módulo a {BASE_PRECIO_LABEL[base].toLowerCase()}
                </CardDescription>
              </div>
              <CardAction>
                <Button variant="outline" size="sm" className="h-8" onClick={exportarDesglose}>
                  <Download className="mr-1 h-4 w-4" /> Excel
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Cant/Módulo</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Costo/Módulo</TableHead>
                      <TableHead className="text-right">Incidencia</TableHead>
                      <TableHead className="text-right">Costo torre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.costoModulo.lineas.map((l) => (
                      <TableRow key={l.codigo}>
                        <TableCell className="font-mono text-xs text-primary">{l.codigo}</TableCell>
                        <TableCell className="max-w-sm truncate text-sm" title={l.descripcion}>{l.descripcion}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(l.cantidad, l.cantidad % 1 ? 2 : 0)} {l.unidad}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', l.precio == null && 'text-warning')}>{l.precio == null ? 'sin precio' : fmtUnitario(l.precio)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(l.costo)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatPct(l.incidencia)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCLP(l.costo * (d.torres[0]?.modulos ?? 32))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

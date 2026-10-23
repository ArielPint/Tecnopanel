import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import {
  generarPeriodos, hoyChile, puente, serie, sumarMeses, sumarDias, etiquetaFechaCorta, formatMM,
  type Granularidad, type Historia,
} from '../../lib/backlogAnalisis'
import { useFotosBacklog } from '../../hooks/useBacklogHistoria'
import { CONFIG_LINEAS, CONFIG_SUCURSALES, COLOR_PRINCIPAL, COLOR_SECUNDARIO, COLOR_SUBE, LINEAS, SUCURSALES, claveLinea, claveSucursal } from './colores'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/modules/financiero/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

type Separar = 'total' | 'linea' | 'sucursal'

const RANGOS: Record<Granularidad, { valor: number; label: string }[]> = {
  mes: [
    { valor: 12, label: '12 meses' },
    { valor: 24, label: '24 meses' },
    { valor: 0, label: 'Desde 2021' },
  ],
  semana: [
    { valor: 13, label: '13 semanas' },
    { valor: 26, label: '26 semanas' },
    { valor: 52, label: '52 semanas' },
  ],
}

const CONFIG_TOTAL: ChartConfig = { total: { label: 'Backlog', theme: COLOR_PRINCIPAL } }
const CONFIG_FLUJOS: ChartConfig = {
  entradas: { label: 'Contratado (notas de venta nuevas)', theme: COLOR_PRINCIPAL },
  salidas: { label: 'Despachado + facturado sin guía', theme: COLOR_SECUNDARIO },
}
const CONFIG_BTB: ChartConfig = { btb: { label: 'Book-to-bill', theme: COLOR_PRINCIPAL } }
const CONFIG_COBERTURA: ChartConfig = { cobertura: { label: 'Meses de cobertura', theme: COLOR_PRINCIPAL } }
const CONFIG_PUENTE: ChartConfig = {
  total: { label: 'Backlog', theme: COLOR_PRINCIPAL },
  sube: { label: 'Aumenta', theme: COLOR_SUBE },
  baja: { label: 'Disminuye', theme: COLOR_SECUNDARIO },
}

function Opciones<T extends string | number>({
  valor, opciones, onChange,
}: {
  valor: T
  opciones: { valor: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {opciones.map((o) => (
        <Button key={String(o.valor)} size="sm" variant={valor === o.valor ? 'default' : 'outline'} onClick={() => onChange(o.valor)}>
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function Grafico({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div>
          <h3 className="text-sm font-bold">{titulo}</h3>
          {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

const ejeY = { tickLine: false, axisLine: false, width: 88, fontSize: 11 } as const
const TOPE_BTB = 4
const ejeX = { dataKey: 'etiqueta', tickLine: false, axisLine: false, fontSize: 11, minTickGap: 16 } as const

export default function Tendencia({ historia, incluir }: { historia: Historia; incluir: (codigo: string) => boolean }) {
  const [gran, setGran] = useState<Granularidad>('mes')
  const [rango, setRango] = useState(24)
  const [separar, setSeparar] = useState<Separar>('total')
  const [verTabla, setVerTabla] = useState(false)
  const hoy = useMemo(() => hoyChile(), [])

  const periodos = useMemo(() => {
    const desde = rango === 0 ? '2021-01-01' : gran === 'mes' ? sumarMeses(hoy, -(rango - 1)) : sumarDias(hoy, -7 * (rango - 1))
    return generarPeriodos(gran, desde, hoy)
  }, [gran, rango, hoy])

  const desdePuente = periodos[0]?.inicio ?? hoy
  const fechasFoto = useMemo(() => [...periodos.map((p) => p.fin), sumarDias(desdePuente, -1)], [periodos, desdePuente])
  const { fotos, loading } = useFotosBacklog(fechasFoto)

  const puntos = useMemo(() => serie(historia, periodos, fotos, incluir), [historia, periodos, fotos, incluir])
  const elPuente = useMemo(() => puente(historia, desdePuente, hoy, fotos, incluir), [historia, desdePuente, hoy, fotos, incluir])

  const primeraFoto = puntos.find((p) => p.fuente === 'foto')
  const datos = puntos.map((p) => {
    const fila: Record<string, string | number | null> = {
      etiqueta: p.periodo.etiqueta + (p.periodo.enCurso ? '*' : ''),
      total: Math.round(p.backlog),
      entradas: Math.round(p.entradas),
      salidas: Math.round(p.salidas),
      btb: p.bookToBill == null ? null : Math.round(Math.min(p.bookToBill, TOPE_BTB) * 100) / 100,
      btbReal: p.bookToBill,
      cobertura: p.cobertura == null ? null : Math.round(p.cobertura * 10) / 10,
    }
    for (const [l, v] of Object.entries(p.porLinea)) fila[claveLinea(l)] = Math.round(v)
    for (const [s, v] of Object.entries(p.porSucursal)) fila[claveSucursal(s)] = Math.round(v)
    return fila
  })

  // Solo las series con datos en el rango, en su orden fijo (el color sigue a la línea, no a la posición)
  const seriesEvolucion =
    separar === 'linea'
      ? LINEAS.filter((l) => puntos.some((p) => (p.porLinea[l.nombre] ?? 0) > 0))
      : separar === 'sucursal'
        ? SUCURSALES.filter((s) => puntos.some((p) => (p.porSucursal[s.nombre] ?? 0) > 0))
        : [{ nombre: 'Backlog', clave: 'total' }]
  const configEvolucion = separar === 'linea' ? CONFIG_LINEAS : separar === 'sucursal' ? CONFIG_SUCURSALES : CONFIG_TOTAL

  // Puente en cascada: base invisible + tramo visible
  const pasos = [
    { nombre: 'Inicial', valor: elPuente.inicial, tipo: 'total' },
    { nombre: 'Contratado', valor: elPuente.entradas, tipo: 'delta' },
    { nombre: 'Despachado', valor: -elPuente.despachado, tipo: 'delta' },
    { nombre: 'Fact. sin guía', valor: -elPuente.facturadoSinGuia, tipo: 'delta' },
    { nombre: 'Ajustes', valor: elPuente.ajustes, tipo: 'delta' },
    { nombre: 'Final', valor: elPuente.final, tipo: 'total' },
  ]
  let nivel = 0
  const datosPuente = pasos.map((p) => {
    if (p.tipo === 'total') {
      nivel = p.valor
      return { nombre: p.nombre, base: 0, tramo: Math.round(p.valor), valor: p.valor, color: 'total' }
    }
    const desde = nivel
    nivel += p.valor
    return {
      nombre: p.nombre,
      base: Math.round(Math.min(desde, nivel)),
      tramo: Math.round(Math.abs(p.valor)),
      valor: p.valor,
      color: p.valor >= 0 ? 'sube' : 'baja',
    }
  })

  function exportar() {
    exportarExcel(
      `backlog-tendencia-${gran}`,
      puntos.map((p) => ({
        Período: p.periodo.etiqueta,
        Desde: p.periodo.inicio,
        Hasta: p.periodo.fin,
        'En curso': p.periodo.enCurso ? 'sí' : '',
        'Backlog al cierre (CLP)': Math.round(p.backlog),
        Fuente: p.fuente === 'foto' ? 'foto diaria' : 'reconstruido',
        'Contratado (CLP)': Math.round(p.entradas),
        'Despachado (CLP)': Math.round(p.despachado),
        'Facturado sin guía (CLP)': Math.round(p.facturadoSinGuia),
        'Book-to-bill': p.bookToBill ?? '',
        'Meses de cobertura': p.cobertura ?? '',
        ...Object.fromEntries(LINEAS.map((l) => [`Backlog ${l.nombre}`, Math.round(p.porLinea[l.nombre] ?? 0)])),
      })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Opciones<Granularidad>
          valor={gran}
          opciones={[{ valor: 'mes', label: 'Por mes' }, { valor: 'semana', label: 'Por semana' }]}
          onChange={(g) => {
            setGran(g)
            setRango(g === 'mes' ? 24 : 26)
          }}
        />
        <Opciones<number> valor={rango} opciones={RANGOS[gran]} onChange={setRango} />
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setVerTabla((v) => !v)}>
            {verTabla ? 'Ver gráficos' : 'Ver tabla'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportar}>
            <Download size={14} /> Exportar
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {primeraFoto
          ? primeraFoto === puntos[0]
            ? 'Todo el rango sale de la foto diaria. '
            : `Antes de ${primeraFoto.periodo.etiqueta} el backlog es reconstruido desde SAP (aproximado: la fecha de cierre de una nota de venta es su última modificación); desde ahí sale de la foto diaria. `
          : 'El backlog de cada período es reconstruido desde SAP (aproximado: la fecha de cierre de una nota de venta es su última modificación). '}
        Contratado, despachado y facturado son exactos. * = período en curso (hasta hoy).
        {loading && ' Cargando fotos…'}
      </p>

      {verTabla ? (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Backlog</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Despachado + fact. sin guía</TableHead>
                  <TableHead className="text-right">Book-to-bill</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead>Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...puntos].reverse().map((p) => (
                  <TableRow key={p.periodo.clave}>
                    <TableCell className="font-medium">{p.periodo.etiqueta}{p.periodo.enCurso ? '*' : ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(p.backlog)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(p.entradas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(p.salidas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.bookToBill == null ? '—' : p.bookToBill.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.cobertura == null ? '—' : `${p.cobertura.toFixed(1)} meses`}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.fuente === 'foto' ? 'foto diaria' : 'reconstruido'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Grafico titulo="Evolución del backlog" detalle="Backlog al cierre de cada período.">
            <Opciones<Separar>
              valor={separar}
              opciones={[
                { valor: 'total', label: 'Total' },
                { valor: 'linea', label: 'Por línea' },
                { valor: 'sucursal', label: 'Por sucursal' },
              ]}
              onChange={setSeparar}
            />
            <ChartContainer config={configEvolucion} className="aspect-auto h-72 w-full">
              <AreaChart data={datos} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis {...ejeX} />
                <YAxis {...ejeY} tickFormatter={(v) => formatMM(v)} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(v, n) => `${configEvolucion[n as string]?.label ?? n}: ${formatMM(Number(v))}`} />}
                />
                {primeraFoto && primeraFoto !== puntos[0] && (
                  <ReferenceLine
                    x={primeraFoto.periodo.etiqueta + (primeraFoto.periodo.enCurso ? '*' : '')}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{ value: 'foto diaria', position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  />
                )}
                {seriesEvolucion.map((s) => (
                  <Area
                    key={s.clave}
                    dataKey={s.clave}
                    type="linear"
                    stackId="1"
                    stroke={`var(--color-${s.clave})`}
                    strokeWidth={2}
                    fill={`var(--color-${s.clave})`}
                    fillOpacity={separar === 'total' ? 0.15 : 0.75}
                  />
                ))}
                {seriesEvolucion.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              </AreaChart>
            </ChartContainer>
          </Grafico>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Grafico
              titulo={`Puente del backlog: ${etiquetaFechaCorta(sumarDias(desdePuente, -1))} → hoy`}
              detalle="Por qué subió o bajó en el rango elegido. Ajustes: notas de venta cerradas con saldo, proyectos que quedan sin saldo y diferencias entre la reconstrucción y la foto."
            >
              <ChartContainer config={CONFIG_PUENTE} className="aspect-auto h-72 w-full">
                <BarChart data={datosPuente} margin={{ left: 4, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="nombre" tickLine={false} axisLine={false} fontSize={10} interval={0} angle={-30} textAnchor="end" height={56} />
                  <YAxis {...ejeY} tickFormatter={(v) => formatMM(v)} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        formatter={(_v, n, item) => (n === 'base' ? null : formatMM(Number((item?.payload as { valor: number }).valor)))}
                      />
                    }
                  />
                  <Bar dataKey="base" stackId="p" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="tramo" stackId="p" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {datosPuente.map((d) => (
                      <Cell key={d.nombre} fill={`var(--color-${d.color})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
              <p className="text-xs text-muted-foreground">
                {formatMM(elPuente.inicial)} + {formatMM(elPuente.entradas)} − {formatMM(elPuente.despachado)} −{' '}
                {formatMM(elPuente.facturadoSinGuia)} {elPuente.ajustes >= 0 ? '+' : '−'} {formatMM(Math.abs(elPuente.ajustes))} ={' '}
                <strong>{formatMM(elPuente.final)}</strong>
              </p>
            </Grafico>

            <Grafico titulo="Entradas vs salidas" detalle="Notas de venta nuevas contra lo despachado y facturado sin guía en cada período.">
              <ChartContainer config={CONFIG_FLUJOS} className="aspect-auto h-72 w-full">
                <BarChart data={datos} margin={{ left: 4, right: 4, top: 8 }} barGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis {...ejeX} />
                  <YAxis {...ejeY} tickFormatter={(v) => formatMM(v)} />
                  <ChartTooltip
                    content={<ChartTooltipContent formatter={(v, n) => `${CONFIG_FLUJOS[n as string]?.label ?? n}: ${formatMM(Number(v))}`} />}
                  />
                  <Bar dataKey="entradas" fill="var(--color-entradas)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="salidas" fill="var(--color-salidas)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            </Grafico>

            <Grafico
              titulo="Book-to-bill"
              detalle="Contratado ÷ (despachado + facturado sin guía). Sobre 1 el backlog crece; bajo 1 se consume."
            >
              <ChartContainer config={CONFIG_BTB} className="aspect-auto h-56 w-full">
                <LineChart data={datos} margin={{ left: 4, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis {...ejeX} />
                  <YAxis {...ejeY} width={40} domain={[0, TOPE_BTB]} allowDataOverflow />
                  <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(_v, _n, item) => `Book-to-bill: ${Number((item?.payload as { btbReal: number }).btbReal).toFixed(2)}`}
                      />
                    }
                  />
                  <Line dataKey="btb" type="linear" stroke="var(--color-btb)" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ChartContainer>
              {puntos.some((p) => (p.bookToBill ?? 0) > TOPE_BTB) && (
                <p className="text-xs text-muted-foreground">
                  Escala hasta {TOPE_BTB}:{' '}
                  {puntos
                    .filter((p) => (p.bookToBill ?? 0) > TOPE_BTB)
                    .map((p) => `${p.periodo.etiqueta} = ${p.bookToBill!.toFixed(1)}`)
                    .join(', ')}{' '}
                  (en el borde superior).
                </p>
              )}
            </Grafico>

            <Grafico
              titulo="Meses de cobertura"
              detalle="Backlog al cierre ÷ promedio mensual de despachado + facturado sin guía de los 3 meses anteriores."
            >
              <ChartContainer config={CONFIG_COBERTURA} className="aspect-auto h-56 w-full">
                <LineChart data={datos} margin={{ left: 4, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis {...ejeX} />
                  <YAxis {...ejeY} width={40} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => `Cobertura: ${Number(v).toFixed(1)} meses`} />} />
                  <Line dataKey="cobertura" type="linear" stroke="var(--color-cobertura)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ChartContainer>
            </Grafico>
          </div>
        </>
      )}
    </div>
  )
}

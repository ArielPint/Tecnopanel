import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  antiguedad, backlogEn, concentracion, detenidos, etiquetaFechaCorta, flujosEntre, generarPeriodos, hoyChile,
  sumarDias, sumarMeses, TRAMOS_ANTIGUEDAD, formatMM, type FotoProyecto, type Historia, type Periodo,
} from '../../lib/backlogAnalisis'
import { useFotosBacklog } from '../../hooks/useBacklogHistoria'
import { COLOR_PRINCIPAL } from './colores'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

const CONFIG_MONTO: ChartConfig = { monto: { label: 'Backlog', theme: COLOR_PRINCIPAL } }

function pct(v: number): string {
  return `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  const d = actual - anterior
  const p = anterior !== 0 ? d / Math.abs(anterior) : null
  const signo = d > 0 ? '+' : d < 0 ? '−' : ''
  return (
    <span className="tabular-nums">
      {signo}
      {formatMM(Math.abs(d))}
      {p != null && <span className="ml-1 text-xs text-muted-foreground">({signo}{pct(Math.abs(p))})</span>}
    </span>
  )
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-xl font-extrabold tabular-nums">{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

function Seccion({ titulo, detalle, children, extra }: { titulo: string; detalle?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">{titulo}</h3>
            {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
          </div>
          {extra}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

interface Medida {
  backlog: number
  entradas: number
  salidas: number
}

function medir(h: Historia, p: Periodo, fotos: Map<string, FotoProyecto[]>, incluir: (c: string) => boolean): Medida {
  let backlog = 0
  for (const v of backlogEn(h, p.fin, fotos, incluir).porProyecto.values()) backlog += v
  const f = flujosEntre(h, p.inicio, p.fin, incluir)
  return { backlog, entradas: f.entradas, salidas: f.despachado + f.facturadoSinGuia }
}

export default function Resumen({ historia, incluir }: { historia: Historia; incluir: (codigo: string) => boolean }) {
  const hoy = useMemo(() => hoyChile(), [])
  const [porConcentracion, setPorConcentracion] = useState<'cliente' | 'proyecto'>('cliente')
  const [minimoDias, setMinimoDias] = useState(60)
  const [verTodos, setVerTodos] = useState(false)

  // Últimas semanas y meses completos (el período en curso queda fuera de la comparación)
  const comparaciones = useMemo(() => {
    const semanas = generarPeriodos('semana', sumarDias(hoy, -21), hoy).filter((p) => !p.enCurso).slice(-2)
    const meses = generarPeriodos('mes', sumarMeses(hoy, -14), hoy).filter((p) => !p.enCurso)
    const mes = meses[meses.length - 1]
    return [
      { titulo: 'Semana', a: semanas[1], b: semanas[0], nombreB: 'semana anterior' },
      { titulo: 'Mes', a: mes, b: meses[meses.length - 2], nombreB: 'mes anterior' },
      { titulo: 'Mes vs año anterior', a: mes, b: meses[meses.length - 13], nombreB: 'mismo mes del año anterior' },
    ].filter((c) => c.a && c.b)
  }, [hoy])

  const fechasFoto = useMemo(
    () => [hoy, ...comparaciones.flatMap((c) => [c.a.fin, c.b.fin])],
    [hoy, comparaciones],
  )
  const { fotos, loading } = useFotosBacklog(fechasFoto)

  const actual = useMemo(() => backlogEn(historia, hoy, fotos, incluir), [historia, hoy, fotos, incluir])
  const total = useMemo(() => [...actual.porProyecto.values()].reduce((a, v) => a + v, 0), [actual])
  const tresMeses = useMemo(() => flujosEntre(historia, sumarDias(hoy, -90), hoy, incluir), [historia, hoy, incluir])
  const salidas3 = tresMeses.despachado + tresMeses.facturadoSinGuia
  const cobertura = salidas3 > 0 ? total / (salidas3 / 3) : null
  const btb3 = salidas3 > 0 ? tresMeses.entradas / salidas3 : null
  const finMesAnterior = comparaciones.find((c) => c.titulo === 'Mes')?.a.fin
  const backlogMesAnterior = useMemo(() => {
    if (!finMesAnterior) return null
    let t = 0
    for (const v of backlogEn(historia, finMesAnterior, fotos, incluir).porProyecto.values()) t += v
    return t
  }, [historia, finMesAnterior, fotos, incluir])

  const tramos = useMemo(() => antiguedad(historia, actual.porProyecto, hoy), [historia, actual, hoy])
  const datosAntiguedad = TRAMOS_ANTIGUEDAD.map((t) => ({ tramo: t, monto: Math.round(tramos[t]), pct: total > 0 ? tramos[t] / total : 0 }))
  const conc = useMemo(() => concentracion(historia, actual.porProyecto, porConcentracion, 10), [historia, actual, porConcentracion])
  const parados = useMemo(() => detenidos(historia, actual.porProyecto, hoy, minimoDias), [historia, actual, hoy, minimoDias])
  const montoParado = parados.reduce((a, p) => a + p.backlog, 0)

  const medidas = useMemo(
    () => comparaciones.map((c) => ({ ...c, ma: medir(historia, c.a, fotos, incluir), mb: medir(historia, c.b, fotos, incluir) })),
    [comparaciones, historia, fotos, incluir],
  )

  if (total === 0 && !loading) {
    return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No hay backlog con estos filtros.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          titulo="BACKLOG HOY"
          valor={formatCLP(total)}
          detalle={
            backlogMesAnterior != null && (
              <>
                vs cierre del mes anterior: <Variacion actual={total} anterior={backlogMesAnterior} />
              </>
            )
          }
        />
        <Kpi titulo="PROYECTOS CON BACKLOG" valor={actual.porProyecto.size} />
        <Kpi
          titulo="MESES DE COBERTURA"
          valor={cobertura == null ? '—' : `${cobertura.toLocaleString('es-CL', { maximumFractionDigits: 1 })} meses`}
          detalle={`Despacho promedio: ${formatMM(salidas3 / 3)} al mes (últimos 3 meses)`}
        />
        <Kpi
          titulo="BOOK-TO-BILL (3 MESES)"
          valor={btb3 == null ? '—' : btb3.toFixed(2)}
          detalle={btb3 == null ? undefined : btb3 >= 1 ? 'Se contrata más de lo que se despacha: el backlog crece' : 'Se despacha más de lo que se contrata: el backlog se consume'}
        />
      </div>

      <Seccion titulo="Comparación de períodos" detalle="Últimos períodos completos. El backlog es al cierre de cada período.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Comparación</TableHead>
              <TableHead>Medida</TableHead>
              <TableHead className="text-right">Período</TableHead>
              <TableHead className="text-right">Contra</TableHead>
              <TableHead className="text-right">Variación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medidas.flatMap((m) =>
              (
                [
                  ['Backlog al cierre', m.ma.backlog, m.mb.backlog],
                  ['Contratado', m.ma.entradas, m.mb.entradas],
                  ['Despachado + fact. sin guía', m.ma.salidas, m.mb.salidas],
                ] as const
              ).map(([medida, a, b], i) => (
                <TableRow key={`${m.titulo}-${medida}`}>
                  {i === 0 && (
                    <TableCell rowSpan={3} className="align-top">
                      <p className="font-medium">{m.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {etiquetaFechaCorta(m.a.inicio)} – {etiquetaFechaCorta(m.a.fin)}
                        <br />
                        vs {m.nombreB} ({etiquetaFechaCorta(m.b.inicio)} – {etiquetaFechaCorta(m.b.fin)})
                      </p>
                    </TableCell>
                  )}
                  <TableCell>{medida}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMM(a)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMM(b)}</TableCell>
                  <TableCell className="text-right">
                    <Variacion actual={a} anterior={b} />
                  </TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </Seccion>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Seccion
          titulo="Antigüedad del backlog"
          detalle="Según la fecha de la nota de venta. Lo despachado consume primero las notas más antiguas."
        >
          <ChartContainer config={CONFIG_MONTO} className="aspect-auto h-56 w-full">
            <BarChart data={datosAntiguedad} layout="vertical" margin={{ left: 4, right: 56 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => formatMM(v)} />
              <YAxis type="category" dataKey="tramo" tickLine={false} axisLine={false} fontSize={11} width={104} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator formatter={(v) => formatMM(Number(v))} />} />
              <Bar dataKey="monto" fill="var(--color-monto)" radius={[0, 4, 4, 0]} maxBarSize={28}>
                <LabelList dataKey="pct" position="right" fontSize={11} formatter={(v: unknown) => pct(Number(v))} className="fill-foreground" />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Seccion>

        <Seccion
          titulo="Concentración"
          detalle={`Los 10 mayores suman ${pct(conc.filas[conc.filas.length - 1]?.acumulada ?? 0)} del backlog.`}
          extra={
            <div className="flex gap-1">
              <Button size="sm" variant={porConcentracion === 'cliente' ? 'default' : 'outline'} onClick={() => setPorConcentracion('cliente')}>
                Clientes
              </Button>
              <Button size="sm" variant={porConcentracion === 'proyecto' ? 'default' : 'outline'} onClick={() => setPorConcentracion('proyecto')}>
                Proyectos
              </Button>
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{porConcentracion === 'cliente' ? 'Cliente' : 'Proyecto'}</TableHead>
                <TableHead className="text-right">Backlog</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">% acum.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conc.filas.map((f) => (
                <TableRow key={f.clave}>
                  <TableCell className="max-w-[16rem] truncate text-sm" title={f.clave}>{f.clave}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMM(f.monto)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className="mr-2 inline-block h-2 rounded-full align-middle"
                      style={{ width: `${Math.max(2, f.participacion * 60)}px`, backgroundColor: 'hsl(var(--chart-1))' }}
                    />
                    {pct(f.participacion)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{pct(f.acumulada)}</TableCell>
                </TableRow>
              ))}
              {conc.resto > 0 && (
                <TableRow>
                  <TableCell className="text-sm text-muted-foreground">Resto</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatMM(conc.resto)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{pct(conc.total > 0 ? conc.resto / conc.total : 0)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Seccion>
      </div>

      <Seccion
        titulo="Proyectos detenidos"
        detalle={`Con backlog y sin guías ni facturas sin guía en más de ${minimoDias} días (si nunca se despachó, desde la primera nota de venta): ${parados.length} proyectos, ${formatMM(montoParado)} (${pct(total > 0 ? montoParado / total : 0)} del backlog).`}
        extra={
          <div className="flex gap-1">
            {[30, 60, 90].map((d) => (
              <Button key={d} size="sm" variant={minimoDias === d ? 'default' : 'outline'} onClick={() => setMinimoDias(d)}>
                +{d} días
              </Button>
            ))}
          </div>
        }
      >
        {parados.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No hay proyectos detenidos con este criterio.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Backlog</TableHead>
                <TableHead className="text-right">Última actividad</TableHead>
                <TableHead className="text-right">Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(verTodos ? parados : parados.slice(0, 15)).map((p) => (
                <TableRow key={p.codigo}>
                  <TableCell className="max-w-[22rem] truncate font-medium" title={p.nombre}>{p.nombre}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm text-muted-foreground" title={p.cliente ?? ''}>{p.cliente ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.linea ?? 'Sin línea'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(p.backlog)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.ultimaSalida ? (
                      formatFecha(p.ultimaSalida)
                    ) : (
                      <span className="text-muted-foreground">nota de venta {formatFecha(p.primeraNota)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.dias}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {parados.length > 15 && (
          <Button size="sm" variant="outline" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'Ver solo los 15 mayores' : `Ver los ${parados.length}`}
          </Button>
        )}
      </Seccion>

      <p className="text-xs text-muted-foreground">
        {actual.fuente === 'foto' ? 'Backlog de hoy: foto diaria.' : 'Backlog de hoy: reconstruido desde SAP (aún no hay foto del día).'} Los
        períodos anteriores a la primera foto diaria se reconstruyen desde SAP (aproximado).
      </p>
    </div>
  )
}

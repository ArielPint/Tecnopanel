import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { Cargando, Tile, Vacio, selectClase } from '../components/comunes'
import { listarLineas, listarLineasCorte, listarPlan, listarVentasSap, type LineaCorteV, type LineaV, type PlanFila, type VentaSap } from '../lib/api'
import { fmtPesos } from '../lib/cortes'
import { fmtFecha, fmtNum, fmtPct, hoyChile, inicioSemana, sumarDias } from '../lib/formato'
import { compararPlan, comparacionVacia, cumplimiento, valorDe, type Comparacion, type Unidad } from '../lib/plan'
import { useSucursalSip } from '../hooks/useSucursalSip'

const UNIDADES: { key: Unidad; label: string }[] = [
  { key: 'paneles', label: 'Paneles' },
  { key: 'm2', label: 'm²' },
  { key: 'pesos', label: '$ de venta' },
]

const fmtUnidad = (n: number, u: Unidad) => (u === 'pesos' ? fmtPesos(n) : fmtNum(n, u === 'm2' ? 1 : 0))
const fmtSemana = (lunes: string) => `${fmtFecha(lunes).slice(0, 5)} al ${fmtFecha(sumarDias(lunes, 6)).slice(0, 5)}`

function Pct({ real, plan }: { real: number; plan: number }) {
  const c = cumplimiento(real, plan)
  if (c == null) return <span className="text-muted-foreground">—</span>
  return <span className={cn('font-semibold', c >= 0.95 ? 'text-emerald-600 dark:text-emerald-400' : c < 0.8 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>{fmtPct(c)}</span>
}

/** Plan, real y cumplimiento del pegado y del corte, en la unidad elegida */
function Celdas({ c, u, fuerte }: { c: Comparacion; u: Unidad; fuerte?: boolean }) {
  const num = cn('text-right font-mono-tabular', fuerte && 'font-semibold')
  return (
    <>
      <TableCell className={cn(num, 'border-l')}>{fmtUnidad(valorDe(c.pegadoPlan, u), u)}</TableCell>
      <TableCell className={num}>{fmtUnidad(valorDe(c.pegadoReal, u), u)}</TableCell>
      <TableCell className="text-right font-mono-tabular text-sm">
        <Pct real={valorDe(c.pegadoReal, u)} plan={valorDe(c.pegadoPlan, u)} />
      </TableCell>
      <TableCell className={cn(num, 'border-l')}>{fmtUnidad(valorDe(c.cortePlan, u), u)}</TableCell>
      <TableCell className={num}>{fmtUnidad(valorDe(c.corteReal, u), u)}</TableCell>
      <TableCell className="text-right font-mono-tabular text-sm">
        <Pct real={valorDe(c.corteReal, u)} plan={valorDe(c.cortePlan, u)} />
      </TableCell>
    </>
  )
}

function Cabecera({ primera }: { primera: string }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead rowSpan={2}>{primera}</TableHead>
        <TableHead colSpan={3} className="border-l text-center">
          Pegado
        </TableHead>
        <TableHead colSpan={3} className="border-l text-center">
          Corte
        </TableHead>
      </TableRow>
      <TableRow>
        {[0, 1].map((i) => (
          <Fragment key={i}>
            <TableHead className="border-l text-right">Plan</TableHead>
            <TableHead className="text-right">Real</TableHead>
            <TableHead className="text-right">Cumpl.</TableHead>
          </Fragment>
        ))}
      </TableRow>
    </TableHeader>
  )
}

/** Plan semanal contra lo registrado en producción y cortes, por semana y por proyecto. */
export default function Plan() {
  const { sucursal } = useSucursalSip()
  const hoy = hoyChile()
  const semanaActual = inicioSemana(hoy)
  const [desde, setDesde] = useState(() => sumarDias(semanaActual, -21))
  const [semanas, setSemanas] = useState(8)
  const [unidad, setUnidad] = useState<Unidad>('paneles')
  const [proyecto, setProyecto] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [datos, setDatos] = useState<{ plan: PlanFila[]; lineas: LineaV[]; cortes: LineaCorteV[]; ventas: VentaSap[] } | null>(null)

  const hasta = sumarDias(desde, semanas * 7 - 1)

  useEffect(() => {
    let cancelado = false
    setDatos(null)
    // lo real solo hasta hoy: las semanas futuras quedan en cero
    const finReal = hasta < hoy ? hasta : hoy
    Promise.all([
      listarPlan(desde, hasta, sucursal),
      desde <= hoy ? listarLineas(desde, finReal, sucursal) : [],
      desde <= hoy ? listarLineasCorte({ desde, hasta: finReal, sucursal }) : [],
      listarVentasSap(),
    ])
      .then(([plan, lineas, cortes, ventas]) => !cancelado && setDatos({ plan, lineas, cortes, ventas }))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
        if (!cancelado) setDatos({ plan: [], lineas: [], cortes: [], ventas: [] })
      })
    return () => {
      cancelado = true
    }
  }, [desde, hasta, hoy, sucursal])

  const valorPanel = useMemo(() => new Map((datos?.ventas ?? []).filter((v) => v.valor_panel != null).map((v) => [v.proyecto_codigo, v.valor_panel as number])), [datos])

  const todo = useMemo(() => (datos ? compararPlan({ ...datos, valorPanel }) : null), [datos, valorPanel])
  // con un proyecto elegido, todo se calcula solo con lo suyo
  const r = useMemo(() => {
    if (!datos || !proyecto) return todo
    const sinSap = proyecto === '-'
    return compararPlan({
      plan: sinSap ? [] : datos.plan.filter((f) => f.proyecto_codigo === proyecto),
      lineas: datos.lineas.filter((l) => (sinSap ? !l.sap_proyecto_codigo : l.sap_proyecto_codigo === proyecto)),
      cortes: sinSap ? [] : datos.cortes.filter((l) => l.proyecto_codigo === proyecto),
      valorPanel,
    })
  }, [datos, proyecto, todo, valorPanel])

  const listaSemanas = Array.from({ length: semanas }, (_, i) => sumarDias(desde, i * 7))

  if (!r || !todo) return <Cargando />
  const t = r.total
  const sinValor = r.porProyecto.filter((p) => p.sinValor && (p.c.pegadoPlan.paneles || p.c.pegadoReal.paneles || p.c.cortePlan.paneles || p.c.corteReal.paneles))
  const sinProyectoSap = r.porProyecto.find((p) => p.codigo === '')

  const alternar = (k: string) =>
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Desde la semana del
          <Input
            type="date"
            value={desde}
            onChange={(e) => e.target.value && setDesde(inicioSemana(e.target.value))}
            className="w-auto"
            aria-label="Desde la semana"
          />
        </label>
        <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className={`${selectClase} w-auto`} aria-label="Cantidad de semanas">
          {[4, 8, 12, 26].map((n) => (
            <option key={n} value={n}>
              {n} semanas
            </option>
          ))}
        </select>
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={`${selectClase} w-auto min-w-[200px] max-w-full`} aria-label="Proyecto">
          <option value="">Todos los proyectos</option>
          {todo.porProyecto.map((p) => (
            <option key={p.codigo || '-'} value={p.codigo || '-'}>
              {p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre}
            </option>
          ))}
        </select>
        <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Ver en">
          {UNIDADES.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setUnidad(x.key)}
              className={cn('rounded px-2.5 py-1 text-sm font-medium', unidad === x.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Semanas de lunes a domingo, del {fmtFecha(desde)} al {fmtFecha(hasta)}
        {sucursal === 'todas' ? ', sumando las sucursales' : ` en ${sucursal}`}. Real del pegado = paneles buenos fabricados; real del corte = paneles cortados.
        {unidad === 'pesos' && ' En pesos: paneles × valor de venta por panel del proyecto (monto de panel SIP de sus OV de SAP ÷ paneles de su estructura).'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Pegado real" valor={fmtUnidad(valorDe(t.pegadoReal, unidad), unidad)} detalle={`Plan ${fmtUnidad(valorDe(t.pegadoPlan, unidad), unidad)}`} />
        <Tile
          titulo="Cumplimiento pegado"
          valor={(() => {
            const c = cumplimiento(valorDe(t.pegadoReal, unidad), valorDe(t.pegadoPlan, unidad))
            return c == null ? '—' : fmtPct(c)
          })()}
          detalle="Real ÷ plan del período"
        />
        <Tile titulo="Corte real" valor={fmtUnidad(valorDe(t.corteReal, unidad), unidad)} detalle={`Plan ${fmtUnidad(valorDe(t.cortePlan, unidad), unidad)}`} />
        <Tile
          titulo="Cumplimiento corte"
          valor={(() => {
            const c = cumplimiento(valorDe(t.corteReal, unidad), valorDe(t.cortePlan, unidad))
            return c == null ? '—' : fmtPct(c)
          })()}
          detalle="Real ÷ plan del período"
        />
      </div>

      {unidad === 'pesos' && (sinValor.length > 0 || (sinProyectoSap && sinProyectoSap.c.pegadoReal.paneles > 0)) && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Quedan en $0 por no tener valor de venta:{' '}
          {[
            ...sinValor.map((p) => `${p.codigo} ${p.nombre} (sin OV de panel SIP en SAP)`),
            ...(sinProyectoSap && sinProyectoSap.c.pegadoReal.paneles > 0 ? [`${fmtNum(sinProyectoSap.c.pegadoReal.paneles)} paneles fabricados sin proyecto SAP`] : []),
          ].join('; ')}
          .
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por semana</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <Cabecera primera="Semana" />
            <TableBody>
              {listaSemanas.map((s) => (
                <TableRow key={s} className={s > semanaActual ? 'text-muted-foreground' : undefined}>
                  <TableCell className="whitespace-nowrap">
                    {fmtSemana(s)}
                    {s === semanaActual && (
                      <Badge variant="secondary" className="ml-2">
                        En curso
                      </Badge>
                    )}
                  </TableCell>
                  <Celdas c={r.porSemana.get(s) ?? comparacionVacia()} u={unidad} />
                </TableRow>
              ))}
              <TableRow className="bg-muted/40">
                <TableCell className="font-semibold">Total</TableCell>
                <Celdas c={t} u={unidad} fuerte />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por proyecto</CardTitle>
          <p className="text-xs text-muted-foreground">Toque un proyecto para ver sus paneles.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {r.porProyecto.length === 0 ? (
            <Vacio>No hay plan ni registros en estas semanas.</Vacio>
          ) : (
            <Table>
              <Cabecera primera="Proyecto" />
              <TableBody>
                {r.porProyecto.map((p) => {
                  const k = p.codigo || '-'
                  const abierto = abiertos.has(k)
                  return (
                    <Fragment key={k}>
                      <TableRow className="cursor-pointer" onClick={() => alternar(k)}>
                        <TableCell>
                          <div className="flex items-start gap-1">
                            {abierto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div>
                              <div className="font-semibold">{p.nombre}</div>
                              {p.codigo && (
                                <div className="text-xs text-muted-foreground">
                                  {p.codigo}
                                  {unidad === 'pesos' && (valorPanel.has(p.codigo) ? ` · ${fmtPesos(valorPanel.get(p.codigo) as number)}/panel` : ' · sin valor de venta')}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <Celdas c={p.c} u={unidad} fuerte />
                      </TableRow>
                      {abierto &&
                        p.paneles.map((f) => (
                          <TableRow key={`${k}-${f.panel_id}`} className="bg-muted/20">
                            <TableCell className="pl-8">
                              <div className="font-mono-tabular text-sm font-semibold">{f.panel_codigo}</div>
                              <div className="text-xs text-muted-foreground">{f.panel_descripcion}</div>
                            </TableCell>
                            <Celdas c={f.c} u={unidad} />
                          </TableRow>
                        ))}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

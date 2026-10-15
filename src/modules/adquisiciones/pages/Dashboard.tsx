import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { formatCLPCompact } from '@/modules/financiero/utils/formatters'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { cn } from '@/lib/utils'
import { fmtFecha, hoyChile } from '@/modules/sso/lib/estados'
import { ABIERTOS, ESTADO } from '../lib/catalogos'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import {
  etiquetaCeco,
  fmtPesos,
  listarGasto,
  listarPresupuestos,
  listarSolicitudes,
  type FilaGasto,
  type FilaPresupuesto,
  type Solicitud,
} from '../lib/api'
import { RUTA } from '../lib/rutas'

// Dashboard de Compras y aprobadores. Gasto real = líneas de OC de SAP no canceladas (pasen o no por el
// portal), por fecha de la OC. Comprometido = solicitudes en aprobación o aprobadas sin OC todavía.
// Colores validados con el validador de la guía de gráficos (azul / naranjo, pasos propios en oscuro);
// el presupuesto va en gris como referencia, no como serie.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const SIN_SUCURSAL = 'Sin sucursal'

const configMensual = {
  neto: { label: 'Gasto neto en OC', theme: { light: '#508df7', dark: '#508df7' } },
} satisfies ChartConfig

const configCeco = {
  presupuesto: { label: 'Presupuesto', theme: { light: '#9498ad', dark: '#6b6e80' } },
  ejecutado: { label: 'Ejecutado (SAP)', theme: { light: '#508df7', dark: '#508df7' } },
  comprometido: { label: 'Comprometido (portal)', theme: { light: '#d9811c', dark: '#cf7c1a' } },
} satisfies ChartConfig

function dias(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return null
  return (new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000
}

function promedio(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null && x >= 0)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function Tile({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: React.ReactNode; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className={cn('font-mono-tabular text-2xl font-extrabold', alerta && 'text-destructive')}>{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

interface FilaReporte {
  centro_costo: string
  nombre: string
  sucursal: string
  linea: string
  presupuesto: number | null
  ejecutado: number
  comprometido: number
  oc: number
  solicitudes: number
}

const disponible = (f: { presupuesto: number | null; ejecutado: number; comprometido: number }) =>
  f.presupuesto == null ? null : f.presupuesto - f.ejecutado - f.comprometido
const pctEjec = (f: { presupuesto: number | null; ejecutado: number; comprometido: number }) =>
  f.presupuesto ? Math.round((100 * (f.ejecutado + f.comprometido)) / f.presupuesto) : null

export default function Dashboard() {
  const anioActual = Number(hoyChile().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  // La base ya entrega solo las sucursales donde compra o aprueba; el filtro ofrece esas
  const { sucursales } = usePermisosAdq()
  const [sucursal, setSucursal] = useState('')
  const [ceco, setCeco] = useState('')
  const [gasto, setGasto] = useState<FilaGasto[]>([])
  const [presupuestos, setPresupuestos] = useState<FilaPresupuesto[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([listarGasto(anio), listarPresupuestos(anio), listarSolicitudes()])
      .then(([g, p, s]) => {
        setGasto(g)
        setPresupuestos(p)
        setSolicitudes(s)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [anio])

  const pasa = (suc: string | null, cc: string) => (!sucursal || (suc ?? SIN_SUCURSAL) === sucursal) && (!ceco || cc === ceco)
  const g = useMemo(() => gasto.filter((x) => pasa(x.sucursal, x.centro_costo)), [gasto, sucursal, ceco]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = useMemo(() => presupuestos.filter((x) => pasa(x.sucursal, x.centro_costo)), [presupuestos, sucursal, ceco]) // eslint-disable-line react-hooks/exhaustive-deps
  const sAnio = useMemo(
    () => solicitudes.filter((s) => s.created_at.slice(0, 4) === String(anio) && pasa(s.sucursal, s.centro_costo)),
    [solicitudes, anio, sucursal, ceco], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const sAbiertas = useMemo(
    () => solicitudes.filter((s) => ABIERTOS.includes(s.estado) && pasa(s.sucursal, s.centro_costo)),
    [solicitudes, sucursal, ceco], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // CECO que aparecen en el año, para el filtro
  const cecos = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const x of gasto) if (x.centro_costo) m.set(x.centro_costo, x.centro_costo_nombre)
    for (const x of presupuestos) m.set(x.centro_costo, x.centro_costo_nombre)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [gasto, presupuestos])

  const totalGasto = g.reduce((a, x) => a + x.neto, 0)
  const totalComprometido = p.reduce((a, x) => a + x.comprometido, 0)
  const conPresupuesto = p.filter((x) => x.presupuesto != null)
  const totalPresupuesto = conPresupuesto.reduce((a, x) => a + (x.presupuesto ?? 0), 0)
  const usadoConPresupuesto = conPresupuesto.reduce((a, x) => a + x.ejecutado + x.comprometido, 0)
  const hoy = hoyChile()
  const atrasadas = sAbiertas.filter((s) => s.fecha_requerida && s.fecha_requerida < hoy)
  const enAprobacionLarga = sAbiertas.filter((s) => s.estado === 'en_aprobacion' && (dias(s.enviada_at, new Date().toISOString()) ?? 0) > 3)

  const mensual = MESES.map((m, i) => ({ mes: m, neto: g.filter((x) => x.mes === i + 1).reduce((a, x) => a + x.neto, 0) }))

  // Reporte por CECO (gasto + presupuesto + solicitudes)
  const reporte = useMemo(() => {
    const m = new Map<string, FilaReporte>()
    const fila = (cc: string, nombre: string | null, suc: string | null, linea: string | null) => {
      const k = cc || '(sin CECO)'
      if (!m.has(k))
        m.set(k, {
          centro_costo: k,
          nombre: nombre ?? '',
          sucursal: suc ?? SIN_SUCURSAL,
          linea: linea ?? '',
          presupuesto: null,
          ejecutado: 0,
          comprometido: 0,
          oc: 0,
          solicitudes: 0,
        })
      return m.get(k)!
    }
    for (const x of g) {
      const f = fila(x.centro_costo, x.centro_costo_nombre, x.sucursal, x.linea)
      f.ejecutado += x.neto
      f.oc += x.oc
    }
    for (const x of p) {
      const f = fila(x.centro_costo, x.centro_costo_nombre, x.sucursal, x.linea)
      f.presupuesto = x.presupuesto
      f.comprometido = x.comprometido
      f.solicitudes = x.solicitudes
    }
    return [...m.values()].sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.centro_costo.localeCompare(b.centro_costo))
  }, [g, p])

  const porSucursal = useMemo(() => {
    const m = new Map<string, { sucursal: string; presupuesto: number | null; ejecutado: number; comprometido: number; oc: number; solicitudes: number }>()
    for (const r of reporte) {
      const f = m.get(r.sucursal) ?? { sucursal: r.sucursal, presupuesto: null, ejecutado: 0, comprometido: 0, oc: 0, solicitudes: 0 }
      f.ejecutado += r.ejecutado
      f.comprometido += r.comprometido
      f.oc += r.oc
      f.solicitudes += r.solicitudes
      if (r.presupuesto != null) f.presupuesto = (f.presupuesto ?? 0) + r.presupuesto
      m.set(r.sucursal, f)
    }
    return [...m.values()].sort((a, b) => a.sucursal.localeCompare(b.sucursal))
  }, [reporte])

  const graficoCeco = [...reporte]
    .filter((r) => r.centro_costo !== '(sin CECO)')
    .sort((a, b) => Math.max(b.presupuesto ?? 0, b.ejecutado + b.comprometido) - Math.max(a.presupuesto ?? 0, a.ejecutado + a.comprometido))
    .slice(0, 12)
    .map((r) => ({ ...r, etiqueta: r.centro_costo, completo: etiquetaCeco(r.centro_costo, r.nombre) }))

  const proveedores = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of g) m.set(x.proveedor_nombre ?? '—', (m.get(x.proveedor_nombre ?? '—') ?? 0) + x.neto)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [g])

  const tiempos = [
    { etapa: 'Solicitud → envío a aprobación', d: promedio(sAnio.map((s) => dias(s.created_at, s.enviada_at))) },
    { etapa: 'Envío → aprobada', d: promedio(sAnio.map((s) => dias(s.enviada_at, s.aprobada_at))) },
    { etapa: 'Aprobada → OC en SAP', d: promedio(sAnio.map((s) => dias(s.aprobada_at, s.oc_at))) },
    { etapa: 'OC → recibida', d: promedio(sAnio.filter((s) => s.estado === 'recibida').map((s) => dias(s.oc_at, s.fecha_cierre))) },
  ]
  const fmtDias = (d: number | null) => (d == null ? '—' : d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1).replace('.', ',')} días`)

  function exportar() {
    exportarExcel(`adquisiciones-ceco-${anio}${sucursal ? `-${sucursal}` : ''}`, [
      ...reporte.map((r) => ({
        Sucursal: r.sucursal,
        'Centro de costo': r.centro_costo,
        Nombre: r.nombre,
        Línea: r.linea,
        'Presupuesto (CLP)': r.presupuesto ?? '',
        'Ejecutado OC SAP (CLP)': Math.round(r.ejecutado),
        'Comprometido portal (CLP)': Math.round(r.comprometido),
        'Disponible (CLP)': disponible(r) == null ? '' : Math.round(disponible(r)!),
        '% ejecución': pctEjec(r) ?? '',
        'OC SAP': r.oc,
        'Solicitudes portal': r.solicitudes,
      })),
      ...porSucursal.map((r) => ({
        Sucursal: r.sucursal,
        'Centro de costo': 'TOTAL SUCURSAL',
        Nombre: '',
        Línea: '',
        'Presupuesto (CLP)': r.presupuesto ?? '',
        'Ejecutado OC SAP (CLP)': Math.round(r.ejecutado),
        'Comprometido portal (CLP)': Math.round(r.comprometido),
        'Disponible (CLP)': disponible(r) == null ? '' : Math.round(disponible(r)!),
        '% ejecución': pctEjec(r) ?? '',
        'OC SAP': r.oc,
        'Solicitudes portal': r.solicitudes,
      })),
    ])
  }

  const selectClase = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Dashboard de compras</h1>
          <p className="text-sm text-muted-foreground">Gasto real de las OC de SAP, presupuesto por centro de costo y avance de las solicitudes del portal.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={selectClase} aria-label="Año">
          {[anioActual, anioActual - 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className={selectClase} aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {[...sucursales.control, SIN_SUCURSAL].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={ceco} onChange={(e) => setCeco(e.target.value)} className={cn(selectClase, 'max-w-[280px]')} aria-label="Centro de costo">
          <option value="">Todos los centros de costo</option>
          {cecos.map(([c, n]) => (
            <option key={c} value={c}>
              {etiquetaCeco(c, n)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-72 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile titulo={`Gasto ${anio} (OC SAP)`} valor={formatCLPCompact(totalGasto)} detalle={`${g.reduce((a, x) => a + x.oc, 0)} OC · neto`} />
            <Tile
              titulo="Presupuesto usado"
              valor={totalPresupuesto ? `${Math.round((100 * usadoConPresupuesto) / totalPresupuesto)}%` : '—'}
              alerta={totalPresupuesto > 0 && usadoConPresupuesto > totalPresupuesto}
              detalle={totalPresupuesto ? `de ${formatCLPCompact(totalPresupuesto)} en ${conPresupuesto.length} CECO` : 'Sin presupuestos cargados'}
            />
            <Tile titulo="Comprometido en el portal" valor={formatCLPCompact(totalComprometido)} detalle="En aprobación o aprobadas sin OC" />
            <Tile
              titulo="Solicitudes abiertas"
              valor={String(sAbiertas.length)}
              alerta={atrasadas.length > 0}
              detalle={`${atrasadas.length} atrasadas · ${enAprobacionLarga.length} en aprobación hace más de 3 días`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 pt-4">
                <h2 className="text-sm font-bold">Gasto mensual {anio}</h2>
                <ChartContainer config={configMensual} className="aspect-auto h-[260px] w-full">
                  <BarChart data={mensual} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.4} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatCLPCompact} tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11 }} />
                    <ChartTooltip
                      cursor={{ fillOpacity: 0.08 }}
                      content={<ChartTooltipContent formatter={(v) => <span className="font-mono-tabular font-medium">{fmtPesos(Number(v))}</span>} />}
                    />
                    <Bar dataKey="neto" fill="var(--color-neto)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-4">
                <h2 className="text-sm font-bold">Presupuesto vs gasto por centro de costo</h2>
                {graficoCeco.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">Sin gasto ni presupuesto en este período.</p>
                ) : (
                  <ChartContainer config={configCeco} className="aspect-auto w-full" style={{ height: 70 + graficoCeco.length * 30 }}>
                    <BarChart data={graficoCeco} layout="vertical" margin={{ left: 4, right: 8 }} barGap={2}>
                      <CartesianGrid horizontal={false} strokeOpacity={0.4} />
                      <XAxis type="number" tickFormatter={formatCLPCompact} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="etiqueta" width={64} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <ChartTooltip
                        cursor={{ fillOpacity: 0.08 }}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.completo ?? ''}
                            formatter={(v, name) => (
                              <span className="flex w-full justify-between gap-4">
                                <span>{configCeco[name as keyof typeof configCeco]?.label ?? name}</span>
                                <span className="font-mono-tabular font-medium">{fmtPesos(Number(v))}</span>
                              </span>
                            )}
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="presupuesto" fill="var(--color-presupuesto)" radius={[0, 4, 4, 0]} maxBarSize={10} />
                      <Bar dataKey="ejecutado" stackId="uso" fill="var(--color-ejecutado)" maxBarSize={10} stroke="hsl(var(--card))" strokeWidth={1} />
                      <Bar dataKey="comprometido" stackId="uso" fill="var(--color-comprometido)" radius={[0, 4, 4, 0]} maxBarSize={10} stroke="hsl(var(--card))" strokeWidth={1} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">
                  Reporte por centro de costo y sucursal · {anio}
                </h2>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={exportar} disabled={reporte.length === 0}>
                  <Download className="h-4 w-4" /> Excel
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">Centro de costo</th>
                      <th className="px-2 py-2 text-right font-semibold">Presupuesto</th>
                      <th className="px-2 py-2 text-right font-semibold">Ejecutado SAP</th>
                      <th className="px-2 py-2 text-right font-semibold">Comprometido</th>
                      <th className="px-2 py-2 text-right font-semibold">Disponible</th>
                      <th className="px-2 py-2 text-right font-semibold">% uso</th>
                      <th className="px-2 py-2 text-right font-semibold">OC</th>
                      <th className="py-2 pl-2 text-right font-semibold">SC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porSucursal.map((ps) => (
                      <FilasSucursal key={ps.sucursal} total={ps} filas={reporte.filter((r) => r.sucursal === ps.sucursal)} />
                    ))}
                    {porSucursal.length > 1 && (
                      <FilaMontos
                        className="border-t-2 font-bold"
                        etiqueta="Total"
                        f={{
                          presupuesto: porSucursal.some((x) => x.presupuesto != null) ? porSucursal.reduce((a, x) => a + (x.presupuesto ?? 0), 0) : null,
                          ejecutado: porSucursal.reduce((a, x) => a + x.ejecutado, 0),
                          comprometido: porSucursal.reduce((a, x) => a + x.comprometido, 0),
                          oc: porSucursal.reduce((a, x) => a + x.oc, 0),
                          solicitudes: porSucursal.reduce((a, x) => a + x.solicitudes, 0),
                        }}
                      />
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Ejecutado: líneas de OC de SAP con ese centro de costo, por fecha de la OC. Comprometido: solicitudes del portal en aprobación o aprobadas que todavía no
                tienen OC. La sucursal sale del centro de costo (o de la bodega de la OC si la línea no tiene CECO).
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="space-y-2 pt-4">
                <h2 className="text-sm font-bold">Principales proveedores {anio}</h2>
                <ol className="space-y-1.5 text-sm">
                  {proveedores.map(([nombre, neto], i) => (
                    <li key={nombre} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                        {nombre}
                      </span>
                      <span className="shrink-0 font-mono-tabular">{formatCLPCompact(neto)}</span>
                    </li>
                  ))}
                  {proveedores.length === 0 && <li className="text-muted-foreground">Sin OC en el período.</li>}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-4">
                <h2 className="text-sm font-bold">Tiempo promedio por etapa</h2>
                <dl className="space-y-1.5 text-sm">
                  {tiempos.map((t) => (
                    <div key={t.etapa} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t.etapa}</dt>
                      <dd className="font-mono-tabular">{fmtDias(t.d)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">Solicitudes del portal creadas en {anio}.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-4">
                <h2 className="text-sm font-bold">Atrasadas</h2>
                {atrasadas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguna solicitud abierta pasó su fecha requerida.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {atrasadas
                      .sort((a, b) => (a.fecha_requerida ?? '').localeCompare(b.fecha_requerida ?? ''))
                      .slice(0, 8)
                      .map((s) => (
                        <li key={s.id} className="flex justify-between gap-3">
                          <Link to={RUTA.solicitud(s.id)} className="min-w-0 truncate text-brand hover:underline">
                            SC-{s.numero} · {s.titulo}
                          </Link>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {ESTADO[s.estado].label} · {fmtFecha(s.fecha_requerida)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

type Montos = { presupuesto: number | null; ejecutado: number; comprometido: number; oc: number; solicitudes: number }

function FilaMontos({ etiqueta, detalle, f, className }: { etiqueta: string; detalle?: string; f: Montos; className?: string }) {
  const disp = disponible(f)
  const pct = pctEjec(f)
  return (
    <tr className={cn('border-b last:border-0', className)}>
      <td className="py-2 pr-2">
        {etiqueta}
        {detalle && <span className="block text-xs font-normal text-muted-foreground">{detalle}</span>}
      </td>
      <td className="px-2 py-2 text-right font-mono-tabular">{f.presupuesto == null ? '—' : fmtPesos(f.presupuesto)}</td>
      <td className="px-2 py-2 text-right font-mono-tabular">{fmtPesos(f.ejecutado)}</td>
      <td className="px-2 py-2 text-right font-mono-tabular">{fmtPesos(f.comprometido)}</td>
      <td className={cn('px-2 py-2 text-right font-mono-tabular', disp != null && disp < 0 && 'text-destructive')}>{disp == null ? '—' : fmtPesos(disp)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', pct != null && pct > 100 && 'text-destructive')}>{pct == null ? '—' : `${pct}%`}</td>
      <td className="px-2 py-2 text-right tabular-nums">{f.oc}</td>
      <td className="py-2 pl-2 text-right tabular-nums">{f.solicitudes}</td>
    </tr>
  )
}

function FilasSucursal({ total, filas }: { total: Montos & { sucursal: string }; filas: FilaReporte[] }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide">
          {total.sucursal}
        </td>
      </tr>
      {filas.map((r) => (
        <FilaMontos key={r.centro_costo} etiqueta={r.centro_costo} detalle={[r.nombre, r.linea].filter(Boolean).join(' · ')} f={r} />
      ))}
      <FilaMontos className="font-semibold" etiqueta={`Total ${total.sucursal}`} f={total} />
    </>
  )
}

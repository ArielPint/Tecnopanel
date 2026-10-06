import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Tile, Vacio } from '../components/comunes'
import { listarConsumos, listarLineas, listarPartes, type ConsumoV, type LineaV, type ParteV } from '../lib/api'
import { consumoPorMaterial, porPanel, resumir, serie } from '../lib/calculo'
import { fmtCant, fmtFecha, fmtFechaCorta, fmtNum, fmtPct, fmtTramo, hoyChile, inicioSemana, sumarDias } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'

const configDia = { buenos: { label: 'Paneles buenos', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig

type PuntoDia = ReturnType<typeof serie>[number] & { label: string }

function TooltipDia({ active, payload }: { active?: boolean; payload?: { payload: PuntoDia }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{fmtFecha(d.clave)}</p>
      <p>
        <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[hsl(var(--chart-1))]" />
        Buenos: <span className="font-mono-tabular font-semibold">{fmtNum(d.buenos)}</span>
      </p>
      <p className="text-muted-foreground">Rechazados: {fmtNum(d.rechazados)}</p>
      <p className="text-muted-foreground">m²: {fmtNum(d.m2, 1)}</p>
    </div>
  )
}

export default function Dashboard() {
  const { puedeEn, loading: permisosLoading } = usePermisosSip()
  const veProduccion = puedeEn('produccion') || puedeEn('consumo')
  const veConsumo = puedeEn('consumo')
  const hoy = hoyChile()
  const inicioMes = `${hoy.slice(0, 7)}-01`
  const desde30 = sumarDias(hoy, -29)
  const desde = inicioMes < desde30 ? inicioMes : desde30

  const [lineas, setLineas] = useState<LineaV[]>([])
  const [partesHoy, setPartesHoy] = useState<ParteV[]>([])
  const [consumos, setConsumos] = useState<ConsumoV[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (permisosLoading) return
    if (!veProduccion) {
      setLoading(false)
      return
    }
    Promise.all([listarLineas(desde, hoy), listarPartes(hoy, hoy), veConsumo ? listarConsumos(inicioMes, hoy) : Promise.resolve([])])
      .then(([l, p, c]) => {
        setLineas(l)
        setPartesHoy(p)
        setConsumos(c)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [permisosLoading, veProduccion, veConsumo, desde, hoy, inicioMes])

  const datos = useMemo(() => {
    const delMes = lineas.filter((l) => l.fecha >= inicioMes)
    return {
      hoy: resumir(lineas.filter((l) => l.fecha === hoy)),
      semana: resumir(lineas.filter((l) => l.fecha >= inicioSemana(hoy))),
      mes: resumir(delMes),
      porDia: serie(lineas.filter((l) => l.fecha >= desde30), desde30, hoy, 'dia').map((d) => ({ ...d, label: fmtFechaCorta(d.clave) })),
      panelesMes: porPanel(delMes),
      materialesMes: consumoPorMaterial(consumos),
    }
  }, [lineas, consumos, hoy, inicioMes, desde30])

  if (permisosLoading || loading) return <Cargando />

  if (!veProduccion) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-extrabold">Producción Paneles SIP</h1>
        <p className="text-sm text-muted-foreground">
          Su acceso es a <Link to={RUTA.recetas} className="font-semibold underline">Paneles y recetas</Link>. Para ver la producción
          pida acceso a Registro de producción o a Consumo de materiales.
        </p>
      </div>
    )
  }

  const nombreMes = new Date(`${inicioMes}T12:00:00`).toLocaleDateString('es-CL', { month: 'long' })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Producción de paneles SIP al {fmtFecha(hoy)}.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Hoy" valor={fmtNum(datos.hoy.buenos)} detalle={`paneles buenos · ${fmtNum(datos.hoy.m2, 1)} m²`} />
        <Tile titulo="Esta semana" valor={fmtNum(datos.semana.buenos)} detalle={`paneles buenos · ${fmtNum(datos.semana.m2, 1)} m²`} />
        <Tile titulo={`Mes de ${nombreMes}`} valor={fmtNum(datos.mes.buenos)} detalle={`paneles buenos · ${fmtNum(datos.mes.m2, 1)} m²`} />
        <Tile titulo="Rechazo del mes" valor={fmtPct(datos.mes.tasaRechazo)} detalle={`${fmtNum(datos.mes.rechazados)} paneles rechazados`} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-bold">Paneles buenos por día</p>
          <p className="mb-2 text-xs text-muted-foreground">Últimos 30 días</p>
          {datos.porDia.every((d) => d.total === 0) ? (
            <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Sin producción en los últimos 30 días.</p>
          ) : (
            <ChartContainer config={configDia} className="aspect-auto h-[240px] w-full">
              <BarChart data={datos.porDia} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<TooltipDia />} />
                <Bar dataKey="buenos" fill="var(--color-buenos)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold">Registros de hoy</p>
              <Link to={RUTA.registro} className="text-xs text-muted-foreground hover:text-foreground">
                Ver registro
              </Link>
            </div>
            {partesHoy.length === 0 ? (
              <Vacio>Todavía no se registra producción hoy.</Vacio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horario</TableHead>
                    <TableHead className="text-right">Buenos</TableHead>
                    <TableHead className="text-right">Rech.</TableHead>
                    <TableHead className="hidden sm:table-cell">Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...partesHoy].reverse().map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to={RUTA.parte(p.id)} className="font-semibold hover:underline">
                          {fmtTramo(p.hora_desde, p.hora_hasta)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(p.buenos)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{p.rechazados ? fmtNum(p.rechazados) : '—'}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{p.registrado_por ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold">Paneles del mes</p>
            {datos.panelesMes.length === 0 ? (
              <Vacio>Sin producción este mes.</Vacio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel</TableHead>
                    <TableHead className="text-right">Buenos</TableHead>
                    <TableHead className="text-right">m²</TableHead>
                    <TableHead className="text-right">Rechazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.panelesMes.map((p) => (
                    <TableRow key={p.panel_id}>
                      <TableCell>
                        <div className="font-mono-tabular font-semibold">{p.codigo}</div>
                        <div className="max-w-[260px] truncate text-xs text-muted-foreground">{p.descripcion}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(p.buenos)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(p.m2, 1)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtPct(p.tasaRechazo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {veConsumo && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold">Materiales consumidos en {nombreMes}</p>
              <Link to={RUTA.consumo} className="text-xs text-muted-foreground hover:text-foreground">
                Ver consumo
              </Link>
            </div>
            {datos.materialesMes.length === 0 ? (
              <Vacio>Sin consumo este mes.</Vacio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.materialesMes.map((m) => (
                    <TableRow key={m.material_id}>
                      <TableCell>
                        <span className="font-mono-tabular text-xs text-muted-foreground">{m.codigo}</span> {m.descripcion}
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular font-semibold">{fmtCant(m.total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

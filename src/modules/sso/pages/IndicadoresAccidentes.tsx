import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { cn } from '@/lib/utils'
import { calcularTasas, diasSinAccidentes, listarDotacion, listarEventos, mesesEntre, type Dotacion, type EventoV } from '../lib/apiAccidentes'
import { hoyChile } from '../lib/estados'
import { etiquetaMes } from '../lib/indicadores'
import { RUTA } from '../lib/rutas'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

// Azul validado con dataviz para el hub (ver pages/Indicadores.tsx)
const configMes = { accidentes: { label: 'Accidentes CTP', color: '#4F8DF7' } } satisfies ChartConfig

const fmt = (n: number | null, dec = 2) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: dec }))

function Tasa({ titulo, valor, formula }: { titulo: string; valor: number | null; formula: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-mono-tabular text-2xl font-extrabold">{fmt(valor)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{formula}</p>
      </CardContent>
    </Card>
  )
}

/** Tasas legales (Ley 16.744) por empresa: Tecnopanel y cada contratista aparte. */
export default function IndicadoresAccidentes() {
  const { empresas } = useCatalogosTrabajadores()
  const [eventos, setEventos] = useState<EventoV[]>([])
  const [dotacion, setDotacion] = useState<Dotacion[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [periodo, setPeriodo] = useState<'anio' | '12m'>('anio')

  useEffect(() => {
    Promise.all([listarEventos(), listarDotacion()])
      .then(([e, d]) => {
        setEventos(e)
        setDotacion(d)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!empresaId && empresas.length) setEmpresaId(empresas.find((e) => e.propia)?.id ?? empresas[0].id)
  }, [empresas, empresaId])

  const hoy = hoyChile()
  const meses = useMemo(() => {
    if (periodo === 'anio') return mesesEntre(`${hoy.slice(0, 4)}-01-01`, hoy)
    const desde = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 12, 1)).toISOString().slice(0, 10)
    return mesesEntre(desde, hoy)
  }, [periodo, hoy])

  const t = useMemo(() => calcularTasas(eventos, dotacion, empresaId, meses), [eventos, dotacion, empresaId, meses])
  const porMes = useMemo(() => meses.map((m) => ({ mes: m, label: etiquetaMes(m), ...calcularTasas(eventos, dotacion, empresaId, [m]) })), [eventos, dotacion, empresaId, meses])
  const sinAccidentes = diasSinAccidentes(eventos, empresaId, hoy)
  const empresa = empresas.find((e) => e.id === empresaId)

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IndicadoresFecha />
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.propia ? '' : ' (contratista)'}
              </option>
            ))}
          </select>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as 'anio' | '12m')} className={selectClase} aria-label="Período">
            <option value="anio">Año en curso</option>
            <option value="12m">Últimos 12 meses (móvil)</option>
          </select>
        </div>
      </div>

      {t.mesesSinDotacion.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Faltan dotación y horas-hombre de {empresa?.nombre} en {t.mesesSinDotacion.map(etiquetaMes).join(', ')}. Las tasas se calculan con los meses
            cargados.{' '}
            <Link to={RUTA.dotacion} className="font-semibold underline">
              Cargar dotación
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Días sin accidentes con tiempo perdido</p>
            <p className="mt-1 font-mono-tabular text-4xl font-extrabold">{sinAccidentes === null ? '—' : sinAccidentes}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.accidentes} accidentes y {t.diasPerdidos} días perdidos en el período · dotación promedio {fmt(t.dotacionPromedio, 1)} · {fmt(t.horasHombre, 0)} HH
            </p>
          </CardContent>
        </Card>
        <Tasa titulo="Accidentabilidad" valor={t.accidentabilidad} formula="Accidentes CTP ÷ dotación × 100" />
        <Tasa titulo="Siniestralidad" valor={t.siniestralidad} formula="Días perdidos ÷ dotación × 100" />
        <Tasa titulo="Frecuencia" valor={t.frecuencia} formula="Accidentes CTP × 10⁶ ÷ HH" />
        <Tasa titulo="Gravedad" valor={t.gravedad} formula="Días perdidos × 10⁶ ÷ HH" />
      </div>
      <p className="text-xs text-muted-foreground">
        Según la Ley 16.744 cuentan los accidentes del trabajo con tiempo perdido y las enfermedades profesionales; se excluyen los
        accidentes de trayecto, los incidentes y los casi-accidentes. Los días perdidos se imputan al mes del accidente.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold">Accidentes con tiempo perdido por mes</p>
            <ChartContainer config={configMes} className="aspect-auto h-[240px] w-full">
              <BarChart data={porMes} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<ChartTooltipContent />} />
                <Bar dataKey="accidentes" fill="var(--color-accidentes)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold">Detalle mensual</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Acc.</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Dotación</TableHead>
                  <TableHead className="text-right">HH</TableHead>
                  <TableHead className="text-right">Frec.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porMes.map((m) => (
                  <TableRow key={m.mes} className={cn(m.mesesSinDotacion.length > 0 && 'text-muted-foreground')}>
                    <TableCell>{m.label}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{m.accidentes || ''}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{m.diasPerdidos || ''}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{m.dotacionPromedio === null ? 'falta' : fmt(m.dotacionPromedio, 1)}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{m.horasHombre ? fmt(m.horasHombre, 0) : ''}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{fmt(m.frecuencia, 1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

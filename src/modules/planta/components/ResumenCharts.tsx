import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Input } from '@/modules/financiero/components/ui/input'
import type { ResumenData } from '../hooks/useResumenData'
import { fmtM, fmtPr } from '../lib/format'

const BUCKET_COLORS = ['#e3903e', '#d2b932', '#a3c83c', '#64c850', '#3fb950']

// Tamaño fijo de barra para poder solaparlas: mismo barSize en ambas series +
// barGap negativo igual al barSize en el chart contenedor hace que ocupen el
// mismo slot en X en vez de ir lado a lado — la de atrás (semitransparente,
// con borde) queda como "tarro", la de adelante (sólida) como "líquido".
const BAR_SIZE = 28

// Negro en tema claro, blanco en tema oscuro (--foreground ya resuelve eso) — un
// solo color de etiqueta legible sobre cualquier barra/línea, sin depender del
// color de cada serie.
const VALUE_LABEL_STYLE = { fontSize: 12, fontWeight: 700, fill: 'hsl(var(--foreground))' } as const

const labelFmt = (fn: (v: number) => string) => (v: unknown) => (v == null ? '' : fn(Number(v)))

export function DistribucionModulosChart({ data }: { data: ResumenData['distribucionBuckets'] }) {
  const config = { cantidad: { label: 'Módulos' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="cantidad" radius={4}>
          {data.map((entry, i) => (
            <Cell key={entry.bucket} fill={BUCKET_COLORS[i]} />
          ))}
          <LabelList dataKey="cantidad" position="top" style={VALUE_LABEL_STYLE} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function ComprasVsPresupuestoChart({ data }: { data: ResumenData['comprasVsPresupuesto'] }) {
  const config = {
    real: { label: 'Compras reales', color: 'hsl(var(--info))' },
    presupuesto: { label: 'Presupuesto', color: 'hsl(var(--warning))' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8, bottom: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={40}
        />
        <YAxis tickFormatter={(v) => fmtM(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'real' ? 'Compras reales' : 'Presupuesto'}</span>
                  <span className="font-medium">{fmtM(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="real" radius={4}>
          {data.map((d) => (
            <Cell key={d.mes} fill={d.sobrepasado ? '#f85149' : 'var(--color-real)'} />
          ))}
          <LabelList dataKey="real" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtM)} />
        </Bar>
        <Bar dataKey="presupuesto" fill="var(--color-presupuesto)" radius={4}>
          <LabelList dataKey="presupuesto" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtM)} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function CrecimientoMensualTabla({ data }: { data: ResumenData['crecimientoMensual'] }) {
  if (!data.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1.5 text-left">Mes</th>
            <th className="px-2 py-1.5 text-right">Compras del mes</th>
            <th className="px-2 py-1.5 text-right">Compras acumuladas</th>
            <th className="px-2 py-1.5 text-right">Crecimiento mensual</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.mes} className="border-b last:border-0">
              <td className="px-2 py-1.5">{r.mes}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(r.montoMes)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-primary">{fmtM(r.acum)}</td>
              <td
                className={
                  'px-2 py-1.5 text-right font-semibold tabular-nums ' +
                  (r.crecimiento == null ? 'text-muted-foreground' : r.crecimiento >= 0 ? 'text-success' : 'text-destructive')
                }
              >
                {r.crecimiento == null ? '—' : (r.crecimiento >= 0 ? '+' : '') + r.crecimiento.toFixed(2) + '%'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AvanceEconomicoChart({ data, readOnly }: { data: ResumenData['avanceEconomico']; readOnly?: boolean }) {
  const [proyExtra, setProyExtra] = useState(() => parseFloat(localStorage.getItem('planta_proyExtra_avEcon') || '4.5'))

  useEffect(() => {
    localStorage.setItem('planta_proyExtra_avEcon', String(proyExtra))
  }, [proyExtra])

  if (!data.length) {
    return <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Sin datos de avance económico</div>
  }

  const chartData = data.map((d, i) => ({ ...d, proyExtra: i === data.length - 1 ? proyExtra : null }))
  const config = {
    real: { label: 'Avance económico real', color: '#d42b1e' },
    proyectado: { label: 'Proyectado mensual', color: '#4f8ef7' },
  } satisfies ChartConfig

  return (
    <div className="space-y-2">
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <ComposedChart data={chartData} barGap={-BAR_SIZE} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4 tabular-nums">
                    <span>{name === 'real' ? 'Real' : name === 'proyectado' ? 'Proyectado mensual' : 'Proyectado adicional'}</span>
                    <span className="font-medium">{fmtPr(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <Bar dataKey="real" barSize={BAR_SIZE} fill="var(--color-real)" radius={4}>
            <LabelList dataKey="real" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtPr)} />
          </Bar>
          <Line type="monotone" dataKey="proyectado" stroke="var(--color-proyectado)" strokeWidth={2.5} dot connectNulls>
            <LabelList dataKey="proyectado" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtPr)} />
          </Line>
          <Bar dataKey="proyExtra" barSize={BAR_SIZE} fill="none" stroke="#f5a623" strokeWidth={2} strokeDasharray="4 3" radius={4}>
            <LabelList dataKey="proyExtra" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtPr)} />
          </Bar>
        </ComposedChart>
      </ChartContainer>
      {!readOnly && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label htmlFor="proy-extra">Proyectado adicional del último mes:</label>
          <Input
            id="proy-extra"
            type="number"
            step="0.1"
            value={proyExtra}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0) setProyExtra(v)
            }}
            className="h-7 w-20"
          />
          <span>%</span>
        </div>
      )}
    </div>
  )
}

export function AvanceEconomicoAcumChart({ data }: { data: ResumenData['avanceEconomicoAcumulado'] }) {
  if (!data.length) return null
  const config = {
    realAcum: { label: 'Real acumulado', color: '#d42b1e' },
    proyAcum: { label: 'Proyectado acumulado', color: '#4f8ef7' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'realAcum' ? 'Real acumulado' : 'Proyectado acumulado'}</span>
                  <span className="font-medium">{fmtPr(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="realAcum" fill="var(--color-realAcum)" radius={4}>
          <LabelList dataKey="realAcum" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtPr)} />
        </Bar>
        <Line type="monotone" dataKey="proyAcum" stroke="var(--color-proyAcum)" strokeWidth={2.5} dot connectNulls>
          <LabelList dataKey="proyAcum" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt(fmtPr)} />
        </Line>
      </ComposedChart>
    </ChartContainer>
  )
}

function MesCantidadBarChart({ data, color, label }: { data: { mes: string; cantidad: number }[]; color: string; label: string }) {
  const config = { cantidad: { label, color } } satisfies ChartConfig
  if (!data.length) return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sin datos</div>
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8, bottom: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={40}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="cantidad" fill="var(--color-cantidad)" radius={4}>
          <LabelList dataKey="cantidad" position="top" style={VALUE_LABEL_STYLE} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function DespachosPorMesChart({ data }: { data: { mes: string; cantidad: number }[] }) {
  return <MesCantidadBarChart data={data} color="#a371f7" label="Módulos despachados" />
}

export function ModulosTerminadosPorMesChart({ data }: { data: ResumenData['modulosTerminadosPorMes'] }) {
  return <MesCantidadBarChart data={data} color="#3fb950" label="Módulos terminados" />
}

export function ModulosIniciadosPorMesChart({ data }: { data: ResumenData['modulosIniciadosPorMes'] }) {
  return <MesCantidadBarChart data={data} color="#e3903e" label="Módulos iniciados" />
}

export function SalidaGalponPorMesChart({ data }: { data: ResumenData['salidaGalponPorMes'] }) {
  return <MesCantidadBarChart data={data} color="#58a6ff" label="Salida de galpón" />
}

export function M2AcumuladoChart({ data }: { data: ResumenData['m2Acumulado'] }) {
  if (!data.length) return null
  const config = {
    real: { label: 'Real acumulado', color: '#d42b1e' },
    plan: { label: 'Programado acumulado', color: '#4f8ef7' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => v.toLocaleString('es-CL')} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'real' ? 'Real acumulado' : 'Programado acumulado'}</span>
                  <span className="font-medium">{Number(value).toLocaleString('es-CL')} m²</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="real" fill="var(--color-real)" radius={4}>
          <LabelList dataKey="real" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => v.toLocaleString('es-CL'))} />
        </Bar>
        <Line type="monotone" dataKey="plan" stroke="var(--color-plan)" strokeWidth={2.5} dot connectNulls>
          <LabelList dataKey="plan" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => v.toLocaleString('es-CL'))} />
        </Line>
      </ComposedChart>
    </ChartContainer>
  )
}

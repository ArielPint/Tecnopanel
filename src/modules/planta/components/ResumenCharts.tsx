import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Input } from '@/modules/financiero/components/ui/input'
import type { ResumenData } from '../hooks/useResumenData'
import { fmtM, fmtPr } from '../lib/format'

const BUCKET_COLORS = ['#e3903e', '#d2b932', '#a3c83c', '#64c850', '#3fb950']

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
        </Bar>
        <Bar dataKey="presupuesto" fill="var(--color-presupuesto)" radius={4} />
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

// ponytail: el original dibuja un overlay canvas outline naranja sobre la última barra
// para el "proyectado adicional" editable. Acá se muestra como línea punteada extra en vez
// de un plugin canvas custom sobre Recharts — mismo dato, overlay más simple.
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
        <ComposedChart data={chartData} margin={{ left: 8, right: 8 }}>
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
          <Bar dataKey="real" fill="var(--color-real)" radius={4} />
          <Line type="monotone" dataKey="proyectado" stroke="var(--color-proyectado)" strokeWidth={2.5} dot connectNulls />
          <Line type="monotone" dataKey="proyExtra" stroke="#f5a623" strokeWidth={2.5} strokeDasharray="4 3" dot={{ r: 4 }} />
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
        <Bar dataKey="realAcum" fill="var(--color-realAcum)" radius={4} />
        <Line type="monotone" dataKey="proyAcum" stroke="var(--color-proyAcum)" strokeWidth={2.5} dot connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
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
        <Bar dataKey="real" fill="var(--color-real)" radius={4} />
        <Line type="monotone" dataKey="plan" stroke="var(--color-plan)" strokeWidth={2.5} dot connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
}

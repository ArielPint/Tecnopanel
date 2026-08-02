import { Bar, BarChart, CartesianGrid, Cell, Legend, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'

const COLOR_VERDE = '#3fb950'
const COLOR_AZUL = '#58a6ff'
const COLOR_NARANJA = '#e3903e'
const COLOR_ROJO = '#f85149'
const COLOR_MORADO = '#bc8cff'

export function colorPorAvance(pct: number): string {
  if (pct >= 75) return COLOR_VERDE
  if (pct >= 50) return COLOR_AZUL
  if (pct >= 25) return COLOR_NARANJA
  return COLOR_ROJO
}

// Barras verticales, una sola serie — distribución, torres, categorías.
export function VBarChart({
  data, labelKey, valueKey, pct, colorFn, height = 260,
}: {
  data: Record<string, unknown>[]
  labelKey: string
  valueKey: string
  pct?: boolean
  colorFn?: (v: number) => string
  height?: number
}) {
  const config = { [valueKey]: { label: pct ? '% Avance' : 'Cantidad' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={data.length > 8 ? -35 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 50 : 24} />
        <YAxis tickFormatter={pct ? (v) => `${v}%` : undefined} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => [pct ? `${value}%` : String(value), '']} />} />
        <Bar dataKey={valueKey} radius={4}>
          {colorFn && data.map((entry, i) => <Cell key={i} fill={colorFn(Number(entry[valueKey]))} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// Barras verticales agrupadas — ej. terminados vs en proceso por torre/tipo.
export function GroupedVBarChart({
  data, labelKey, series, height = 260,
}: {
  data: Record<string, unknown>[]
  labelKey: string
  series: { key: string; label: string; color: string }[]
  height?: number
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={data.length > 8 ? -35 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 50 : 24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={4} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

// Barras horizontales — ranking de partidas (37 filas, mejor con eje Y de texto).
export function HBarChart({
  data, labelKey, valueKey, pct, colorFn,
}: {
  data: Record<string, unknown>[]
  labelKey: string
  valueKey: string
  pct?: boolean
  colorFn?: (v: number) => string
}) {
  const config = { [valueKey]: { label: pct ? '% Avance' : 'Cantidad' } } satisfies ChartConfig
  const height = Math.max(220, data.length * 20)
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={pct ? (v) => `${Math.round(v)}%` : undefined} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey={labelKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={150} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => [pct ? `${(Number(value)).toFixed(1)}%` : String(value), '']} />} />
        <Bar dataKey={valueKey} radius={4}>
          {colorFn && data.map((entry, i) => <Cell key={i} fill={colorFn(Number(entry[valueKey]))} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export { COLOR_VERDE, COLOR_AZUL, COLOR_NARANJA, COLOR_ROJO, COLOR_MORADO }

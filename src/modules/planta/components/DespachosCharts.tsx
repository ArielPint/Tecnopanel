import type { ComponentProps } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/modules/financiero/components/ui/chart'
import type { DespachosData } from '../hooks/useDespachosData'

// Negro en tema claro, blanco en tema oscuro — igual que en ResumenCharts.
const VALUE_LABEL_STYLE = { fontSize: 12, fontWeight: 700, fill: 'hsl(var(--foreground))' } as const

// Centrado dentro de la barra (en vez de arriba) para no confundirse con las
// etiquetas de la línea de programado — mismo patrón que realBarLabel en ResumenCharts.
type LabelContent = NonNullable<ComponentProps<typeof LabelList>['content']>
const barraLabel: LabelContent = (props) => {
  const { x, y, width, height, value } = props as {
    x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string
  }
  if (value == null || x == null || y == null || width == null || height == null) return null
  const cx = Number(x) + Number(width) / 2
  const cy = Number(y) + Number(height) / 2
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" style={VALUE_LABEL_STYLE}>
      {value}
    </text>
  )
}

export function DespachosMensualChart({
  data,
  labelDespachado = 'Despachado',
  labelProyectado = 'Proyectado',
  despachadoKey = 'despachado',
  proyectadoKey = 'proyectado',
}: {
  data: Record<string, string | number | null>[]
  labelDespachado?: string
  labelProyectado?: string
  despachadoKey?: string
  proyectadoKey?: string
}) {
  const config = {
    [despachadoKey]: { label: labelDespachado, color: '#3fb950' },
    [proyectadoKey]: { label: labelProyectado, color: '#58a6ff' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 24 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey={despachadoKey} fill={`var(--color-${despachadoKey})`} radius={4}>
          <LabelList dataKey={despachadoKey} content={barraLabel} />
        </Bar>
        <Line type="monotone" dataKey={proyectadoKey} stroke={`var(--color-${proyectadoKey})`} strokeWidth={2.5} dot={{ r: 4 }} connectNulls>
          <LabelList dataKey={proyectadoKey} position="top" style={VALUE_LABEL_STYLE} />
        </Line>
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function DespachosSemanalChart({ data }: { data: DespachosData['semanal'] }) {
  const config = {
    despachadoAcum: { label: 'Despachado acumulado', color: '#3fb950' },
    proyectadoAcum: { label: 'Proyectado acumulado', color: '#58a6ff' },
    despachadoSemanal: { label: 'Despachado semanal', color: '#ffa726' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="despachadoSemanal" fill="var(--color-despachadoSemanal)" radius={3} />
        <Line type="monotone" dataKey="despachadoAcum" stroke="var(--color-despachadoAcum)" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="proyectadoAcum" stroke="var(--color-proyectadoAcum)" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function DespachosDiarioChart({ data }: { data: DespachosData['diario'] }) {
  const config = {
    despachadoAcum: { label: 'Despachado acumulado', color: '#3fb950' },
    proyectadoAcum: { label: 'Proyectado acumulado', color: '#58a6ff' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="dia" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="despachadoAcum" stroke="var(--color-despachadoAcum)" strokeWidth={2} dot={{ r: 2 }} />
        <Line type="monotone" dataKey="proyectadoAcum" stroke="var(--color-proyectadoAcum)" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ChartContainer>
  )
}

const TIPO_COLORS = ['#58a6ff', '#3fb950', '#e3903e', '#bc8cff']

export function DespachosTorreTipoChart({ data, tipos }: { data: DespachosData['torreTipo']; tipos: string[] }) {
  const config: ChartConfig = {}
  tipos.forEach((t, i) => {
    config[t] = { label: t, color: TIPO_COLORS[i % TIPO_COLORS.length] }
  })
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="torre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {tipos.map((t) => (
          <Bar key={t} dataKey={t} fill={`var(--color-${t})`} radius={3} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

import type { ComponentProps } from 'react'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { yHeadroom } from '@/lib/chartDomain'
import type { CurvaData } from '../hooks/useCurvaData'
import { INST } from '../lib/coloresInstitucionales'

const VALUE_LABEL_STYLE = { fontSize: 11, fontWeight: 700, fill: 'hsl(var(--foreground))' } as const

const labelFmt = (fn: (v: number) => string) => (v: unknown) => (v == null ? '' : fn(Number(v)))

export function CurvaSChart({ data }: { data: CurvaData['curvaByWeek'] }) {
  const config = {
    teorico: { label: '% Teórico', color: '#58a6ff' },
    real: { label: '% Real', color: '#3fb950' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <AreaChart data={data} margin={{ left: 8, right: 28 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis domain={yHeadroom} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'teorico' ? '% Teórico' : '% Real'}</span>
                  <span className="font-medium">{Number(value).toFixed(2)}%</span>
                </span>
              )}
            />
          }
        />
        <Area type="monotone" dataKey="teorico" stroke="var(--color-teorico)" fill="var(--color-teorico)" fillOpacity={0.08} strokeWidth={2} dot>
          <LabelList dataKey="teorico" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => `${v.toFixed(1)}%`)} />
        </Area>
        <Area type="monotone" dataKey="real" stroke="var(--color-real)" fill="var(--color-real)" fillOpacity={0.08} strokeWidth={2} dot>
          <LabelList dataKey="real" position="bottom" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => `${v.toFixed(1)}%`)} />
        </Area>
        <Legend verticalAlign="bottom" height={36} />
      </AreaChart>
    </ChartContainer>
  )
}

export function ModulosLineChart({
  data,
  planKey,
  realKey,
  title,
}: {
  data: CurvaData['avByWeek']
  planKey: 'planAcum' | 'termPlanAcum'
  realKey: 'realAcum' | 'termRealAcum'
  title: string
}) {
  const config = {
    [planKey]: { label: 'Planificado', color: '#e3903e' },
    [realKey]: { label: 'Real', color: '#58a6ff' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full" aria-label={title}>
      <AreaChart data={data} margin={{ left: 8, right: 28 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis domain={yHeadroom} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey={planKey} stroke={`var(--color-${planKey})`} fill={`var(--color-${planKey})`} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }}>
          <LabelList dataKey={planKey} position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => v.toFixed(0))} />
        </Area>
        <Area type="monotone" dataKey={realKey} stroke={`var(--color-${realKey})`} fill={`var(--color-${realKey})`} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }}>
          <LabelList dataKey={realKey} position="bottom" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => v.toFixed(0))} />
        </Area>
      </AreaChart>
    </ChartContainer>
  )
}

export function GalponBarChart({ data }: { data: CurvaData['galponByWeek'] }) {
  const config = { count: { label: 'Módulos', color: '#58a6ff' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} domain={yHeadroom} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="count" name="Módulos" fill="var(--color-count)" radius={4}>
          <LabelList dataKey="count" position="top" style={VALUE_LABEL_STYLE} />
        </Bar>
      </ComposedChart>
    </ChartContainer>
  )
}

export function TerminadosSemanaBarChart({ data, domainMax, color = '#3fb950' }: { data: CurvaData['terminadosByWeek']; domainMax?: number; color?: string }) {
  const config = { count: { label: 'Módulos', color } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} domain={domainMax ? [0, domainMax + 3] : yHeadroom} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="count" name="Módulos" fill="var(--color-count)" radius={4}>
          <LabelList dataKey="count" position="top" style={VALUE_LABEL_STYLE} />
        </Bar>
      </ComposedChart>
    </ChartContainer>
  )
}

type LabelContent = NonNullable<ComponentProps<typeof LabelList>['content']>

// Desde la torre 5 la barra del tiempo real es alta y la etiqueta de arriba choca
// con la línea del proyectado: en esas torres el valor va al centro de la barra.
const TORRE_ETIQUETA_AL_CENTRO_DESDE = 5

function torreNum(torre: unknown): number {
  const n = parseInt(String(torre ?? '').replace(/\D/g, ''), 10)
  return isNaN(n) ? 0 : n
}

function realTorreLabel(data: CurvaData['torreTiempo']): LabelContent {
  return (props) => {
    const { x, y, width, height, value, index } = props as {
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      value?: number | string
      index?: number
    }
    if (value == null || x == null || y == null || width == null || height == null) return null
    const alCentro = index != null && torreNum(data[index]?.torre) >= TORRE_ETIQUETA_AL_CENTRO_DESDE
    const cx = Number(x) + Number(width) / 2
    const cy = alCentro ? Number(y) + Number(height) / 2 : Number(y) - 6
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline={alCentro ? 'middle' : undefined} style={VALUE_LABEL_STYLE}>
        {Number(value).toFixed(0)}
      </text>
    )
  }
}

export function TiempoTorreChart({ data, institucional }: { data: CurvaData['torreTiempo']; institucional?: boolean }) {
  const config = {
    real: { label: 'Tiempo Real (días)', color: institucional ? INST.rojo : '#3fb950' },
    proy: { label: 'Tiempo Proyectado (días)', color: institucional ? INST.plomo : '#e3903e' },
  } satisfies ChartConfig
  if (!data.length) return <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Sin datos</div>
  return (
    <ChartContainer config={config} className="aspect-auto h-[340px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="torre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis domain={yHeadroom} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="real" name="Tiempo Real (días)" fill="var(--color-real)" radius={4}>
          <LabelList dataKey="real" content={realTorreLabel(data)} />
        </Bar>
        <Line type="monotone" dataKey="proy" name="Tiempo Proyectado (días)" stroke="var(--color-proy)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls>
          <LabelList dataKey="proy" position="top" style={VALUE_LABEL_STYLE} formatter={labelFmt((v) => v.toFixed(0))} />
        </Line>
      </ComposedChart>
    </ChartContainer>
  )
}

export function TiempoModuloChart({ data }: { data: { modulo: string; real: number; proy: number | null }[] }) {
  const config = {
    real: { label: 'Tiempo Real (días)', color: '#3fb950' },
    proy: { label: 'Tiempo Proyectado (días)', color: '#e3903e' },
  } satisfies ChartConfig
  if (!data.length) return <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Sin módulos con estos filtros</div>
  const height = Math.max(320, data.length * 26)
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="modulo" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="real" fill="var(--color-real)" radius={3} />
        <Line type="monotone" dataKey="proy" stroke="var(--color-proy)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
}

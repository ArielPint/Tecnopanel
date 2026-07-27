import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { CurvaData } from '../hooks/useCurvaData'

export function CurvaSChart({ data }: { data: CurvaData['curvaByWeek'] }) {
  const config = {
    teorico: { label: '% Teórico', color: '#58a6ff' },
    real: { label: '% Real', color: '#3fb950' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
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
        <Area type="monotone" dataKey="teorico" stroke="var(--color-teorico)" fill="var(--color-teorico)" fillOpacity={0.08} strokeWidth={2} dot />
        <Area type="monotone" dataKey="real" stroke="var(--color-real)" fill="var(--color-real)" fillOpacity={0.08} strokeWidth={2} dot />
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
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area type="monotone" dataKey={planKey} stroke={`var(--color-${planKey})`} fill={`var(--color-${planKey})`} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }} />
        <Area type="monotone" dataKey={realKey} stroke={`var(--color-${realKey})`} fill={`var(--color-${realKey})`} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }} />
      </AreaChart>
    </ChartContainer>
  )
}

export function GalponBarChart({ data }: { data: CurvaData['galponByWeek'] }) {
  const config = { count: { label: 'Módulos', color: '#58a6ff' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function TiempoTorreChart({ data }: { data: CurvaData['torreTiempo'] }) {
  const config = {
    real: { label: 'Tiempo Real (días)', color: '#3fb950' },
    proy: { label: 'Tiempo Proyectado (días)', color: '#e3903e' },
  } satisfies ChartConfig
  if (!data.length) return <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Sin datos</div>
  return (
    <ChartContainer config={config} className="aspect-auto h-[340px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="torre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="real" fill="var(--color-real)" radius={4} />
        <Line type="monotone" dataKey="proy" stroke="var(--color-proy)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
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

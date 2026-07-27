import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { ModulosData } from '../hooks/useModulosData'

const BUCKET_COLORS_10 = [
  '#f06e3c', '#e3903e', '#d2af32', '#bec337', '#a3c83c',
  '#82c846', '#64c850', '#4bc050', '#37b94b',
]

export function DistribucionAvanceChart({ data }: { data: ModulosData['distribucionAvance'] }) {
  const config = { cantidad: { label: 'Módulos' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="cantidad" radius={4}>
          {data.map((entry, i) => (
            <Cell key={entry.bucket} fill={BUCKET_COLORS_10[i]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function colorPorAvance(pct: number) {
  if (pct >= 75) return '#3fb950'
  if (pct >= 50) return '#58a6ff'
  if (pct >= 25) return '#e3903e'
  return '#f85149'
}

export function AvancePorTorreChart({ data }: { data: ModulosData['avancePorTorre'] }) {
  const config = { avance: { label: '% Avance' } } satisfies ChartConfig
  if (!data.length) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sin torres activas</div>
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="torre" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>% Avance</span>
                  <span className="font-medium">{Number(value).toFixed(2)}%</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="avance" radius={4}>
          {data.map((d) => (
            <Cell key={d.torre} fill={colorPorAvance(d.avance)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function M2SemanalAcumChart({ data }: { data: ModulosData['m2SemanalAcum'] }) {
  if (!data.length) return null
  const config = {
    real: { label: 'Real acumulado', color: '#d42b1e' },
    plan: { label: 'Programado acumulado', color: '#4f8ef7' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-40} textAnchor="end" height={50} />
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
        <Bar dataKey="real" fill="var(--color-real)" radius={3} />
        <Line type="monotone" dataKey="plan" stroke="var(--color-plan)" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
}

export function M2SemanalDiarioChart({ data }: { data: ModulosData['m2SemanalDiario'] }) {
  if (!data.length) return null
  const config = {
    real: { label: 'Real diario', color: '#3fb950' },
    plan: { label: 'Programado diario', color: '#e3903e' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-40} textAnchor="end" height={50} />
        <YAxis tickFormatter={(v) => v.toLocaleString('es-CL')} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'real' ? 'Real diario' : 'Programado diario'}</span>
                  <span className="font-medium">{Number(value).toLocaleString('es-CL')} m²</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="real" fill="var(--color-real)" radius={3} />
        <Line type="monotone" dataKey="plan" stroke="var(--color-plan)" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
}

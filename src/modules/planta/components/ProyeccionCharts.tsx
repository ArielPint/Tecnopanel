import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { ProyeccionData } from '../hooks/useProyeccionData'
import { fmtPr } from '../lib/format'

export function ProyeccionTerminoChart({ data, torreSel }: { data: ProyeccionData['proyeccionTermino']; torreSel: string | null }) {
  const config = {
    real: { label: 'Real acumulado', color: '#3fb950' },
    proyeccion: { label: `Proyección — escenario ${torreSel ?? ''}`, color: '#58a6ff' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="real" stroke="var(--color-real)" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
        <Line type="monotone" dataKey="proyeccion" stroke="var(--color-proyeccion)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
      </LineChart>
    </ChartContainer>
  )
}

export function ProyeccionEscenariosChart({ data, torreSel }: { data: ProyeccionData['escenarios']; torreSel: string | null }) {
  const chartData = data.map((e) => ({ torre: `${e.torre} (${e.ritmo.toFixed(1)} mód/sem)`, semanas: e.semanas != null ? +e.semanas.toFixed(1) : 0, esSel: e.torre === torreSel }))
  const config = { semanas: { label: 'Semanas restantes' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="torre" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={70} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="semanas" radius={4}>
          {chartData.map((d) => (
            <Cell key={d.torre} fill={d.esSel ? '#3fb950' : '#4f8ef7'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function ProyeccionEconChart({ data }: { data: ProyeccionData['econMensual'] }) {
  const config = {
    real: { label: 'Real', color: '#d42b1e' },
    proyectado: { label: 'Proyección manual', color: '#4f8ef7' },
    burn: { label: 'Burn rate proyectado', color: '#f5a623' },
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
                  <span>{name === 'real' ? 'Real' : name === 'proyectado' ? 'Proyección manual' : 'Burn rate'}</span>
                  <span className="font-medium">{fmtPr(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="real" fill="var(--color-real)" radius={4} />
        <Line type="monotone" dataKey="proyectado" stroke="var(--color-proyectado)" strokeWidth={2.5} dot connectNulls />
        <Line type="monotone" dataKey="burn" stroke="var(--color-burn)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ChartContainer>
  )
}

export function ProyeccionEconAcumChart({ data }: { data: ProyeccionData['econMensual'] }) {
  const config = {
    realAcum: { label: 'Real acumulado', color: '#3fb950' },
    proyAcum: { label: 'Proyectado acumulado', color: '#4f8ef7' },
    burnAcum: { label: 'Burn rate acumulado', color: '#f5a623' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'realAcum' ? 'Real acumulado' : name === 'proyAcum' ? 'Proyectado acumulado' : 'Burn acumulado'}</span>
                  <span className="font-medium">{fmtPr(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Line type="monotone" dataKey="realAcum" stroke="var(--color-realAcum)" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
        <Line type="monotone" dataKey="proyAcum" stroke="var(--color-proyAcum)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
        <Line type="monotone" dataKey="burnAcum" stroke="var(--color-burnAcum)" strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls />
      </LineChart>
    </ChartContainer>
  )
}

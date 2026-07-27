import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { ProductosData } from '../hooks/useProductosData'

function colorAvanceTeorico(v: number) {
  if (v > 100) return '#f85149'
  if (v >= 80) return '#3fb950'
  if (v >= 50) return '#e3903e'
  return '#f85149'
}

export function AvanceTeoricoChart({ data }: { data: ProductosData['avanceTeorico'] }) {
  const config = { avance: { label: '% Avance Teórico' } } satisfies ChartConfig
  const height = Math.max(280, data.length * 22)
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="producto" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={150} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>% Avance Teórico</span>
                  <span className="font-medium">{Number(value).toFixed(2)}%</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="avance" radius={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorAvanceTeorico(d.avance)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function colorAvancePedidos(v: number) {
  if (v >= 90) return '#3fb950'
  if (v >= 60) return '#e3903e'
  return '#f85149'
}

export function AvancePedidosChart({ data }: { data: ProductosData['avancePedidos'] }) {
  const config = { avance: { label: '% Avance pedidos' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="producto" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>% Avance pedidos</span>
                  <span className="font-medium">{Number(value).toFixed(2)}%</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="avance" radius={5}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorAvancePedidos(d.avance)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function VariacionUnitariaChart({ data }: { data: ProductosData['variacion'] }) {
  const config = { variacion: { label: '% Variación' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="producto" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>% Variación</span>
                  <span className="font-medium">{Number(value).toFixed(2)}%</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="variacion" radius={5}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.variacion < 0 ? '#3fb950' : '#f85149'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

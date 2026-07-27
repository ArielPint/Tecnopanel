import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { StockData } from '../hooks/useStockData'

export function StockComparacionChart({ data }: { data: StockData['comparacion'] }) {
  const config = {
    anterior: { label: 'Anterior', color: '#7d8590' },
    actual: { label: 'Actual', color: '#4f8ef7' },
  } satisfies ChartConfig
  if (!data.length) {
    return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Sin datos de stock</div>
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-[340px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="material" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={70} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="anterior" fill="var(--color-anterior)" radius={3} />
        <Bar dataKey="actual" fill="var(--color-actual)" radius={3} />
      </BarChart>
    </ChartContainer>
  )
}

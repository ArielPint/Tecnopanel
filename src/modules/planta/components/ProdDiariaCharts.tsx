import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { ProdDiariaData } from '../hooks/useProdDiariaData'

export function ProdDiariaChart({ data, cats, catKeys }: { data: ProdDiariaData['chartData']; cats: ProdDiariaData['cats']; catKeys: ProdDiariaData['catKeys'] }) {
  if (!data.length) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sin datos en el rango seleccionado</div>
  }
  const config: ChartConfig = {}
  for (const c of catKeys) config[c] = { label: cats[c].label, color: cats[c].color }
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {catKeys.map((c) => (
          <Bar key={c} dataKey={c} fill={`var(--color-${c})`} radius={3} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

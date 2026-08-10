import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { useFacturas } from '@/modules/financiero/hooks/useFacturas'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { BarChart3 } from 'lucide-react'
import { formatCLP, formatCLPCompact, nombreMes } from '@/modules/financiero/utils/formatters'

const chartConfig = {
  monto: { label: 'Facturado', color: 'hsl(var(--success))' },
} satisfies ChartConfig

export default function GraficoFacturadoPorMes() {
  const { facturas, loading } = useFacturas()

  const data = useMemo(() => {
    const porMes = new Map<string, { mes: number; anio: number; monto: number }>()
    for (const f of facturas) {
      if (f.estado === 'ANULADA' || f.mes == null || f.anio == null) continue
      const key = `${f.anio}-${String(f.mes).padStart(2, '0')}`
      const actual = porMes.get(key) ?? { mes: f.mes, anio: f.anio, monto: 0 }
      actual.monto += f.monto
      porMes.set(key, actual)
    }
    return Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ periodo: key, label: `${nombreMes(v.mes).slice(0, 3)} ${v.anio}`, monto: v.monto }))
  }, [facturas])

  if (loading) return <Skeleton className="h-[320px] w-full" />
  if (data.length === 0) {
    return <EmptyState icon={BarChart3} title="Todavía no hay facturas para graficar" />
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatCLPCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>Facturado</span>
                  <span className="font-medium">{formatCLP(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="monto" fill="var(--color-monto)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

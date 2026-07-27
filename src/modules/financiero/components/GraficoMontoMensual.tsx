import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import type { MontoMensual } from '@/modules/financiero/types/financiero'
import { formatCLP, formatCLPCompact, nombreMes } from '@/modules/financiero/utils/formatters'

interface GraficoMontoMensualProps {
  registros: MontoMensual[]
  loading: boolean
  colorVar: string
  etiqueta: string
}

export default function GraficoMontoMensual({ registros, loading, colorVar, etiqueta }: GraficoMontoMensualProps) {
  const chartConfig = useMemo(
    () => ({ monto: { label: etiqueta, color: `var(${colorVar})` } }) satisfies ChartConfig,
    [colorVar, etiqueta],
  )

  const data = useMemo(() => {
    const porMes = new Map<string, { mes: number; anio: number; monto: number }>()
    for (const r of registros) {
      const key = `${r.anio}-${r.mes}`
      const acc = porMes.get(key) ?? { mes: r.mes, anio: r.anio, monto: 0 }
      acc.monto += r.monto
      porMes.set(key, acc)
    }
    return [...porMes.values()]
      .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
      .map((r) => ({ label: `${nombreMes(r.mes).slice(0, 3)} ${r.anio}`, monto: r.monto }))
  }, [registros])

  if (loading) return <Skeleton className="h-[280px] w-full" />

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatCLPCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{etiqueta}</span>
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

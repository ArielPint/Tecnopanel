import { useMemo } from 'react'
import { Cell, Label, Pie, PieChart } from 'recharts'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { formatCLP, formatCLPCompact, formatPct } from '@/modules/financiero/utils/formatters'

const chartConfig = {
  facturado: { label: 'Facturado', color: 'hsl(var(--success))' },
  pendiente: { label: 'Pendiente por facturar', color: 'hsl(var(--muted-foreground))' },
} satisfies ChartConfig

interface GraficoComposicionGlobalProps {
  seguimiento: SeguimientoPresupuesto[]
  loading: boolean
}

export default function GraficoComposicionGlobal({ seguimiento, loading }: GraficoComposicionGlobalProps) {
  const { data, totalPresupuesto, pctGlobal } = useMemo(() => {
    const totalPresupuesto = seguimiento.reduce((acc, r) => acc + r.presupuesto_original, 0)
    const totalFacturado = seguimiento.reduce((acc, r) => acc + r.facturado, 0)
    const pendiente = Math.max(totalPresupuesto - totalFacturado, 0)
    return {
      totalPresupuesto,
      pctGlobal: totalPresupuesto > 0 ? totalFacturado / totalPresupuesto : 0,
      data: [
        { key: 'facturado', valor: totalFacturado, fill: 'var(--color-facturado)' },
        { key: 'pendiente', valor: pendiente, fill: 'var(--color-pendiente)' },
      ],
    }
  }, [seguimiento])

  if (loading) return <Skeleton className="h-[280px] w-full" />

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[280px]">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                  <span className="font-medium">{formatCLP(Number(value))}</span>
                </span>
              )}
              hideLabel
            />
          }
        />
        <Pie data={data} dataKey="valor" nameKey="key" innerRadius={70} outerRadius={100} strokeWidth={2}>
          {data.map((entry) => (
            <Cell key={entry.key} fill={entry.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !('cx' in viewBox) || viewBox.cx == null || viewBox.cy == null) return null
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold tabular-nums">
                    {formatPct(pctGlobal)}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                    de {formatCLPCompact(totalPresupuesto)}
                  </tspan>
                </text>
              )
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

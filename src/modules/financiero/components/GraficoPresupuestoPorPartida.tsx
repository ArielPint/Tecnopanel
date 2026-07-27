import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { formatCLPCompact } from '@/modules/financiero/utils/formatters'

const chartConfig = {
  presupuesto_original: { label: 'Presupuesto', color: 'var(--muted-foreground)' },
  oc_ingresadas: { label: 'OC Ingresadas', color: 'var(--primary)' },
  facturado: { label: 'Facturado', color: 'var(--success)' },
} satisfies ChartConfig

function truncar(texto: string, max = 22) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

interface GraficoPresupuestoPorPartidaProps {
  seguimiento: SeguimientoPresupuesto[]
  loading: boolean
}

export default function GraficoPresupuestoPorPartida({ seguimiento, loading }: GraficoPresupuestoPorPartidaProps) {
  const data = useMemo(
    () =>
      [...seguimiento]
        .sort((a, b) => b.presupuesto_original - a.presupuesto_original)
        .map((row) => ({
          nombre: truncar(row.nombre),
          nombreCompleto: row.nombre,
          presupuesto_original: row.presupuesto_original,
          oc_ingresadas: row.oc_ingresadas,
          facturado: row.facturado,
        })),
    [seguimiento],
  )

  if (loading) return <Skeleton className="h-[420px] w-full" />

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[420px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={formatCLPCompact} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="nombre"
          width={140}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                  <span className="font-medium">{formatCLPCompact(Number(value))}</span>
                </span>
              )}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.nombreCompleto ?? ''}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="presupuesto_original" fill="var(--color-presupuesto_original)" radius={2} />
        <Bar dataKey="oc_ingresadas" fill="var(--color-oc_ingresadas)" radius={2} />
        <Bar dataKey="facturado" fill="var(--color-facturado)" radius={2} />
      </BarChart>
    </ChartContainer>
  )
}

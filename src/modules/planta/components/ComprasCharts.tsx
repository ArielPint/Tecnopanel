import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/modules/financiero/components/ui/chart'
import type { ComprasData } from '../hooks/useComprasData'
import { fmtM } from '../lib/format'

export function ComprasPorMesChart({ data }: { data: ComprasData['comprasPorMes'] }) {
  const config = {
    real: { label: 'Compras reales', color: '#58a6ff' },
    presupuesto: { label: 'Presupuesto', color: '#e3903e' },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => fmtM(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{name === 'real' ? 'Compras reales' : 'Presupuesto'}</span>
                  <span className="font-medium">{fmtM(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="real" fill="var(--color-real)" radius={4} />
        <Bar dataKey="presupuesto" fill="var(--color-presupuesto)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

export function TopMaterialesChart({ data }: { data: ComprasData['topMateriales'] }) {
  const config = { monto: { label: 'Monto', color: '#bc8cff' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => fmtM(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="material" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={140} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>Monto</span>
                  <span className="font-medium">{fmtM(Number(value))}</span>
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

const TIPO_COLORS = ['#58a6ff', '#e3903e', '#bc8cff', '#3fb950']

export function ComprasPorTipoChart({ data }: { data: ComprasData['porTipo'] }) {
  const config = { monto: { label: 'Monto' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{String(item?.payload?.tipo ?? '')}</span>
                  <span className="font-medium">{fmtM(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Pie data={data} dataKey="monto" nameKey="tipo" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={d.tipo} fill={TIPO_COLORS[i % TIPO_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

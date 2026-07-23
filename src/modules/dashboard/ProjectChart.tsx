import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProjectKpi } from './types'
import { KPI_LABELS } from './types'
import { useThemeStore } from '../../store/themeStore'

export default function ProjectChart({ kpis }: { kpis: ProjectKpi[] }) {
  const isDark = useThemeStore((s) => s.mode) === 'dark'
  const data = kpis.map((k) => ({
    name: KPI_LABELS[k.key] ?? k.key,
    valor: k.valor,
  }))
  const gridColor = isDark ? '#3f3f46' : '#e5e7eb'
  const tickColor = isDark ? '#a1a1aa' : '#6b7280'

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: tickColor }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 11, fill: tickColor }} />
          <Tooltip
            contentStyle={
              isDark ? { background: '#27272a', border: '1px solid #3f3f46', color: '#fff' } : undefined
            }
          />
          <Bar dataKey="valor" fill="#ED3224" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

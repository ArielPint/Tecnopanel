import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMontoCLP } from '@/lib/montoCLP'

type Tone = 'brand' | 'info' | 'success' | 'warning' | 'purple'

const toneClasses: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  purple: 'bg-chart-5/15 text-chart-5',
}

interface KpiCardProps {
  icon: LucideIcon
  tone: Tone
  label: string
  value?: number | null
  format?: 'int' | 'percent' | 'currency'
  loading?: boolean
}

function formatValue(value: number, format: KpiCardProps['format']) {
  if (format === 'percent') return `${Math.round(value)}%`
  if (format === 'currency') {
    return fmtMontoCLP(value)
  }
  return new Intl.NumberFormat('es-CL').format(value)
}

export default function KpiCard({ icon: Icon, tone, label, value, format = 'int', loading }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className={cn('flex h-[34px] w-[34px] items-center justify-center rounded-md', toneClasses[tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div>
        {loading ? (
          <div className="h-[26px] w-16 animate-pulse rounded bg-muted" />
        ) : (
          <p className="font-mono-tabular text-[22px] font-extrabold tracking-tight">
            {value == null ? <span className="text-muted-foreground">—</span> : formatValue(value, format)}
          </p>
        )}
        <p className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

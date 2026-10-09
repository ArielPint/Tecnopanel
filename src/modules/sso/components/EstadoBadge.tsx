import { cn } from '@/lib/utils'
import { ESTADO_META } from '../lib/estados'
import type { EstadoSso } from '../lib/tipos'

export function EstadoBadge({ estado }: { estado: EstadoSso }) {
  const meta = ESTADO_META[estado]
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.clase)}>
      {meta.label}
    </span>
  )
}

export function VencidoBadge({ dias }: { dias: number }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
      Vencido {dias} {dias === 1 ? 'día' : 'días'}
    </span>
  )
}

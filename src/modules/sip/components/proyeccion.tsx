import { ChevronLeft, ChevronRight } from 'lucide-react'
import { create } from 'zustand'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import { fmtMes, mesActual, sumarMeses } from '../lib/proyeccion'

// Piezas comunes de la proyección mensual: el mes que se mira (lo comparten las pestañas) y cómo se
// escriben los números.

const useMes = create<{ mes: string; setMes: (m: string) => void }>((set) => ({ mes: mesActual(), setMes: (mes) => set({ mes }) }))

export function useMesProy() {
  return useMes()
}

export function SelectorMes() {
  const { mes, setMes } = useMes()
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior">
        <ChevronLeft />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-semibold capitalize">{fmtMes(mes)}</span>
      <Button variant="outline" size="icon-sm" onClick={() => setMes(sumarMeses(mes, 1))} aria-label="Mes siguiente">
        <ChevronRight />
      </Button>
      {mes !== mesActual() && (
        <Button variant="ghost" size="sm" onClick={() => setMes(mesActual())}>
          Hoy
        </Button>
      )}
    </div>
  )
}

/** Número escrito por el usuario: acepta coma decimal; vacío = null. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  // 1.234,5 -> 1234.5 ; 1234,5 -> 1234.5 ; 1234.5 -> 1234.5
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(normal)
  return Number.isFinite(v) ? v : NaN
}

/** Monto en pesos escrito por el usuario: los puntos son de miles. */
export function leerPesos(texto: string): number | null {
  const t = texto.trim().replace(/[\s$.]/g, '').replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? Math.round(v) : NaN
}

export const fmtEntrada = (n: number | null | undefined, decimales = 4) =>
  n == null ? '' : n.toLocaleString('es-CL', { maximumFractionDigits: decimales, useGrouping: false })

export function PctCumpl({ real, base, className }: { real: number; base: number; className?: string }) {
  if (!(base > 0)) return <span className={cn('text-muted-foreground', className)}>—</span>
  const c = real / base
  return (
    <span
      className={cn(
        'font-semibold',
        c >= 0.95 ? 'text-emerald-600 dark:text-emerald-400' : c < 0.8 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      {(c * 100).toLocaleString('es-CL', { maximumFractionDigits: 0 })}%
    </span>
  )
}

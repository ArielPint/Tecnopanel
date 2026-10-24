import { useEffect, useId, useState } from 'react'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import type { EstadoRendicion } from '../lib/rendiciones'

// Piezas compartidas por las pantallas de Rendiciones.

export interface Opcion {
  valor: string
  etiqueta: string
}

/** Campo con búsqueda para listas largas (plan de cuentas, proyectos): se escribe el código o parte del nombre y
 *  se elige de la lista. Vacío = null (volver a la regla). Un texto que no calza con ninguna opción no se guarda. */
export function SelectorCodigo({
  opciones,
  valor,
  onCambio,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  opciones: Opcion[]
  valor: string | null
  onCambio: (valor: string | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const id = useId()
  const etiqueta = (v: string | null) => (v ? (opciones.find((o) => o.valor === v)?.etiqueta ?? v) : '')
  const [texto, setTexto] = useState(etiqueta(valor))
  const [invalido, setInvalido] = useState(false)

  useEffect(() => setTexto(etiqueta(valor)), [valor, opciones])

  function confirmar(t: string) {
    const limpio = t.trim()
    if (!limpio) {
      setInvalido(false)
      if (valor !== null) onCambio(null)
      return
    }
    const minus = limpio.toLowerCase()
    const op =
      opciones.find((o) => o.etiqueta === limpio) ??
      opciones.find((o) => o.valor.toLowerCase() === minus) ??
      opciones.find((o) => o.etiqueta.toLowerCase().startsWith(minus + ' '))
    if (!op) return setInvalido(true)
    setInvalido(false)
    setTexto(op.etiqueta)
    if (op.valor !== valor) onCambio(op.valor)
  }

  return (
    <>
      <Input
        list={id}
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalido || undefined}
        title={invalido ? 'No calza con ninguna opción: elige una de la lista' : texto}
        className={cn('h-8 text-xs', invalido && 'border-destructive', className)}
        onChange={(e) => {
          setTexto(e.target.value)
          // elegir de la lista dispara change con la etiqueta exacta: se guarda de inmediato
          if (opciones.some((o) => o.etiqueta === e.target.value)) confirmar(e.target.value)
        }}
        onBlur={(e) => confirmar(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && confirmar((e.target as HTMLInputElement).value)}
      />
      <datalist id={id}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.etiqueta} />
        ))}
      </datalist>
    </>
  )
}

const VARIANTE: Record<EstadoRendicion, 'warning' | 'destructive' | 'success'> = {
  pendiente: 'warning',
  observado: 'destructive',
  aprobado: 'success',
}
const TEXTO: Record<EstadoRendicion, string> = { pendiente: 'Pendiente', observado: 'Con observaciones', aprobado: 'Aprobada' }

export function EstadoBadge({ estado }: { estado: EstadoRendicion }) {
  return <Badge variant={VARIANTE[estado]}>{TEXTO[estado]}</Badge>
}

/** Estado de un período contable de SAP (OFPR.PeriodStat). */
export function textoPeriodo(estado: string | undefined) {
  if (estado === 'N') return null
  if (estado === 'Y') return 'bloqueado en SAP'
  if (estado === 'C' || estado === 'S') return 'cerrándose en SAP'
  return 'no existe en SAP'
}

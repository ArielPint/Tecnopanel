import { useMemo, useState, type KeyboardEvent } from 'react'
import { Input } from '@/modules/financiero/components/ui/input'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import type { OrdenCompra } from '@/modules/financiero/types/financiero'

interface RelacionOCFacturaProps {
  ordenesCompra: OrdenCompra[]
  value: string
  onChange: (value: string) => void
  // Se dispara al elegir una OC, para que el formulario pueda auto-completar
  // otros campos (ej. RUT proveedor) con los datos de esa OC.
  onSelectOC?: (oc: OrdenCompra) => void
}

// Combobox de OC: se busca escribiendo el N° de OC (en vez de un <Select>
// con todas las OC listadas) porque en la práctica hay demasiadas para
// desplazarse — igual se muestra presupuesto + neto porque una misma OC
// puede repetirse repartida entre varias partidas (verificado en datos reales).
export default function RelacionOCFactura({ ordenesCompra, value, onChange, onSelectOC }: RelacionOCFacturaProps) {
  const { presupuestos } = usePresupuestosLookup()
  const nombrePresupuesto = (id: string) => presupuestos.find((p) => p.id === id)?.nombre ?? '—'

  const [open, setOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const ocSeleccionada = ordenesCompra.find((oc) => oc.id === value)
  const disponibles = useMemo(() => ordenesCompra.filter((oc) => oc.estado !== 'ANULADA'), [ordenesCompra])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return disponibles
    return disponibles.filter((oc) => oc.numero_oc.toLowerCase().includes(q))
  }, [disponibles, busqueda])

  const elegir = (oc: OrdenCompra) => {
    onChange(oc.id)
    onSelectOC?.(oc)
    setBusqueda('')
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = busqueda.trim().toLowerCase()
    const exacta = disponibles.find((oc) => oc.numero_oc.toLowerCase() === q)
    if (exacta) elegir(exacta)
    else if (filtradas.length === 1) elegir(filtradas[0])
  }

  const textoInput = open ? busqueda : ocSeleccionada ? `OC ${ocSeleccionada.numero_oc}` : ''

  return (
    <div className="relative">
      <Input
        value={textoInput}
        placeholder="Ingresá el N° de OC…"
        onChange={(e) => setBusqueda(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {filtradas.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Ninguna OC coincide</p>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              {filtradas.map((oc) => (
                <button
                  key={oc.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(oc)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    oc.id === value && 'bg-accent/50',
                  )}
                >
                  <span className="font-medium">OC {oc.numero_oc}</span>
                  <span className="text-xs text-muted-foreground">
                    {nombrePresupuesto(oc.presupuesto_id)} · {formatCLP(oc.neto)}
                    {oc.proveedor_rut ? ` · ${oc.proveedor_rut}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

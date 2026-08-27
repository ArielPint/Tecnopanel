import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '@/modules/financiero/components/ui/input'
import { normCod } from '../lib/calc'
import type { Producto } from '../hooks/useCatalogoGD'

interface Props {
  value: string
  productos: Producto[]
  onSelect: (producto: Producto) => void
  onChange: (codigo: string) => void
  placeholder?: string
}

export default function ProductoAutocomplete({ value, productos, onSelect, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return productos.filter((p) => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)).slice(0, 12)
  }, [value, productos])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function pick(p: Producto) {
    onSelect(p)
    setOpen(false)
    setActiveIdx(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || !matches.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeIdx >= 0) {
        e.preventDefault()
        pick(matches[activeIdx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const exact = productos.find((p) => normCod(p.codigo) === normCod(value))

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder ?? 'Código…'}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIdx(-1)
          const m = productos.find((p) => normCod(p.codigo) === normCod(e.target.value))
          if (m) onSelect(m)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && !exact && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-[28rem] max-w-[90vw] overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((p, i) => (
            <button
              key={p.codigo}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${i === activeIdx ? 'bg-accent' : ''}`}
              onClick={() => pick(p)}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-primary">{p.codigo}</span>
                <span className="text-xs text-muted-foreground">{p.unidad}</span>
              </div>
              <div className="whitespace-normal break-words text-xs leading-snug">{p.descripcion}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

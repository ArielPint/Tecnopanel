import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import MontoInput from '@/components/MontoInput'
import { UNIDADES } from '../lib/catalogos'
import { buscarArticulos, fmtPesos, type ArticuloSap, type Item } from '../lib/api'

// Ítems de la solicitud. La descripción busca en los artículos de compra de SAP (si están
// sincronizados) y al elegir uno trae su código, unidad y último precio de compra.

export const itemVacio = (): Item => ({ articulo_codigo: null, descripcion: '', cantidad: 1, unidad: 'UN', precio_estimado: null })

export function totalEstimado(items: Item[]): number | null {
  const conPrecio = items.filter((it) => it.precio_estimado != null)
  return conPrecio.length ? conPrecio.reduce((s, it) => s + it.cantidad * (it.precio_estimado ?? 0), 0) : null
}

function Descripcion({ item, onChange }: { item: Item; onChange: (it: Item) => void }) {
  const [sugerencias, setSugerencias] = useState<ArticuloSap[]>([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!abierto || item.articulo_codigo) return
    const t = setTimeout(() => {
      buscarArticulos(item.descripcion).then(setSugerencias).catch(() => setSugerencias([]))
    }, 250)
    return () => clearTimeout(t)
  }, [item.descripcion, item.articulo_codigo, abierto])

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        value={item.descripcion}
        onChange={(e) => onChange({ ...item, descripcion: e.target.value, articulo_codigo: null })}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Descripción o código SAP"
        aria-label="Descripción del ítem"
      />
      {item.articulo_codigo && <p className="mt-0.5 font-mono-tabular text-[11px] text-muted-foreground">SAP {item.articulo_codigo}</p>}
      {abierto && sugerencias.length > 0 && !item.articulo_codigo && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover text-sm text-popover-foreground shadow-lg">
          {sugerencias.map((a) => (
            <li key={a.codigo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({
                    ...item,
                    descripcion: a.nombre,
                    articulo_codigo: a.codigo,
                    unidad: a.unidad || item.unidad,
                    precio_estimado: item.precio_estimado ?? (a.ultimo_precio ? Math.round(a.ultimo_precio) : null),
                  })
                  setAbierto(false)
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate">{a.nombre}</span>
                  <span className="font-mono-tabular text-[11px] text-muted-foreground">{a.codigo}</span>
                </span>
                {a.ultimo_precio != null && <span className="shrink-0 text-xs text-muted-foreground">últ. {fmtPesos(a.ultimo_precio)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function EditorItems({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
  const set = (i: number, it: Item) => onChange(items.map((x, j) => (j === i ? it : x)))
  const total = totalEstimado(items)

  return (
    <div className="space-y-2">
      <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
        <span className="flex-1">Descripción</span>
        <span className="w-24">Cantidad</span>
        <span className="w-28">Unidad</span>
        <span className="w-36">Precio unit. estimado</span>
        <span className="w-9" />
      </div>
      {items.map((it, i) => (
        <div key={it.id ?? `n${i}`} className="flex flex-wrap items-start gap-2 rounded-md border p-2 sm:flex-nowrap sm:border-0 sm:p-0">
          <Descripcion item={it} onChange={(x) => set(i, x)} />
          <Input
            type="number"
            min={0}
            step="any"
            value={Number.isFinite(it.cantidad) ? it.cantidad : ''}
            onChange={(e) => set(i, { ...it, cantidad: e.target.value === '' ? NaN : Number(e.target.value) })}
            className="w-24 font-mono-tabular"
            aria-label="Cantidad"
          />
          <Input
            list="adq-unidades"
            value={it.unidad}
            onChange={(e) => set(i, { ...it, unidad: e.target.value.toUpperCase() })}
            className="w-28"
            aria-label="Unidad"
          />
          <MontoInput
            value={it.precio_estimado}
            onChange={(v) => set(i, { ...it, precio_estimado: v })}
            placeholder="$ opcional"
            className="h-9 w-36 rounded-md border border-input bg-background px-3 text-sm font-mono-tabular"
            aria-label="Precio unitario estimado"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Quitar ítem ${i + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <datalist id="adq-unidades">
        {UNIDADES.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, itemVacio()])}>
          <Plus className="mr-1 h-4 w-4" /> Agregar ítem
        </Button>
        {total != null && (
          <p className="text-sm text-muted-foreground">
            Estimado neto: <span className="font-mono-tabular font-semibold text-foreground">{fmtPesos(total)}</span>
          </p>
        )}
      </div>
    </div>
  )
}

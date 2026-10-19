import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { guardarTipoVivienda, listarArticulosConReceta, type TipoVivienda } from '../lib/api'

// Tipos de vivienda para la planificación: cada tipo es un conjunto de kits (bultos) de SAP con su cantidad por
// vivienda. Los mantiene el jefe de compras.

type Edicion = { id?: number; nombre: string; descripcion: string; activo: boolean; kits: { kit_codigo: string; kit_nombre: string | null; cantidad: string }[] }

const nuevo = (): Edicion => ({ nombre: '', descripcion: '', activo: true, kits: [] })
const desde = (t: TipoVivienda): Edicion => ({
  id: t.id,
  nombre: t.nombre,
  descripcion: t.descripcion ?? '',
  activo: t.activo,
  kits: t.kits.map((k) => ({ kit_codigo: k.kit_codigo, kit_nombre: k.kit_nombre, cantidad: String(k.cantidad) })),
})

export default function DialogoTiposVivienda({
  abierto,
  tipos,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  tipos: TipoVivienda[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [elegido, setElegido] = useState<number | 'nuevo' | null>(null)
  const [ed, setEd] = useState<Edicion>(nuevo())
  const [catalogo, setCatalogo] = useState<{ codigo: string; nombre: string | null }[]>([])
  const [buscar, setBuscar] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    if (catalogo.length === 0)
      listarArticulosConReceta()
        .then(setCatalogo)
        .catch(() => setCatalogo([]))
    if (elegido == null && tipos.length) {
      setElegido(tipos[0].id)
      setEd(desde(tipos[0]))
    }
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(id: number | 'nuevo') {
    setElegido(id)
    setBuscar('')
    const t = tipos.find((x) => x.id === id)
    setEd(t ? desde(t) : nuevo())
  }

  const opciones = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    if (q.length < 2) return []
    return catalogo
      .filter((c) => !ed.kits.some((k) => k.kit_codigo === c.codigo))
      .filter((c) => c.codigo.includes(q) || (c.nombre ?? '').toLowerCase().includes(q))
      .slice(0, 12)
  }, [buscar, catalogo, ed.kits])

  async function guardar() {
    if (!ed.nombre.trim()) return toast.error('El tipo necesita un nombre')
    const kits = ed.kits.map((k) => ({ kit_codigo: k.kit_codigo, cantidad: Number(k.cantidad) }))
    if (kits.length === 0 || kits.some((k) => !(k.cantidad > 0))) return toast.error('Cada kit necesita una cantidad mayor que 0')
    setGuardando(true)
    try {
      const id = await guardarTipoVivienda({ id: ed.id, nombre: ed.nombre.trim(), descripcion: ed.descripcion.trim() || null, activo: ed.activo, kits })
      toast.success('Tipo de vivienda guardado')
      setElegido(id)
      onGuardado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tipos de vivienda</DialogTitle>
          <DialogDescription>Cada tipo es el conjunto de kits (bultos) de SAP que lleva una vivienda. Sus recetas de SAP dan la materia prima y los materiales.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-1">
            {tipos.map((t) => (
              <button
                key={t.id}
                onClick={() => elegir(t.id)}
                className={cn(
                  'block w-full rounded-md border px-3 py-2 text-left text-sm',
                  elegido === t.id ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-accent',
                  !t.activo && 'opacity-60',
                )}
              >
                <span className="font-semibold">{t.nombre}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t.kits.length} kits{!t.activo && ' · inactivo'}
                </span>
              </button>
            ))}
            <Button size="sm" variant="outline" className="w-full" onClick={() => elegir('nuevo')}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo tipo
            </Button>
          </div>

          {elegido != null && (
            <div className="min-w-0 space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={ed.nombre} onChange={(e) => setEd((x) => ({ ...x, nombre: e.target.value }))} placeholder="Nombre del tipo" aria-label="Nombre del tipo" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-[hsl(var(--brand))]" checked={ed.activo} onChange={(e) => setEd((x) => ({ ...x, activo: e.target.checked }))} />
                  Activo
                </label>
              </div>
              <Input value={ed.descripcion} onChange={(e) => setEd((x) => ({ ...x, descripcion: e.target.value }))} placeholder="Descripción (opcional)" aria-label="Descripción" />

              <div className="rounded-md border">
                {ed.kits.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Agrega los kits que lleva una vivienda de este tipo.</p>
                ) : (
                  ed.kits.map((k, i) => {
                    const sinReceta = catalogo.length > 0 && !catalogo.some((c) => c.codigo === k.kit_codigo)
                    return (
                      <div key={k.kit_codigo} className="flex items-center gap-2 border-b px-2 py-1.5 last:border-0">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm" title={k.kit_nombre ?? undefined}>
                            {k.kit_nombre ?? k.kit_codigo}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-muted-foreground">
                            {k.kit_codigo}
                            {sinReceta && <span className="text-warning"> · sin receta en SAP: no aporta materiales</span>}
                          </span>
                        </span>
                        <Input
                          inputMode="decimal"
                          value={k.cantidad}
                          onChange={(e) =>
                            setEd((x) => ({ ...x, kits: x.kits.map((y, j) => (j === i ? { ...y, cantidad: e.target.value.replace(',', '.') } : y)) }))
                          }
                          className="h-8 w-20 text-right font-mono-tabular"
                          aria-label={`Cantidad de ${k.kit_codigo} por vivienda`}
                        />
                        <span className="text-xs text-muted-foreground">por viv.</span>
                        <button
                          onClick={() => setEd((x) => ({ ...x, kits: x.kits.filter((_, j) => j !== i) }))}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          aria-label={`Quitar ${k.kit_codigo}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="relative">
                <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Agregar kit: busca por código o nombre" aria-label="Buscar kit" />
                {opciones.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {opciones.map((c) => (
                      <button
                        key={c.codigo}
                        type="button"
                        onClick={() => {
                          setEd((x) => ({ ...x, kits: [...x.kits, { kit_codigo: c.codigo, kit_nombre: c.nombre, cantidad: '1' }] }))
                          setBuscar('')
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        {c.nombre ?? c.codigo} <span className="font-mono-tabular text-[11px] text-muted-foreground">{c.codigo}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
          {elegido != null && (
            <Button disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar tipo'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import ProductoAutocomplete from './ProductoAutocomplete'
import type { Producto } from '../hooks/useCatalogoGD'
import { SECCIONES, seccionLabel, type Seccion, type StockItem } from '../hooks/useIngresoStock'

function AlcanceHint({ stock, qty }: { stock: number; qty: number | null }) {
  if (qty == null || qty <= 0 || isNaN(stock)) return null
  const alc = stock / qty
  const color = alc < 5 ? 'text-destructive' : alc < 15 ? 'text-warning' : 'text-success'
  return <p className={`text-xs ${color}`}>Alcance estimado: {alc.toLocaleString('es-CL', { maximumFractionDigits: 2 })} módulos</p>
}

interface Linea {
  busqueda: string
  seleccionado: Producto | null
  stockFisico: string
}

const lineaVacia = (): Linea => ({ busqueda: '', seleccionado: null, stockFisico: '' })

interface Props {
  item?: StockItem
  productos: Producto[]
  seccionInicial?: Seccion
  onAgregar?: (seccion: Seccion, lineas: { producto: Producto; stockFisico: number }[]) => void | Promise<void>
  onEditar?: (stockFisico: number) => void | Promise<void>
}

export default function FormularioStockItem({ item, productos, seccionInicial, onAgregar, onEditar }: Props) {
  const esEdicion = !!item
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [seccion, setSeccion] = useState<Seccion>(seccionInicial ?? 'GALPON')
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [focusIdx, setFocusIdx] = useState(-1)
  const [stockFisico, setStockFisico] = useState(item ? String(item.stockFisico) : '')

  function limpiar() {
    setSeccion(seccionInicial ?? 'GALPON')
    setLineas([lineaVacia()])
    setFocusIdx(-1)
    setStockFisico('')
  }

  function nuevaLinea() {
    setLineas((prev) => {
      setFocusIdx(prev.length)
      return [...prev, lineaVacia()]
    })
  }

  // Digitacion continua: codigo -> Tab -> cantidad -> Tab -> codigo de la linea siguiente, sin mouse
  function onTabDesdeCantidad(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key !== 'Tab' || e.shiftKey) return
    if (idx !== lineas.length - 1) return
    if (!lineas[idx].seleccionado) return
    e.preventDefault()
    nuevaLinea()
  }

  function setLinea(idx: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function onSubmitEdicion(e: FormEvent) {
    e.preventDefault()
    const stockVal = parseFloat(stockFisico)
    if (isNaN(stockVal) || stockVal < 0) {
      toast.error('Ingresa un stock válido (≥ 0)')
      return
    }
    setEnviando(true)
    try {
      await onEditar!(stockVal)
      toast.success('Stock actualizado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function onSubmitAlta(e: FormEvent) {
    e.preventDefault()
    // Ignora lineas totalmente vacias: permite dejar filas de sobra sin bloquear el guardado
    const usadas = lineas.filter((l) => l.seleccionado || l.stockFisico.trim())
    if (!usadas.length) {
      toast.error('Agrega al menos un material')
      return
    }
    const validas: { producto: Producto; stockFisico: number }[] = []
    for (const l of usadas) {
      if (!l.seleccionado) {
        toast.error('Hay una línea sin material del catálogo')
        return
      }
      const v = parseFloat(l.stockFisico)
      if (isNaN(v) || v < 0) {
        toast.error(`Stock inválido en ${l.seleccionado.codigo}`)
        return
      }
      validas.push({ producto: l.seleccionado, stockFisico: v })
    }
    const dup = validas.map((v) => v.producto.codigo.trim().toUpperCase())
    if (new Set(dup).size !== dup.length) {
      toast.error('Hay códigos repetidos en la misma sección')
      return
    }
    setEnviando(true)
    try {
      await onAgregar!(seccion, validas)
      toast.success(`${validas.length} material(es) agregados a ${seccionLabel(seccion)}`)
      limpiar()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v && !esEdicion) limpiar()
        if (v && esEdicion) setStockFisico(String(item!.stockFisico))
      }}
    >
      <DialogTrigger asChild>
        {esEdicion ? (
          <Button variant="ghost" size="icon" title="Editar stock">✏️</Button>
        ) : (
          <Button>+ Agregar material</Button>
        )}
      </DialogTrigger>
      <DialogContent className={esEdicion ? undefined : 'max-h-[85vh] overflow-y-auto sm:max-w-4xl'}>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar stock' : 'Agregar materiales'}</DialogTitle>
        </DialogHeader>

        {esEdicion ? (
          <form onSubmit={onSubmitEdicion} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>Material</Label>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                <div className="text-[10px] uppercase text-muted-foreground">{seccionLabel(item!.seccion)}</div>
                {item!.codigo} — {item!.material} ({item!.unidad})
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-fisico">Stock físico</Label>
              <Input
                id="stock-fisico"
                type="number"
                min="0"
                step="any"
                value={stockFisico}
                onChange={(e) => setStockFisico(e.target.value)}
                required
                autoFocus
              />
              <AlcanceHint stock={parseFloat(stockFisico)} qty={item!.qty} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={onSubmitAlta} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>Sección</Label>
              <Select value={seccion} onValueChange={(v) => setSeccion(v as Seccion)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECCIONES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_9rem_2rem] gap-2 text-[10px] uppercase text-muted-foreground">
                <span>Material</span>
                <span>Stock físico</span>
                <span />
              </div>
              <div className="space-y-2">
                {lineas.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_9rem_2rem] items-start gap-2">
                    <div className="min-w-0">
                      <ProductoAutocomplete
                        value={l.busqueda}
                        productos={productos}
                        onChange={(v) => setLinea(idx, { busqueda: v, seleccionado: null })}
                        onSelect={(p) => setLinea(idx, { seleccionado: p, busqueda: p.codigo })}
                        placeholder="Buscar por código o nombre…"
                        autoFocus={idx === focusIdx}
                      />
                      {l.seleccionado && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={l.seleccionado.descripcion}>
                          {l.seleccionado.descripcion} ({l.seleccionado.unidad})
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={l.stockFisico}
                        onChange={(e) => setLinea(idx, { stockFisico: e.target.value })}
                        onKeyDown={(e) => onTabDesdeCantidad(e, idx)}
                        placeholder="0"
                      />
                      <AlcanceHint stock={parseFloat(l.stockFisico)} qty={l.seleccionado?.cantidad_por_modulo ?? null} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      tabIndex={-1}
                      title="Quitar línea"
                      disabled={lineas.length === 1}
                      onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={nuevaLinea}>
                + Otra línea
              </Button>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Agregar todos'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

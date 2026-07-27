import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import ProductoAutocomplete from './ProductoAutocomplete'
import type { Producto } from '../hooks/useCatalogoGD'
import type { StockItem } from '../hooks/useIngresoStock'

function AlcanceHint({ stock, qty }: { stock: number; qty: number | null }) {
  if (qty == null || qty <= 0 || isNaN(stock)) return null
  const alc = stock / qty
  const color = alc < 5 ? 'text-destructive' : alc < 15 ? 'text-warning' : 'text-success'
  return <p className={`text-xs ${color}`}>Alcance estimado: {alc.toLocaleString('es-CL', { maximumFractionDigits: 2 })} módulos</p>
}

interface Props {
  item?: StockItem
  productosDisponibles: Producto[]
  onGuardar: (input: { producto: Producto | null; stockFisico: number }) => void | Promise<void>
}

export default function FormularioStockItem({ item, productosDisponibles, onGuardar }: Props) {
  const esEdicion = !!item
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null)
  const [stockFisico, setStockFisico] = useState(item ? String(item.stockFisico) : '')

  function limpiar() {
    setBusqueda('')
    setSeleccionado(null)
    setStockFisico('')
  }

  const qty = esEdicion ? item!.qty : (seleccionado?.cantidad_por_modulo ?? null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const stockVal = parseFloat(stockFisico)
    if (isNaN(stockVal) || stockVal < 0) {
      toast.error('Ingresa un stock válido (≥ 0)')
      return
    }
    if (!esEdicion && !seleccionado) {
      toast.error('Selecciona un material del catálogo')
      return
    }
    setEnviando(true)
    try {
      await onGuardar({ producto: seleccionado, stockFisico: stockVal })
      toast.success(esEdicion ? 'Stock actualizado' : `${seleccionado?.descripcion} agregado`)
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar stock' : 'Agregar material'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {esEdicion ? (
            <div className="flex flex-col gap-1.5">
              <Label>Material</Label>
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                {item!.codigo} — {item!.material} ({item!.unidad})
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Material</Label>
              <ProductoAutocomplete
                value={busqueda}
                productos={productosDisponibles}
                onChange={setBusqueda}
                onSelect={(p) => {
                  setSeleccionado(p)
                  setBusqueda(p.codigo)
                }}
                placeholder="Buscar por código o nombre…"
              />
            </div>
          )}
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
              autoFocus={esEdicion}
            />
            <AlcanceHint stock={parseFloat(stockFisico)} qty={qty} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : esEdicion ? 'Guardar' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

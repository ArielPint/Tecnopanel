import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import type { NuevaOC, OrdenCompra } from '../hooks/useOrdenesCompra'

interface Props {
  oc?: OrdenCompra
  gdsIniciales?: string[]
  montoPorGD?: Record<string, number>
  onGuardar: (input: NuevaOC, id: string | null) => Promise<void>
  onEliminar?: (id: string) => Promise<void>
}

export default function FormularioOC({ oc, gdsIniciales, montoPorGD, onGuardar, onEliminar }: Props) {
  const esEdicion = !!oc
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [numero, setNumero] = useState(oc?.numero ?? '')
  const [proveedor, setProveedor] = useState(oc?.proveedor ?? '')
  const [fecha, setFecha] = useState(oc?.fecha ?? '')
  const [notas, setNotas] = useState(oc?.notas ?? '')
  const [gds, setGds] = useState<string[]>(gdsIniciales ?? [])
  const [gdInput, setGdInput] = useState('')

  // ponytail: suma en vivo desde los chips actuales, no desde el monto guardado
  const monto = montoPorGD ? gds.reduce((s, gd) => s + (montoPorGD[gd] || 0), 0) : null
  const gdsSinRegistro = montoPorGD ? gds.filter((gd) => montoPorGD[gd] == null) : []

  function limpiar() {
    setNumero('')
    setProveedor('')
    setFecha('')
    setNotas('')
    setGds([])
    setGdInput('')
  }

  function addGD() {
    const v = gdInput.trim()
    if (!v) return
    if (!gds.includes(v)) setGds((g) => [...g, v])
    setGdInput('')
  }

  function onGdKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addGD()
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!numero.trim()) {
      toast.error('Ingresa N° OC')
      return
    }
    setEnviando(true)
    try {
      await onGuardar({ numero: numero.trim(), proveedor: proveedor.trim(), fecha: fecha || null, notas: notas.trim(), gds }, oc?.id ?? null)
      toast.success(esEdicion ? 'OC actualizada' : 'OC guardada')
      if (!esEdicion) limpiar()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function onDelete() {
    if (!oc || !onEliminar) return
    if (!confirm('¿Eliminar esta OC y sus asociaciones?')) return
    setEnviando(true)
    try {
      await onEliminar(oc.id)
      toast.success('OC eliminada')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
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
      }}
    >
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : '+ Nueva OC'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar OC' : 'Nueva OC'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="oc-numero">N° OC</Label>
            <Input id="oc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="oc-fecha">Fecha</Label>
            <Input id="oc-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="oc-proveedor">Proveedor</Label>
            <Input id="oc-proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="oc-notas">Notas</Label>
            <Textarea id="oc-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="oc-gd">GDs asociadas</Label>
            <div className="flex gap-2">
              <Input id="oc-gd" placeholder="N° de GD…" value={gdInput} onChange={(e) => setGdInput(e.target.value)} onKeyDown={onGdKeyDown} />
              <Button type="button" variant="outline" onClick={addGD}>+ Agregar</Button>
            </div>
            {gds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {gds.map((gd) => {
                  const sinRegistro = montoPorGD != null && montoPorGD[gd] == null
                  return (
                  <span
                    key={gd}
                    title={sinRegistro ? 'Sin registro de compras: no suma monto' : undefined}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${sinRegistro ? 'border-destructive bg-destructive/10 text-destructive' : 'bg-muted'}`}
                  >
                    {gd}
                    <button type="button" onClick={() => setGds((g) => g.filter((x) => x !== gd))}>
                      <X className="size-3" />
                    </button>
                  </span>
                  )
                })}
              </div>
            )}
            {gdsSinRegistro.length > 0 && (
              <p className="text-xs text-destructive">Sin registro de compras (no suman monto): {gdsSinRegistro.join(', ')}</p>
            )}
          </div>
          {monto != null && (
            <p className="col-span-2 text-xs text-muted-foreground">Monto calculado desde las GDs asociadas: <span className="font-semibold text-success">{formatCLP(monto)}</span></p>
          )}

          <DialogFooter className="col-span-2">
            {esEdicion && onEliminar && (
              <Button type="button" variant="destructive" disabled={enviando} onClick={onDelete}>
                Eliminar
              </Button>
            )}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

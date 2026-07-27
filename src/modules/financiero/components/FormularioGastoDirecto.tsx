import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/financiero/components/ui/dialog'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import BuscadorProveedor from '@/modules/financiero/components/BuscadorProveedor'
import { MESES } from '@/modules/financiero/utils/formatters'
import type { GastoDirecto } from '@/modules/financiero/types/financiero'

interface FormularioGastoDirectoProps {
  registroExistente?: GastoDirecto
  onUpsert: (input: {
    id?: string
    presupuesto_id: string
    mes: number
    anio: number
    monto: number
    observacion: string | null
    proveedor_rut: string | null
  }) => Promise<GastoDirecto>
}

export default function FormularioGastoDirecto({ registroExistente, onUpsert }: FormularioGastoDirectoProps) {
  const { presupuestos } = usePresupuestosLookup()
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!registroExistente

  const [presupuestoId, setPresupuestoId] = useState(registroExistente?.presupuesto_id ?? '')
  const [mes, setMes] = useState(String(registroExistente?.mes ?? new Date().getMonth() + 1))
  const [anio, setAnio] = useState(String(registroExistente?.anio ?? new Date().getFullYear()))
  const [monto, setMonto] = useState(String(registroExistente?.monto ?? ''))
  const [observacion, setObservacion] = useState(registroExistente?.observacion ?? '')
  const [proveedorRut, setProveedorRut] = useState(registroExistente?.proveedor_rut ?? '')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!presupuestoId) return
    setEnviando(true)
    try {
      await onUpsert({
        id: registroExistente?.id,
        presupuesto_id: presupuestoId,
        mes: Number(mes),
        anio: Number(anio),
        monto: Number(monto),
        observacion: observacion.trim() || null,
        proveedor_rut: proveedorRut.trim() || null,
      })
      toast.success('Gasto guardado')
      if (!esEdicion) {
        setPresupuestoId('')
        setMonto('')
        setObservacion('')
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el gasto')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : 'Agregar gasto'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar gasto directo' : 'Agregar gasto directo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Código WIP</Label>
            <Select value={presupuestoId} onValueChange={setPresupuestoId} disabled={esEdicion}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí una partida" />
              </SelectTrigger>
              <SelectContent>
                {presupuestos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.tarea_wip ? `${p.tarea_wip} — ${p.nombre}` : p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Mes</Label>
            <Select value={mes} onValueChange={setMes} disabled={esEdicion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, i) => (
                  <SelectItem key={nombre} value={String(i + 1)}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anio">Año</Label>
            <Input id="anio" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} disabled={esEdicion} required />
          </div>
          <BuscadorProveedor rut={proveedorRut} onRutChange={setProveedorRut} onResolved={() => {}} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto (CLP)</Label>
            <Input id="monto" type="number" min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacion">Observación (opcional)</Label>
            <Textarea id="observacion" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enviando || !presupuestoId}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

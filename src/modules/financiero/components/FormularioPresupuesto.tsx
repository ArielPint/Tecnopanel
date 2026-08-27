import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/financiero/components/ui/dialog'
import type { Presupuesto } from '@/modules/financiero/types/financiero'

interface FormularioPresupuestoProps {
  presupuesto?: Presupuesto
  onCreate: (input: {
    codigo_articulo: string
    nombre: string
    tarea_wip: string | null
    presupuesto_original: number
    valor_servicio: number | null
  }) => Promise<Presupuesto>
  onUpdate: (id: string, patch: Partial<Presupuesto>) => Promise<Presupuesto>
}

export default function FormularioPresupuesto({ presupuesto, onCreate, onUpdate }: FormularioPresupuestoProps) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!presupuesto

  const [codigoArticulo, setCodigoArticulo] = useState(presupuesto?.codigo_articulo ?? '')
  const [nombre, setNombre] = useState(presupuesto?.nombre ?? '')
  const [tareaWip, setTareaWip] = useState(presupuesto?.tarea_wip ?? '')
  const [presupuestoOriginal, setPresupuestoOriginal] = useState(String(presupuesto?.presupuesto_original ?? ''))
  const [valorServicio, setValorServicio] = useState(String(presupuesto?.valor_servicio ?? ''))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    try {
      const payload = {
        codigo_articulo: codigoArticulo,
        nombre,
        tarea_wip: tareaWip || null,
        presupuesto_original: Number(presupuestoOriginal),
        valor_servicio: valorServicio ? Number(valorServicio) : null,
      }
      if (esEdicion && presupuesto) {
        await onUpdate(presupuesto.id, payload)
        toast.success('Presupuesto actualizado')
      } else {
        await onCreate(payload)
        toast.success('Presupuesto creado')
        setCodigoArticulo('')
        setNombre('')
        setTareaWip('')
        setPresupuestoOriginal('')
        setValorServicio('')
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el presupuesto')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : 'Nuevo Presupuesto'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo_articulo">Código artículo</Label>
            <Input
              id="codigo_articulo"
              value={codigoArticulo}
              onChange={(e) => setCodigoArticulo(e.target.value)}
              required
              disabled={esEdicion}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tarea_wip">Tarea WIP</Label>
            <Input id="tarea_wip" value={tareaWip ?? ''} onChange={(e) => setTareaWip(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="presupuesto_original">Presupuesto original (CLP)</Label>
            <Input
              id="presupuesto_original"
              type="number"
              thousands
              min="0"
              step="1"
              value={presupuestoOriginal}
              onChange={(e) => setPresupuestoOriginal(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="valor_servicio">Valor servicio (CLP, opcional)</Label>
            <Input
              id="valor_servicio"
              type="number"
              thousands
              min="0"
              step="1"
              value={valorServicio}
              onChange={(e) => setValorServicio(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

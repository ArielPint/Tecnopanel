import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { Producto } from '../hooks/useCatalogoGD'

interface Props {
  producto?: Producto
  existentes: Producto[]
  onGuardar: (input: Producto) => Promise<void>
}

export default function FormularioProductoGD({ producto, existentes, onGuardar }: Props) {
  const esEdicion = !!producto
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [codigo, setCodigo] = useState(producto?.codigo ?? '')
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [unidad, setUnidad] = useState(producto?.unidad ?? 'UND')
  const [grupo, setGrupo] = useState(producto?.grupo ?? '')
  const [subgrupo, setSubgrupo] = useState(producto?.subgrupo ?? '')
  const [cantidadPorModulo, setCantidadPorModulo] = useState(producto?.cantidad_por_modulo != null ? String(producto.cantidad_por_modulo) : '')
  const [ppto, setPpto] = useState(producto?.ppto != null ? String(producto.ppto) : '')

  function limpiar() {
    setCodigo('')
    setDescripcion('')
    setUnidad('UND')
    setGrupo('')
    setSubgrupo('')
    setCantidadPorModulo('')
    setPpto('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!codigo.trim() || !descripcion.trim()) {
      toast.error('Código y descripción son obligatorios')
      return
    }
    if (!esEdicion && existentes.some((p) => p.codigo.toUpperCase() === codigo.trim().toUpperCase())) {
      toast.error('Ya existe un producto con ese código')
      return
    }
    setEnviando(true)
    try {
      await onGuardar({
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
        unidad,
        grupo,
        subgrupo: subgrupo.trim(),
        cantidad_por_modulo: cantidadPorModulo !== '' ? parseFloat(cantidadPorModulo) : null,
        ppto: ppto !== '' ? parseFloat(ppto) : null,
      })
      toast.success(esEdicion ? 'Producto actualizado' : 'Producto agregado')
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
      }}
    >
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : '+ Nuevo producto'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo">Código</Label>
            <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={esEdicion} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unidad">Unidad</Label>
            <Input id="unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grupo">Grupo</Label>
            <Input id="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subgrupo">Subgrupo</Label>
            <Input id="subgrupo" value={subgrupo} onChange={(e) => setSubgrupo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cpm">Cant/Módulo</Label>
            <Input id="cpm" type="number" step="any" value={cantidadPorModulo} onChange={(e) => setCantidadPorModulo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ppto">Presupuesto ($)</Label>
            <Input id="ppto" type="number" step="any" value={ppto} onChange={(e) => setPpto(e.target.value)} />
          </div>

          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

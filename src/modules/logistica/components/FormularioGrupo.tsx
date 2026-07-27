import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { Grupo } from '../hooks/useResponsables'

interface Props {
  grupo?: Grupo
  onGuardar: (nombre: string) => Promise<void>
  trigger?: ReactNode
}

export default function FormularioGrupo({ grupo, onGuardar, trigger }: Props) {
  const esEdicion = !!grupo
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setEnviando(true)
    try {
      await onGuardar(nombre.trim())
      toast.success(esEdicion ? 'Grupo actualizado' : 'Grupo creado')
      if (!esEdicion) setNombre('')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>+ Nuevo grupo</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar grupo' : 'Nuevo grupo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre-grupo">Nombre</Label>
            <Input id="nombre-grupo" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
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

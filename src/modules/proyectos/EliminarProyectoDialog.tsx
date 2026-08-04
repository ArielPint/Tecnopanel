import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { useEliminarProyecto } from './useEliminarProyecto'

interface Props {
  proyecto: { id: string; nombre: string }
  onEliminado: () => void
}

export default function EliminarProyectoDialog({ proyecto, onEliminado }: Props) {
  const [open, setOpen] = useState(false)
  const [paso, setPaso] = useState<1 | 2>(1)
  const [confirmacion, setConfirmacion] = useState('')
  const { eliminar, eliminando } = useEliminarProyecto()

  function cerrar(v: boolean) {
    setOpen(v)
    if (!v) {
      setPaso(1)
      setConfirmacion('')
    }
  }

  async function confirmarEliminacion() {
    try {
      await eliminar(proyecto.id)
      toast.success(`Proyecto "${proyecto.nombre}" eliminado`)
      cerrar(false)
      onEliminado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="Eliminar proyecto">
          <Trash2 size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar proyecto</DialogTitle>
        </DialogHeader>
        {paso === 1 ? (
          <>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar el proyecto <span className="font-bold text-foreground">&quot;{proyecto.nombre}&quot;</span>? Esta acción no se
              puede deshacer.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrar(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => setPaso(2)}>
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmar-nombre">
                Para confirmar, escribe el nombre exacto del proyecto: <span className="font-bold text-foreground">{proyecto.nombre}</span>
              </Label>
              <Input
                id="confirmar-nombre"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrar(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={confirmacion !== proyecto.nombre || eliminando}
                onClick={confirmarEliminacion}
              >
                {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

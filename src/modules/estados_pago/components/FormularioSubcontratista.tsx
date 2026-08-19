import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { Subcontratista } from '../types'

interface Props {
  subcontratista?: Subcontratista
  trigger: React.ReactNode
  onCrear: (input: Omit<Subcontratista, 'id' | 'created_at'>) => Promise<Subcontratista>
  onActualizar: (id: string, patch: Partial<Omit<Subcontratista, 'id' | 'created_at'>>) => Promise<void>
}

export default function FormularioSubcontratista({ subcontratista, trigger, onCrear, onActualizar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!subcontratista

  const [nombre, setNombre] = useState(subcontratista?.nombre ?? '')
  const [rut, setRut] = useState(subcontratista?.rut ?? '')
  const [giro, setGiro] = useState(subcontratista?.giro ?? '')
  const [telefono, setTelefono] = useState(subcontratista?.telefono ?? '')
  const [email, setEmail] = useState(subcontratista?.email ?? '')
  const [direccion, setDireccion] = useState(subcontratista?.direccion ?? '')
  const [notas, setNotas] = useState(subcontratista?.notas ?? '')
  const [activo, setActivo] = useState(subcontratista?.activo ?? true)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setEnviando(true)
    try {
      const input = {
        nombre: nombre.trim(),
        rut: rut || null,
        giro: giro || null,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null,
        notas: notas || null,
        activo,
      }
      if (esEdicion) await onActualizar(subcontratista.id, input)
      else await onCrear(input)
      toast.success(esEdicion ? 'Subcontratista actualizado' : 'Subcontratista creado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar subcontratista' : 'Nuevo subcontratista'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sc-nombre">Nombre / Razón social</Label>
            <Input id="sc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sc-rut">RUT</Label>
              <Input id="sc-rut" value={rut ?? ''} onChange={(e) => setRut(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sc-giro">Giro</Label>
              <Input id="sc-giro" value={giro ?? ''} onChange={(e) => setGiro(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sc-telefono">Teléfono</Label>
              <Input id="sc-telefono" value={telefono ?? ''} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sc-email">Email</Label>
              <Input id="sc-email" type="email" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sc-direccion">Dirección</Label>
            <Input id="sc-direccion" value={direccion ?? ''} onChange={(e) => setDireccion(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sc-notas">Notas</Label>
            <Textarea id="sc-notas" value={notas ?? ''} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={activo} onCheckedChange={(v) => setActivo(!!v)} />
            Activo
          </label>
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

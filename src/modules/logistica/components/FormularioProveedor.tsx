import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { Proveedor, ProveedorInput } from '../hooks/useProveedores'

interface Props {
  onGuardar: (input: ProveedorInput) => Promise<Proveedor>
  onCreado?: (proveedor: Proveedor) => void
}

const VACIO = { nombre: '', rut: '', giro: '', telefono: '', email: '', direccion: '', notas: '' }

export default function FormularioProveedor({ onGuardar, onCreado }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState(VACIO)

  function set<K extends keyof typeof VACIO>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setEnviando(true)
    try {
      const creado = await onGuardar({
        nombre: form.nombre.trim(),
        rut: form.rut.trim() || null,
        giro: form.giro.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        notas: form.notas.trim() || null,
      })
      toast.success('Proveedor guardado')
      onCreado?.(creado)
      setForm(VACIO)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(VACIO) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          + Nuevo proveedor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar proveedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="prov-nombre">Nombre / Razón social</Label>
            <Input id="prov-nombre" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} autoFocus required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prov-rut">RUT</Label>
            <Input id="prov-rut" value={form.rut} onChange={(e) => set('rut', e.target.value)} placeholder="76.123.456-7" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prov-giro">Giro / Rubro</Label>
            <Input id="prov-giro" value={form.giro} onChange={(e) => set('giro', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prov-telefono">Teléfono</Label>
            <Input id="prov-telefono" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prov-email">Email</Label>
            <Input id="prov-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="prov-direccion">Dirección</Label>
            <Input id="prov-direccion" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="prov-notas">Notas</Label>
            <Textarea id="prov-notas" rows={2} value={form.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Condiciones, descuentos, tiempo de entrega…" />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar proveedor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

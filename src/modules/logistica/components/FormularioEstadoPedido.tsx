import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { EstadoPedido } from '../hooks/usePedidos'

const ESTADOS: { value: EstadoPedido; label: string }[] = [
  { value: 'borrador', label: '📝 Borrador' },
  { value: 'enviado', label: '📤 Enviado' },
  { value: 'aprobado', label: '✅ Aprobado' },
  { value: 'en_camino', label: '🚚 En camino' },
  { value: 'recibido', label: '📦 Recibido' },
  { value: 'cancelado', label: '❌ Cancelado' },
]

interface Props {
  estadoActual: EstadoPedido
  onGuardar: (estado: EstadoPedido, nota: string | null) => Promise<void>
}

export default function FormularioEstadoPedido({ estadoActual, onGuardar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [estado, setEstado] = useState<EstadoPedido>(estadoActual)
  const [nota, setNota] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      await onGuardar(estado, nota.trim() || null)
      toast.success('Estado actualizado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          setEstado(estadoActual)
          setNota('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          ✏ Estado
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Actualizar estado del pedido</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoPedido)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estado-nota">Nota (opcional)</Label>
            <Textarea id="estado-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Recibido conforme el 19/06/2026…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

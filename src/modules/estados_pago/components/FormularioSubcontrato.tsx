import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { useResponsables } from '@/modules/logistica/hooks/useResponsables'
import type { Subcontratista, Subcontrato } from '../types'

type SubcontratoInput = Pick<
  Subcontrato,
  'subcontratista_id' | 'especialidad' | 'responsable_interno_id' | 'monto_contractual' | 'documentacion_path' | 'estado'
>

interface Props {
  subcontrato?: Subcontrato
  subcontratistas: Subcontratista[]
  trigger: React.ReactNode
  onCrear: (input: SubcontratoInput) => Promise<Subcontrato>
  onActualizar: (id: string, patch: Partial<SubcontratoInput>) => Promise<void>
}

export default function FormularioSubcontrato({ subcontrato, subcontratistas, trigger, onCrear, onActualizar }: Props) {
  const { responsables } = useResponsables()
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!subcontrato

  const [subcontratistaId, setSubcontratistaId] = useState(subcontrato?.subcontratista_id ?? '')
  const [especialidad, setEspecialidad] = useState(subcontrato?.especialidad ?? '')
  const [responsableId, setResponsableId] = useState(subcontrato?.responsable_interno_id?.toString() ?? '')
  const [montoContractual, setMontoContractual] = useState(String(subcontrato?.monto_contractual ?? ''))
  const [estado, setEstado] = useState(subcontrato?.estado ?? 'activo')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subcontratistaId) {
      toast.error('Elegí el subcontratista')
      return
    }
    if (!especialidad.trim()) {
      toast.error('La especialidad/partida es requerida')
      return
    }
    setEnviando(true)
    try {
      const input: SubcontratoInput = {
        subcontratista_id: subcontratistaId,
        especialidad: especialidad.trim(),
        responsable_interno_id: responsableId ? Number(responsableId) : null,
        monto_contractual: Number(montoContractual) || 0,
        documentacion_path: subcontrato?.documentacion_path ?? null,
        estado,
      }
      if (esEdicion) await onActualizar(subcontrato.id, input)
      else await onCrear(input)
      toast.success(esEdicion ? 'Subcontrato actualizado' : 'Subcontrato creado')
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
          <DialogTitle>{esEdicion ? 'Editar subcontrato' : 'Nuevo subcontrato'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Subcontratista</Label>
            <Select value={subcontratistaId || undefined} onValueChange={setSubcontratistaId}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un subcontratista" />
              </SelectTrigger>
              <SelectContent>
                {subcontratistas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-especialidad">Especialidad / Partida</Label>
            <Input
              id="sub-especialidad"
              value={especialidad}
              onChange={(e) => setEspecialidad(e.target.value)}
              placeholder="Ej: Estructura metálica, Instalaciones eléctricas…"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Responsable interno</Label>
            <Select value={responsableId || undefined} onValueChange={setResponsableId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin responsable asignado" />
              </SelectTrigger>
              <SelectContent>
                {responsables.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-monto">Monto contractual (CLP)</Label>
            <Input
              id="sub-monto"
              type="number"
              thousands
              min="0"
              step="1"
              value={montoContractual}
              onChange={(e) => setMontoContractual(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="cerrado">Cerrado</SelectItem>
              </SelectContent>
            </Select>
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

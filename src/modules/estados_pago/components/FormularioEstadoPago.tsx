import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import type { EstadoPago, Subcontrato } from '../types'

type EstadoPagoInput = Pick<
  EstadoPago,
  'subcontrato_id' | 'numero_ep' | 'periodo' | 'fecha_emision' | 'fecha_recepcion' | 'monto_bruto' | 'descuentos' | 'retenciones' | 'monto_neto' | 'observaciones' | 'documento_principal_path'
>

interface Props {
  estadoPago?: EstadoPago
  subcontratos: Subcontrato[]
  trigger: React.ReactNode
  onCrear: (input: EstadoPagoInput) => Promise<EstadoPago>
  onActualizar: (id: string, patch: Partial<EstadoPagoInput>) => Promise<void>
}

// Guarda la lista de módulos/especialidades/partidas cubiertos por el EP —
// mismo patrón "reemplazar todo" que syncPermisos.ts (delete + insert).
async function reemplazarModulos(estadoPagoId: string, descripciones: string[]) {
  const { error: delErr } = await supabase.from('estados_pago_modulos').delete().eq('estado_pago_id', estadoPagoId)
  if (delErr) throw new Error(delErr.message)
  if (descripciones.length === 0) return
  const { error: insErr } = await supabase
    .from('estados_pago_modulos')
    .insert(descripciones.map((descripcion) => ({ estado_pago_id: estadoPagoId, descripcion })))
  if (insErr) throw new Error(insErr.message)
}

export default function FormularioEstadoPago({ estadoPago, subcontratos, trigger, onCrear, onActualizar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!estadoPago

  const [subcontratoId, setSubcontratoId] = useState(estadoPago?.subcontrato_id ?? '')
  const [numeroEp, setNumeroEp] = useState(estadoPago?.numero_ep ?? '')
  const [periodo, setPeriodo] = useState(estadoPago?.periodo ?? '')
  const [fechaEmision, setFechaEmision] = useState(estadoPago?.fecha_emision ?? new Date().toISOString().slice(0, 10))
  const [fechaRecepcion, setFechaRecepcion] = useState(estadoPago?.fecha_recepcion ?? '')
  const [montoBruto, setMontoBruto] = useState(String(estadoPago?.monto_bruto ?? ''))
  const [descuentos, setDescuentos] = useState(String(estadoPago?.descuentos ?? 0))
  const [retenciones, setRetenciones] = useState(String(estadoPago?.retenciones ?? 0))
  const [montoNeto, setMontoNeto] = useState(String(estadoPago?.monto_neto ?? ''))
  const [observaciones, setObservaciones] = useState(estadoPago?.observaciones ?? '')
  const [modulosTexto, setModulosTexto] = useState('')

  // Precarga los módulos/especialidades ya guardados al editar.
  useEffect(() => {
    if (!open || !estadoPago) return
    supabase
      .from('estados_pago_modulos')
      .select('descripcion')
      .eq('estado_pago_id', estadoPago.id)
      .then(({ data }) => setModulosTexto((data ?? []).map((m) => m.descripcion).join(', ')))
  }, [open, estadoPago])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subcontratoId) {
      toast.error('Elegí a qué subcontrato corresponde el EP')
      return
    }
    if (!numeroEp.trim()) {
      toast.error('El N° de EP es requerido')
      return
    }
    setEnviando(true)
    try {
      const input: EstadoPagoInput = {
        subcontrato_id: subcontratoId,
        numero_ep: numeroEp.trim(),
        periodo: periodo || null,
        fecha_emision: fechaEmision || null,
        fecha_recepcion: fechaRecepcion || null,
        monto_bruto: Number(montoBruto) || 0,
        descuentos: Number(descuentos) || 0,
        retenciones: Number(retenciones) || 0,
        monto_neto: Number(montoNeto) || 0,
        observaciones: observaciones || null,
        documento_principal_path: estadoPago?.documento_principal_path ?? null,
      }
      const descripciones = modulosTexto
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)

      let id = estadoPago?.id
      if (esEdicion && id) await onActualizar(id, input)
      else {
        const creado = await onCrear(input)
        id = creado.id
      }
      await reemplazarModulos(id!, descripciones)
      toast.success(esEdicion ? 'Estado de pago actualizado' : 'Estado de pago creado')
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
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar Estado de Pago' : 'Nuevo Estado de Pago'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Subcontrato</Label>
            <Select value={subcontratoId || undefined} onValueChange={setSubcontratoId}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí un subcontrato" />
              </SelectTrigger>
              <SelectContent>
                {subcontratos.map((sc) => (
                  <SelectItem key={sc.id} value={sc.id}>
                    {sc.especialidad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-numero">N° de EP</Label>
              <Input id="ep-numero" value={numeroEp} onChange={(e) => setNumeroEp(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-periodo">Período</Label>
              <Input id="ep-periodo" value={periodo ?? ''} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ej: Julio 2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-emision">Fecha de emisión</Label>
              <Input id="ep-emision" type="date" value={fechaEmision ?? ''} onChange={(e) => setFechaEmision(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-recepcion">Fecha de recepción</Label>
              <Input id="ep-recepcion" type="date" value={fechaRecepcion ?? ''} onChange={(e) => setFechaRecepcion(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-bruto">Monto bruto</Label>
              <Input id="ep-bruto" type="number" min="0" value={montoBruto} onChange={(e) => setMontoBruto(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-descuentos">Descuentos</Label>
              <Input id="ep-descuentos" type="number" min="0" value={descuentos} onChange={(e) => setDescuentos(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-retenciones">Retenciones</Label>
              <Input id="ep-retenciones" type="number" min="0" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep-neto">Monto neto</Label>
            <Input id="ep-neto" type="number" min="0" value={montoNeto} onChange={(e) => setMontoNeto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep-modulos">Módulos / especialidades / partidas cubiertos</Label>
            <Input
              id="ep-modulos"
              value={modulosTexto}
              onChange={(e) => setModulosTexto(e.target.value)}
              placeholder="Separados por coma"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep-obs">Observaciones</Label>
            <Textarea id="ep-obs" value={observaciones ?? ''} onChange={(e) => setObservaciones(e.target.value)} />
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

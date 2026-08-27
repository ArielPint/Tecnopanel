import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { documentoPath, subirDocumento } from '../services/storage'
import type { EstadoPago, Subcontrato } from '../types'

interface ItemInput {
  descripcion: string
  monto: string
}

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

// Guarda el detalle de ítems cobrados (concepto + monto) — mismo patrón
// "reemplazar todo" que syncPermisos.ts (delete + insert).
async function reemplazarItems(estadoPagoId: string, items: { descripcion: string; monto: number }[]) {
  const { error: delErr } = await supabase.from('estados_pago_modulos').delete().eq('estado_pago_id', estadoPagoId)
  if (delErr) throw new Error(delErr.message)
  if (items.length === 0) return
  const { error: insErr } = await supabase
    .from('estados_pago_modulos')
    .insert(items.map((it) => ({ estado_pago_id: estadoPagoId, descripcion: it.descripcion, monto: it.monto })))
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
  const [items, setItems] = useState<ItemInput[]>([{ descripcion: '', monto: '' }])
  const [archivos, setArchivos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Precarga el detalle de ítems ya guardado al editar.
  useEffect(() => {
    if (!open || !estadoPago) return
    supabase
      .from('estados_pago_modulos')
      .select('descripcion, monto')
      .eq('estado_pago_id', estadoPago.id)
      .then(({ data }) =>
        setItems(
          data && data.length > 0
            ? data.map((m) => ({ descripcion: m.descripcion, monto: String(m.monto) }))
            : [{ descripcion: '', monto: '' }],
        ),
      )
  }, [open, estadoPago])

  function actualizarItem(i: number, patch: Partial<ItemInput>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function agregarItem() {
    setItems((prev) => [...prev, { descripcion: '', monto: '' }])
  }

  function quitarItem(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  const totalItems = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0)

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
      const itemsValidos = items
        .map((it) => ({ descripcion: it.descripcion.trim(), monto: Number(it.monto) || 0 }))
        .filter((it) => it.descripcion)

      let id = estadoPago?.id
      if (esEdicion && id) await onActualizar(id, input)
      else {
        const creado = await onCrear(input)
        id = creado.id
      }
      await reemplazarItems(id!, itemsValidos)
      for (const file of archivos) {
        const path = documentoPath(id!, crypto.randomUUID(), file.name)
        await subirDocumento(file, path)
        const { error: docErr } = await supabase
          .from('estados_pago_documentos')
          .insert({ estado_pago_id: id, nombre: file.name, storage_path: path })
        if (docErr) throw new Error(docErr.message)
      }
      toast.success(esEdicion ? 'Estado de pago actualizado' : 'Estado de pago creado')
      setArchivos([])
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-numero">N° de EP</Label>
              <Input id="ep-numero" value={numeroEp} onChange={(e) => setNumeroEp(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-periodo">Período</Label>
              <Input id="ep-periodo" value={periodo ?? ''} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ej: Julio 2026" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-emision">Fecha de emisión</Label>
              <Input id="ep-emision" type="date" value={fechaEmision ?? ''} onChange={(e) => setFechaEmision(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-recepcion">Fecha de recepción</Label>
              <Input id="ep-recepcion" type="date" value={fechaRecepcion ?? ''} onChange={(e) => setFechaRecepcion(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-bruto">Monto bruto</Label>
              <Input id="ep-bruto" type="number" thousands min="0" value={montoBruto} onChange={(e) => setMontoBruto(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-descuentos">Descuentos</Label>
              <Input id="ep-descuentos" type="number" thousands min="0" value={descuentos} onChange={(e) => setDescuentos(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-retenciones">Retenciones</Label>
              <Input id="ep-retenciones" type="number" thousands min="0" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep-neto">Monto neto</Label>
            <Input id="ep-neto" type="number" thousands min="0" value={montoNeto} onChange={(e) => setMontoNeto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Detalle de lo cobrado</Label>
              <Button type="button" variant="outline" size="sm" onClick={agregarItem}>
                Agregar ítem
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={it.descripcion}
                  onChange={(e) => actualizarItem(i, { descripcion: e.target.value })}
                  placeholder="Concepto / partida"
                  className="flex-1"
                />
                <Input
                  type="number"
                  thousands
                  min="0"
                  value={it.monto}
                  onChange={(e) => actualizarItem(i, { monto: e.target.value })}
                  placeholder="Monto"
                  className="w-32"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => quitarItem(i)} disabled={items.length === 1}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {totalItems > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total ítems</span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{totalItems.toLocaleString('es-CL')}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMontoBruto(String(totalItems))}>
                    Usar como monto bruto
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep-obs">Observaciones</Label>
            <Textarea id="ep-obs" value={observaciones ?? ''} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Documentos (EP, factura, etc.)</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setArchivos((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Adjuntar
              </Button>
            </div>
            {archivos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {archivos.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                    {f.name}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setArchivos((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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

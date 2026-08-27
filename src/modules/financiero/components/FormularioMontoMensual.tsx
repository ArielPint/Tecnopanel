import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/financiero/components/ui/dialog'
import { MESES } from '@/modules/financiero/utils/formatters'
import type { MontoMensual } from '@/modules/financiero/types/financiero'

interface CategoriaOpcion {
  value: string
  label: string
}

interface FormularioMontoMensualProps {
  registroExistente?: MontoMensual
  tituloNuevo: string
  tituloEditar: string
  categorias?: CategoriaOpcion[]
  onUpsert: (input: {
    id?: string
    mes: number
    anio: number
    monto: number
    observacion: string | null
    categoria?: string
  }) => Promise<MontoMensual>
}

export default function FormularioMontoMensual({
  registroExistente,
  tituloNuevo,
  tituloEditar,
  categorias,
  onUpsert,
}: FormularioMontoMensualProps) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!registroExistente

  const [mes, setMes] = useState(String(registroExistente?.mes ?? new Date().getMonth() + 1))
  const [anio, setAnio] = useState(String(registroExistente?.anio ?? new Date().getFullYear()))
  const [monto, setMonto] = useState(String(registroExistente?.monto ?? ''))
  const [observacion, setObservacion] = useState(registroExistente?.observacion ?? '')
  const [categoria, setCategoria] = useState(registroExistente?.categoria ?? categorias?.[0]?.value ?? '')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await onUpsert({
        id: registroExistente?.id,
        mes: Number(mes),
        anio: Number(anio),
        monto: Number(monto),
        observacion: observacion.trim() || null,
        ...(categorias ? { categoria } : {}),
      })
      toast.success('Monto guardado')
      if (!esEdicion) {
        setMonto('')
        setObservacion('')
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el monto')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : tituloNuevo}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? tituloEditar : tituloNuevo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Mes</Label>
            <Select value={mes} onValueChange={setMes} disabled={esEdicion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, i) => (
                  <SelectItem key={nombre} value={String(i + 1)}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anio">Año</Label>
            <Input id="anio" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} disabled={esEdicion} required />
          </div>
          {categorias && (
            <div className="flex flex-col gap-1.5">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria} disabled={esEdicion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto (CLP)</Label>
            <Input id="monto" type="number" thousands min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacion">Observación (opcional)</Label>
            <Textarea id="observacion" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} />
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

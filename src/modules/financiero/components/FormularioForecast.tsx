import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/financiero/components/ui/dialog'
import BuscadorPresupuestoWip from '@/modules/financiero/components/BuscadorPresupuestoWip'
import { usePresupuestosLookup, type PresupuestoLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { MESES } from '@/modules/financiero/utils/formatters'
import type { ForecastPresupuesto } from '@/modules/financiero/types/financiero'

interface FormularioForecastProps {
  forecastExistente?: ForecastPresupuesto
  onUpsert: (input: {
    presupuesto_id: string
    mes: number
    anio: number
    monto_forecast: number
  }) => Promise<ForecastPresupuesto>
}

export default function FormularioForecast({ forecastExistente, onUpsert }: FormularioForecastProps) {
  const { presupuestos } = usePresupuestosLookup()
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!forecastExistente
  const presupuestoActual = presupuestos.find((p) => p.id === forecastExistente?.presupuesto_id)

  const [codigoWip, setCodigoWip] = useState(presupuestoActual?.tarea_wip ?? '')
  const [presupuesto, setPresupuesto] = useState<PresupuestoLookup | null>(presupuestoActual ?? null)
  const [mes, setMes] = useState(String(forecastExistente?.mes ?? 1))
  const [anio, setAnio] = useState(String(forecastExistente?.anio ?? new Date().getFullYear()))
  const [monto, setMonto] = useState(String(forecastExistente?.monto_forecast ?? ''))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!presupuesto) {
      toast.error('Ingresá un código WIP válido')
      return
    }
    setEnviando(true)
    try {
      await onUpsert({
        presupuesto_id: presupuesto.id,
        mes: Number(mes),
        anio: Number(anio),
        monto_forecast: Number(monto),
      })
      toast.success('Forecast guardado')
      if (!esEdicion) {
        setCodigoWip('')
        setPresupuesto(null)
        setMonto('')
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el forecast')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : 'Agregar forecast'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar forecast del mes' : 'Agregar forecast mensual'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <BuscadorPresupuestoWip
            codigoWip={codigoWip}
            onCodigoWipChange={setCodigoWip}
            onResolved={setPresupuesto}
          />
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto forecast (CLP)</Label>
            <Input id="monto" type="number" thousands min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required />
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

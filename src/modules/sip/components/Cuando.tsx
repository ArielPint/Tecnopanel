import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { cn } from '@/lib/utils'
import { hoyChile } from '../lib/formato'

/** Tramo sugerido para un ingreso por hora: la hora que acaba de terminar. */
function tramoSugerido(): { desde: string; hasta: string } {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const desde = Math.max(0, h - 1)
  return { desde: `${String(desde).padStart(2, '0')}:00`, hasta: `${String(desde + 1).padStart(2, '0')}:00` }
}

export interface ValorCuando {
  fecha: string
  porHora: boolean
  horaDesde: string
  horaHasta: string
}

/** Fecha del registro y, si es por hora, su tramo. Lo usan la fabricación y los cortes. */
export default function Cuando({ valor, onChange }: { valor: ValorCuando; onChange: (v: ValorCuando) => void }) {
  const { fecha, porHora, horaDesde, horaHasta } = valor
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cuándo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-fecha">Fecha</Label>
          <Input id="f-fecha" type="date" value={fecha} max={hoyChile()} onChange={(e) => e.target.value && onChange({ ...valor, fecha: e.target.value })} required className="w-auto" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Ingreso</Label>
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup">
            {[
              { v: false, label: 'Día completo' },
              { v: true, label: 'Por hora' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={porHora === o.v}
                onClick={() => {
                  const t = o.v && !horaDesde ? tramoSugerido() : null
                  onChange({ ...valor, porHora: o.v, ...(t && { horaDesde: t.desde, horaHasta: t.hasta }) })
                }}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  porHora === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {porHora && (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-desde">Desde</Label>
              <Input id="f-desde" type="time" value={horaDesde} onChange={(e) => onChange({ ...valor, horaDesde: e.target.value })} required className="w-auto" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-hasta">Hasta</Label>
              <Input id="f-hasta" type="time" value={horaHasta} onChange={(e) => onChange({ ...valor, horaHasta: e.target.value })} required className="w-auto" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

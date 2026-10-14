import { Lock } from 'lucide-react'
import MontoInput from '@/components/MontoInput'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import type { Remuneracion } from '../lib/api'

export function rentaVacia(): Remuneracion {
  return { renta_ofrecida: null, pretension_renta: null, observacion: null }
}

const inputClase = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono-tabular'

/** Renta ofrecida y pretensión: van a ing_remuneracion, que solo lee RRHH. */
export default function CamposRenta({ renta, onChange }: { renta: Remuneracion; onChange: (r: Remuneracion) => void }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Solo RRHH ve estos montos. El coordinador y las áreas no los ven.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ip-renta">Renta ofrecida (bruta mensual, $)</Label>
          <MontoInput id="ip-renta" value={renta.renta_ofrecida} onChange={(v) => onChange({ ...renta, renta_ofrecida: v })} className={inputClase} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ip-pretension">Pretensión de renta (líquida, $)</Label>
          <MontoInput id="ip-pretension" value={renta.pretension_renta} onChange={(v) => onChange({ ...renta, pretension_renta: v })} className={inputClase} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ip-renta-obs">Comentario sobre la renta</Label>
        <Textarea id="ip-renta-obs" rows={2} value={renta.observacion ?? ''} onChange={(e) => onChange({ ...renta, observacion: e.target.value || null })} placeholder="Bonos, asignaciones, periodo de prueba…" />
      </div>
    </div>
  )
}

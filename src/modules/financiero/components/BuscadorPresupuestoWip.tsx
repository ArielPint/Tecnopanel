import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { usePresupuestosLookup, type PresupuestoLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'

interface BuscadorPresupuestoWipProps {
  codigoWip: string
  onCodigoWipChange: (value: string) => void
  onResolved: (presupuesto: PresupuestoLookup | null) => void
}

// Patrón "código WIP → descripción automática": el usuario tipea el código
// (tal como figura en la OC/forecast en papel) y se resuelve solo la
// descripción del presupuesto correspondiente, en vez de elegir de una lista.
export default function BuscadorPresupuestoWip({
  codigoWip,
  onCodigoWipChange,
  onResolved,
}: BuscadorPresupuestoWipProps) {
  const { presupuestos } = usePresupuestosLookup()
  const encontrado = presupuestos.find((p) => p.tarea_wip === codigoWip.trim())

  const onChange = (value: string) => {
    onCodigoWipChange(value)
    onResolved(presupuestos.find((p) => p.tarea_wip === value.trim()) ?? null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="codigo_wip">Código WIP</Label>
      <Input
        id="codigo_wip"
        value={codigoWip}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej: 10010"
        required
      />
      <p className={encontrado ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
        {codigoWip.trim() === ''
          ? 'Ingresá el código WIP del presupuesto'
          : encontrado
            ? encontrado.nombre
            : 'Código WIP no encontrado'}
      </p>
    </div>
  )
}

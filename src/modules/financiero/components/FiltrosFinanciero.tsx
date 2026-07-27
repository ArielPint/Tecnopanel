import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'

interface FiltrosFinancieroProps {
  search: string
  onSearchChange: (value: string) => void
  presupuestoId: string
  onPresupuestoChange: (value: string) => void
  placeholder?: string
}

export default function FiltrosFinanciero({
  search,
  onSearchChange,
  presupuestoId,
  onPresupuestoChange,
  placeholder = 'Buscar…',
}: FiltrosFinancieroProps) {
  const { presupuestos } = usePresupuestosLookup()

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className="w-full sm:max-w-xs"
      />
      <Select value={presupuestoId || 'todos'} onValueChange={(v) => onPresupuestoChange(v === 'todos' ? '' : v)}>
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue placeholder="Todos los presupuestos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los presupuestos</SelectItem>
          {presupuestos.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

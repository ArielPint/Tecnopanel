import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { useConfigIngresos } from '../hooks/useConfigIngresos'
import { useEstadosPagoIngresos } from '../hooks/useEstadosPagoIngresos'
import { useAuth } from '../hooks/useAuth'

export default function Configuracion() {
  const { isAdmin } = useAuth()
  const { montoContractual, loading, guardar } = useConfigIngresos()
  const { estadosPago } = useEstadosPagoIngresos()
  const [valor, setValor] = useState('')
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Rechazado no descuenta del contrato — igual que consumidoPorSubcontrato
  // en estados_pago/pages/Subcontratos.tsx.
  const consumido = useMemo(
    () => estadosPago.filter((ep) => ep.estado !== 'rechazado').reduce((acc, ep) => acc + ep.monto_neto, 0),
    [estadosPago],
  )
  const saldo = montoContractual - consumido
  const avance = montoContractual > 0 ? (consumido / montoContractual) * 100 : 0

  function onEditar() {
    setValor(String(montoContractual))
    setEditando(true)
  }

  async function onGuardar() {
    setGuardando(true)
    try {
      await guardar(Number(valor) || 0)
      toast.success('Monto contractual actualizado')
      setEditando(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <Label>Monto contractual total del proyecto</Label>
        {editando ? (
          <div className="flex items-center gap-2">
            <Input type="number" thousands min="0" value={valor} onChange={(e) => setValor(e.target.value)} className="max-w-48" autoFocus />
            <Button size="sm" onClick={onGuardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-2xl font-semibold tabular-nums">{loading ? '…' : formatCLP(montoContractual)}</p>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={onEditar}>
                Editar
              </Button>
            )}
          </div>
        )}
        {!isAdmin && <p className="text-xs text-muted-foreground">Solo un administrador puede editar este valor.</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">EP acumulados</p>
          <p className="text-lg font-semibold tabular-nums">{formatCLP(consumido)}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">% Avance</p>
          <p className="text-lg font-semibold tabular-nums">{avance.toFixed(1)}%</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Saldo disponible</p>
          <p className={`text-lg font-semibold tabular-nums ${saldo < 0 ? 'text-destructive' : ''}`}>{formatCLP(saldo)}</p>
        </div>
      </div>
    </div>
  )
}

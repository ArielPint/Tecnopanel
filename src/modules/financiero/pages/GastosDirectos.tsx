import { Receipt } from 'lucide-react'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { useGastosDirectos } from '@/modules/financiero/hooks/useGastosDirectos'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import FormularioGastoDirecto from '@/modules/financiero/components/FormularioGastoDirecto'
import { formatCLP, nombreMes } from '@/modules/financiero/utils/formatters'

export default function GastosDirectos() {
  const { puedeEditar } = useAuth()
  const { gastos, loading, error, upsertGasto } = useGastosDirectos()
  const { presupuestos } = usePresupuestosLookup()
  const editable = puedeEditar('gastos-directos')

  const nombrePartida = (presupuestoId: string) => {
    const p = presupuestos.find((p) => p.id === presupuestoId)
    if (!p) return '—'
    return p.tarea_wip ? `${p.tarea_wip} — ${p.nombre}` : p.nombre
  }

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
        Gastos que no entran por OC (arriendo, gastos activados, etc.)
      </p>

      <div className="flex justify-end">
        {editable && <FormularioGastoDirecto onUpsert={upsertGasto} />}
      </div>

      {!loading && gastos.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no hay gastos directos cargados"
          description={editable ? 'Cargá el primero con el botón "Agregar gasto".' : undefined}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código WIP</TableHead>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Observación</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={editable ? 5 : 4} />
            ) : (
              <TableBody>
                {gastos.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{nombrePartida(g.presupuesto_id)}</TableCell>
                    <TableCell>
                      {nombreMes(g.mes)} {g.anio}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(g.monto)}</TableCell>
                    <TableCell className="max-w-96 truncate">{g.observacion ?? '—'}</TableCell>
                    {editable && (
                      <TableCell>
                        <FormularioGastoDirecto registroExistente={g} onUpsert={upsertGasto} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}

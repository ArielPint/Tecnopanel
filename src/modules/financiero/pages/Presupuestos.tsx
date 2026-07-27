import { Wallet } from 'lucide-react'
import { usePresupuestos } from '@/modules/financiero/hooks/usePresupuestos'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import FormularioPresupuesto from '@/modules/financiero/components/FormularioPresupuesto'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP } from '@/modules/financiero/utils/formatters'

export default function Presupuestos() {
  const { puedeEditar } = useAuth()
  const editable = puedeEditar('presupuestos')
  const { presupuestos, loading, error, createPresupuesto, updatePresupuesto } = usePresupuestos()

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <FormularioPresupuesto onCreate={createPresupuesto} onUpdate={updatePresupuesto} />
        </div>
      )}

      {!loading && presupuestos.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no hay presupuestos"
          description={editable ? 'Creá el primero con el botón "Nuevo Presupuesto".' : undefined}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tarea WIP</TableHead>
                <TableHead className="text-right">Presupuesto Original</TableHead>
                <TableHead className="text-right">Valor Servicio</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={editable ? 6 : 5} />
            ) : (
              <TableBody>
                {presupuestos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.codigo_articulo}</TableCell>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>{p.tarea_wip ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(p.presupuesto_original)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(p.valor_servicio)}</TableCell>
                    {editable && (
                      <TableCell>
                        <FormularioPresupuesto presupuesto={p} onCreate={createPresupuesto} onUpdate={updatePresupuesto} />
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

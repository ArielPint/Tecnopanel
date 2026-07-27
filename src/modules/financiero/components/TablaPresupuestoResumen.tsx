import { Wallet } from 'lucide-react'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Button } from '@/modules/financiero/components/ui/button'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, formatPct } from '@/modules/financiero/utils/formatters'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { cn } from '@/lib/utils'

function colorAvance(pct: number) {
  if (pct >= 1) return 'text-destructive font-medium'
  if (pct >= 0.7) return 'text-warning font-medium'
  return 'text-foreground'
}

interface TablaPresupuestoResumenProps {
  seguimiento: SeguimientoPresupuesto[]
  loading: boolean
  error: string | null
}

export default function TablaPresupuestoResumen({ seguimiento, loading, error }: TablaPresupuestoResumenProps) {
  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={loading || seguimiento.length === 0}
          onClick={() =>
            exportarExcel(
              'presupuesto_resumen',
              seguimiento.map((row) => ({
                Nombre: row.nombre,
                Presupuesto: row.presupuesto_original,
                Forecast: row.forecast_actual,
                'Costo Total': row.facturado,
                '% Avance': row.pct_avance,
                'Déficit / Superávit': row.deficit_o_superavit,
              })),
            )
          }
        >
          Exportar a Excel
        </Button>
      </div>
      {!loading && seguimiento.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no hay presupuestos cargados"
          description="Los presupuestos creados van a aparecer acá con su seguimiento en tiempo real."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Forecast</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
                <TableHead className="text-right">% Avance</TableHead>
                <TableHead className="text-right">Déficit / Superávit</TableHead>
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={6} />
            ) : (
              <TableBody>
                {seguimiento.map((row) => (
                  <TableRow key={row.presupuesto_id}>
                    <TableCell className="font-medium">{row.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(row.presupuesto_original)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(row.forecast_actual)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(row.facturado)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', colorAvance(row.pct_avance))}>
                      {formatPct(row.pct_avance)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        row.deficit_o_superavit < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {formatCLP(row.deficit_o_superavit)}
                    </TableCell>
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

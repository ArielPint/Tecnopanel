import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { useForecast } from '@/modules/financiero/hooks/useForecast'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import FormularioForecast from '@/modules/financiero/components/FormularioForecast'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, nombreMes } from '@/modules/financiero/utils/formatters'

export default function Forecast() {
  const { puedeEditar } = useAuth()
  const editable = puedeEditar('presupuestos')
  const { forecast, loading, upsertForecast } = useForecast()
  const { presupuestos } = usePresupuestosLookup()

  const presupuestoPorId = useMemo(() => new Map(presupuestos.map((p) => [p.id, p])), [presupuestos])

  const filasOrdenadas = useMemo(
    () =>
      [...forecast].sort((a, b) => {
        const wipA = presupuestoPorId.get(a.presupuesto_id)?.tarea_wip ?? ''
        const wipB = presupuestoPorId.get(b.presupuesto_id)?.tarea_wip ?? ''
        return wipA.localeCompare(wipB) || a.anio - b.anio || a.mes - b.mes
      }),
    [forecast, presupuestoPorId],
  )

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <FormularioForecast onUpsert={upsertForecast} />
        </div>
      )}

      {!loading && filasOrdenadas.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Todavía no hay forecast cargado"
          description={editable ? 'Agregá el primero con el botón "Agregar forecast".' : undefined}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código WIP</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Monto Forecast</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={editable ? 5 : 4} />
            ) : (
              <TableBody>
                {filasOrdenadas.map((f) => {
                  const presupuesto = presupuestoPorId.get(f.presupuesto_id)
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{presupuesto?.tarea_wip ?? '—'}</TableCell>
                      <TableCell>{presupuesto?.nombre ?? '—'}</TableCell>
                      <TableCell>
                        {nombreMes(f.mes)} {f.anio}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(f.monto_forecast)}</TableCell>
                      {editable && (
                        <TableCell>
                          <FormularioForecast forecastExistente={f} onUpsert={upsertForecast} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}

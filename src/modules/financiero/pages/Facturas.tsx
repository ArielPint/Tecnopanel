import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Receipt } from 'lucide-react'
import { useFacturas } from '@/modules/financiero/hooks/useFacturas'
import { useOrdenesCompra } from '@/modules/financiero/hooks/useOrdenesCompra'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import FormularioFactura from '@/modules/financiero/components/FormularioFactura'
import AlertaSobreepaso from '@/modules/financiero/components/AlertaSobreepaso'
import VisorPDF from '@/modules/financiero/components/VisorPDF'
import FiltrosFinanciero from '@/modules/financiero/components/FiltrosFinanciero'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { Button } from '@/modules/financiero/components/ui/button'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'

const ESTADO_VARIANT: Record<string, 'secondary' | 'success' | 'destructive'> = {
  VALIDADA: 'success',
  SUPERA_OC: 'destructive',
  ANULADA: 'secondary',
}

export default function Facturas() {
  const { canEditOC } = useAuth()
  const { facturas, loading, error, createFactura, updateFactura, deleteFactura } = useFacturas()
  const { ordenesCompra } = useOrdenesCompra()
  const { presupuestos } = usePresupuestosLookup()
  const [search, setSearch] = useState('')
  const [presupuestoId, setPresupuestoId] = useState('')

  const ocPorId = useMemo(() => new Map(ordenesCompra.map((oc) => [oc.id, oc])), [ordenesCompra])
  const nombrePresupuesto = (presupuestoId: string | null) =>
    presupuestos.find((p) => p.id === presupuestoId)?.nombre ?? '—'

  const filtradas = useMemo(() => {
    return facturas.filter((f) => {
      if (presupuestoId && f.presupuesto_id !== presupuestoId) return false
      if (search) {
        const q = search.toLowerCase()
        const enNumero = f.numero_factura?.toLowerCase().includes(q)
        const enObs = f.observacion?.toLowerCase().includes(q)
        const enOc = ocPorId.get(f.ordenes_compra_id)?.numero_oc.toLowerCase().includes(q)
        if (!enNumero && !enObs && !enOc) return false
      }
      return true
    })
  }, [facturas, search, presupuestoId, ocPorId])

  const haySuperapaso = filtradas.some((f) => f.estado === 'SUPERA_OC')
  const hayFiltrosActivos = !!search || !!presupuestoId
  const columnas = 10 + (canEditOC ? 1 : 0)

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      {haySuperapaso && <AlertaSobreepaso />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FiltrosFinanciero
          search={search}
          onSearchChange={setSearch}
          presupuestoId={presupuestoId}
          onPresupuestoChange={setPresupuestoId}
          placeholder="Buscar por N° factura, OC u observación…"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || filtradas.length === 0}
            onClick={() =>
              exportarExcel(
                'facturas',
                filtradas.map((f) => ({
                  'N° Factura': f.numero_factura ?? '',
                  'N° OC': ocPorId.get(f.ordenes_compra_id)?.numero_oc ?? '',
                  Presupuesto: nombrePresupuesto(f.presupuesto_id),
                  Proveedor: f.proveedor_rut ?? '',
                  Fecha: f.fecha,
                  Monto: f.monto,
                  Descuento: f.descuento,
                  Observación: f.observacion ?? '',
                  Estado: f.estado,
                })),
              )
            }
          >
            Exportar a Excel
          </Button>
          {canEditOC && (
            <FormularioFactura
              facturas={facturas}
              ordenesCompra={ordenesCompra}
              onCreate={createFactura}
              onUpdate={updateFactura}
            />
          )}
        </div>
      </div>

      {!loading && filtradas.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hayFiltrosActivos ? 'Ninguna factura coincide con el filtro' : 'Todavía no hay facturas'}
          description={
            hayFiltrosActivos
              ? 'Probá con otro término de búsqueda o quitá el filtro de presupuesto.'
              : canEditOC
                ? 'Creá la primera con el botón "Nueva Factura".'
                : undefined
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Factura</TableHead>
                <TableHead>N° OC</TableHead>
                <TableHead>Presupuesto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
                <TableHead>Observación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PDF</TableHead>
                {canEditOC && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={columnas} />
            ) : (
              <TableBody>
                {filtradas.map((f) => {
                  const oc = ocPorId.get(f.ordenes_compra_id)
                  return (
                    <TableRow key={f.id} className={cn(f.estado === 'SUPERA_OC' && 'bg-destructive/10')}>
                      <TableCell className="font-medium">{f.numero_factura ?? '(sin número)'}</TableCell>
                      <TableCell>{oc?.numero_oc ?? '—'}</TableCell>
                      <TableCell>{nombrePresupuesto(f.presupuesto_id)}</TableCell>
                      <TableCell>{f.proveedor_rut ?? '—'}</TableCell>
                      <TableCell>{formatFecha(f.fecha)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(f.monto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.descuento ? formatCLP(f.descuento) : '—'}</TableCell>
                      <TableCell className="max-w-56 truncate">{f.observacion ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={ESTADO_VARIANT[f.estado]}>{f.estado}</Badge>
                      </TableCell>
                      <TableCell>{f.pdf_path ? <VisorPDF pdfPath={f.pdf_path} /> : '—'}</TableCell>
                      {canEditOC && (
                        <TableCell>
                          <div className="flex gap-2">
                            <FormularioFactura
                              factura={f}
                              facturas={facturas}
                              ordenesCompra={ordenesCompra}
                              onCreate={createFactura}
                              onUpdate={updateFactura}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!confirm(`¿Eliminar la factura ${f.numero_factura ?? '(sin número)'}?`)) return
                                deleteFactura(f.id).catch((err) =>
                                  toast.error(err instanceof Error ? err.message : 'Error al eliminar la factura'),
                                )
                              }}
                            >
                              Eliminar
                            </Button>
                          </div>
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

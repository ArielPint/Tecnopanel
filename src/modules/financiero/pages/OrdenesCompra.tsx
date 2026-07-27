import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Receipt, ShoppingCart } from 'lucide-react'
import { useOrdenesCompra } from '@/modules/financiero/hooks/useOrdenesCompra'
import { useFacturas } from '@/modules/financiero/hooks/useFacturas'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import FiltrosFinanciero from '@/modules/financiero/components/FiltrosFinanciero'
import FormularioOC from '@/modules/financiero/components/FormularioOC'
import VisorPDF from '@/modules/financiero/components/VisorPDF'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'

const ESTADO_VARIANT: Record<string, 'secondary' | 'success' | 'destructive'> = {
  ABIERTA: 'secondary',
  COMPLETA: 'success',
  ANULADA: 'secondary',
}

const ESTADO_FACTURA_VARIANT: Record<string, 'secondary' | 'success' | 'destructive'> = {
  VALIDADA: 'success',
  SUPERA_OC: 'destructive',
  ANULADA: 'secondary',
}

export default function OrdenesCompra() {
  const { canEditOC } = useAuth()
  const { ordenesCompra, loading, error, createOrdenCompra, updateOrdenCompra, deleteOrdenCompra } = useOrdenesCompra()
  const { facturas, loading: loadingFacturas } = useFacturas()
  const { presupuestos } = usePresupuestosLookup()
  const [search, setSearch] = useState('')
  const [presupuestoId, setPresupuestoId] = useState('')

  const nombrePresupuesto = (id: string) => presupuestos.find((p) => p.id === id)?.nombre ?? '—'

  const filtradas = useMemo(() => {
    return ordenesCompra.filter((oc) => {
      if (presupuestoId && oc.presupuesto_id !== presupuestoId) return false
      if (search) {
        const q = search.toLowerCase()
        const enDetalle = oc.detalle?.toLowerCase().includes(q)
        const enNumero = oc.numero_oc.toLowerCase().includes(q)
        if (!enDetalle && !enNumero) return false
      }
      return true
    })
  }, [ordenesCompra, search, presupuestoId])

  const buscandoPorOC = !!search.trim()

  const facturasAsociadas = useMemo(() => {
    if (!buscandoPorOC) return []
    const ids = new Set(filtradas.map((oc) => oc.id))
    return facturas.filter((f) => ids.has(f.ordenes_compra_id))
  }, [buscandoPorOC, filtradas, facturas])

  if (error) return <p className="text-destructive">{error}</p>

  const hayFiltrosActivos = !!search || !!presupuestoId
  const columnas = 8 + (canEditOC ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FiltrosFinanciero
          search={search}
          onSearchChange={setSearch}
          presupuestoId={presupuestoId}
          onPresupuestoChange={setPresupuestoId}
          placeholder="Buscar por N° OC o detalle…"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || filtradas.length === 0}
            onClick={() =>
              exportarExcel(
                'ordenes_compra',
                filtradas.map((oc) => ({
                  'N° OC': oc.numero_oc,
                  Presupuesto: nombrePresupuesto(oc.presupuesto_id),
                  Proveedor: oc.proveedor_rut ?? '',
                  Fecha: oc.fecha,
                  Neto: oc.neto,
                  Detalle: oc.detalle ?? '',
                  Estado: oc.estado,
                })),
              )
            }
          >
            Exportar a Excel
          </Button>
          {canEditOC && (
            <FormularioOC ordenesCompra={ordenesCompra} onCreate={createOrdenCompra} onUpdate={updateOrdenCompra} />
          )}
        </div>
      </div>

      {!loading && filtradas.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={hayFiltrosActivos ? 'Ninguna OC coincide con el filtro' : 'Todavía no hay órdenes de compra'}
          description={
            hayFiltrosActivos
              ? 'Probá con otro término de búsqueda o quitá el filtro de presupuesto.'
              : canEditOC
                ? 'Creá la primera con el botón "Nueva OC".'
                : undefined
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° OC</TableHead>
                <TableHead>Presupuesto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PDF</TableHead>
                {canEditOC && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={columnas} />
            ) : (
              <TableBody>
                {filtradas.map((oc) => (
                  <TableRow key={oc.id}>
                    <TableCell className="font-medium">{oc.numero_oc}</TableCell>
                    <TableCell>{nombrePresupuesto(oc.presupuesto_id)}</TableCell>
                    <TableCell>{oc.proveedor_rut ?? '—'}</TableCell>
                    <TableCell>{formatFecha(oc.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(oc.neto)}</TableCell>
                    <TableCell className="max-w-56 truncate">{oc.detalle ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[oc.estado]}>{oc.estado}</Badge>
                    </TableCell>
                    <TableCell>{oc.pdf_path ? <VisorPDF pdfPath={oc.pdf_path} /> : '—'}</TableCell>
                    {canEditOC && (
                      <TableCell>
                        <div className="flex gap-2">
                          <FormularioOC
                            ordenCompra={oc}
                            ordenesCompra={ordenesCompra}
                            onCreate={createOrdenCompra}
                            onUpdate={updateOrdenCompra}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!confirm(`¿Eliminar la OC ${oc.numero_oc}?`)) return
                              deleteOrdenCompra(oc.id).catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Error al eliminar la OC'),
                              )
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {buscandoPorOC && filtradas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Facturas asociadas</h2>
          {loadingFacturas ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Factura</TableHead>
                    <TableHead>N° OC</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableSkeleton columns={7} />
              </Table>
            </div>
          ) : facturasAsociadas.length === 0 ? (
            <EmptyState icon={Receipt} title="Esta OC todavía no tiene facturas asociadas" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Factura</TableHead>
                    <TableHead>N° OC</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturasAsociadas.map((f) => {
                    const oc = filtradas.find((o) => o.id === f.ordenes_compra_id)
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.numero_factura ?? '(sin número)'}</TableCell>
                        <TableCell>{oc?.numero_oc ?? '—'}</TableCell>
                        <TableCell>{f.proveedor_rut ?? '—'}</TableCell>
                        <TableCell>{formatFecha(f.fecha)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(f.monto)}</TableCell>
                        <TableCell>
                          <Badge variant={ESTADO_FACTURA_VARIANT[f.estado]}>{f.estado}</Badge>
                        </TableCell>
                        <TableCell>{f.pdf_path ? <VisorPDF pdfPath={f.pdf_path} /> : '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { useAuth } from '../hooks/useAuth'
import { useOrdenesCompra } from '../hooks/useOrdenesCompra'
import FormularioOC from '../components/FormularioOC'

export default function OrdenesCompra() {
  const { perfil, isAdmin } = useAuth()
  const { ordenes, guias, montoPorOC, loading, error, guardar, eliminar } = useOrdenesCompra()
  const [search, setSearch] = useState('')

  const puedeEditar = isAdmin || perfil?.role !== 'readonly'

  const filtradas = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return ordenes
    return ordenes.filter((oc) => [oc.numero, oc.proveedor, oc.notas].some((v) => (v || '').toLowerCase().includes(q)))
  }, [ordenes, search])

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍  N° OC, proveedor, notas…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64" />
        <span className="ml-auto text-xs text-muted-foreground">{filtradas.length} orden{filtradas.length !== 1 ? 'es' : ''}</span>
        {puedeEditar && <FormularioOC onGuardar={(input, id) => guardar(input, id, perfil?.name ?? 'anon')} />}
      </div>

      {!loading && filtradas.length === 0 ? (
        <EmptyState icon={FileText} title={search ? 'Ninguna OC coincide con la búsqueda' : 'Sin órdenes de compra. Usá + Nueva OC.'} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° OC</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>GDs</TableHead>
                <TableHead>Notas</TableHead>
                {puedeEditar && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={6 + (puedeEditar ? 1 : 0)} />
            ) : (
              <TableBody>
                {filtradas.map((oc) => {
                  const gds = guias.filter((g) => g.oc_id === oc.id).map((g) => g.gd)
                  return (
                    <TableRow key={oc.id}>
                      <TableCell className="font-mono font-semibold text-primary">{oc.numero}</TableCell>
                      <TableCell>{oc.proveedor || '—'}</TableCell>
                      <TableCell>{formatFecha(oc.fecha)}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{formatCLP(montoPorOC[oc.id] ?? 0)}</TableCell>
                      <TableCell>
                        {gds.length ? (
                          <div className="flex flex-wrap gap-1">
                            {gds.map((gd) => (
                              <span key={gd} className="rounded-full border bg-muted px-2 py-0.5 text-xs">{gd}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin GDs</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={oc.notas ?? ''}>{oc.notas || '—'}</TableCell>
                      {puedeEditar && (
                        <TableCell>
                          <FormularioOC
                            oc={oc}
                            gdsIniciales={gds}
                            monto={montoPorOC[oc.id] ?? 0}
                            onGuardar={(input, id) => guardar(input, id, perfil?.name ?? 'anon')}
                            onEliminar={eliminar}
                          />
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

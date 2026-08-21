import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { useEstadosPagoIngresos } from '../hooks/useEstadosPagoIngresos'
import { useAuth } from '../hooks/useAuth'
import { ESTADOS_EP, ESTADO_LABEL, ESTADO_VARIANT } from '../lib/estadosFlujo'
import FormularioEstadoPagoIngreso from '../components/FormularioEstadoPagoIngreso'
import DetalleEstadoPagoIngreso from '../components/DetalleEstadoPagoIngreso'

export default function Listado() {
  const { puedeCrear, puedeAdministrar } = useAuth()
  const { estadosPago, loading, cambiarEstado, registrarCobro, crear, actualizar, refetch } = useEstadosPagoIngresos()
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')

  const filtrados = useMemo(() => {
    return estadosPago.filter((ep) => {
      if (estadoFiltro && ep.estado !== estadoFiltro) return false
      if (search) {
        const q = search.toLowerCase()
        const enNumero = ep.numero_ep.toLowerCase().includes(q)
        const enPeriodo = ep.periodo?.toLowerCase().includes(q)
        if (!enNumero && !enPeriodo) return false
      }
      return true
    })
  }, [estadosPago, estadoFiltro, search])

  async function onEliminar(id: string, numero: string) {
    if (!confirm(`¿Eliminar el EP ${numero}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('estados_pago_ingresos').delete().eq('id', id)
    if (error) toast.error(error.message)
    else await refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar N° EP o período…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Select value={estadoFiltro || 'todos'} onValueChange={(v) => setEstadoFiltro(v === 'todos' ? '' : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {ESTADOS_EP.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {puedeCrear && (
          <FormularioEstadoPagoIngreso trigger={<Button size="sm">Nuevo Estado de Pago</Button>} onCrear={crear} onActualizar={actualizar} />
        )}
      </div>

      {!loading && filtrados.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={estadosPago.length === 0 ? 'Todavía no hay Estados de Pago' : 'Ningún EP coincide con el filtro'}
          description={estadosPago.length === 0 && puedeCrear ? 'Creá el primero con el botón "Nuevo Estado de Pago".' : undefined}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° EP</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Monto neto</TableHead>
                <TableHead className="text-right">Saldo pendiente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={6} />
            ) : (
              <TableBody>
                {filtrados.map((ep) => (
                  <TableRow key={ep.id}>
                    <TableCell className="font-medium">{ep.numero_ep}</TableCell>
                    <TableCell>{ep.periodo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(ep.monto_neto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(ep.saldo_pendiente)}</TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[ep.estado]}>{ESTADO_LABEL[ep.estado]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <DetalleEstadoPagoIngreso
                          estadoPago={ep}
                          onCambiarEstado={cambiarEstado}
                          onRegistrarCobro={registrarCobro}
                        />
                        {puedeAdministrar && (
                          <Button variant="outline" size="sm" onClick={() => onEliminar(ep.id, ep.numero_ep)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
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

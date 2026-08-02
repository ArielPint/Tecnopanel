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
import { useEstadosPago } from '../hooks/useEstadosPago'
import { useSubcontratos } from '../hooks/useSubcontratos'
import { useSubcontratistas } from '../hooks/useSubcontratistas'
import { useAuth } from '../hooks/useAuth'
import { ESTADOS_EP, ESTADO_LABEL, ESTADO_VARIANT } from '../lib/estadosFlujo'
import FormularioEstadoPago from '../components/FormularioEstadoPago'
import DetalleEstadoPago from '../components/DetalleEstadoPago'

export default function Listado() {
  const { puedeCrear, puedeAdministrar } = useAuth()
  const { estadosPago, loading, cambiarEstado, registrarPago, crear, actualizar, refetch } = useEstadosPago()
  const { subcontratos } = useSubcontratos()
  const { subcontratistas } = useSubcontratistas()
  const [search, setSearch] = useState('')
  const [subcontratoId, setSubcontratoId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')

  const subcontratoLabel = useMemo(() => {
    const map = new Map(
      subcontratos.map((sc) => [
        sc.id,
        `${sc.especialidad} — ${subcontratistas.find((s) => s.id === sc.subcontratista_id)?.nombre ?? '—'}`,
      ]),
    )
    return (id: string) => map.get(id) ?? '—'
  }, [subcontratos, subcontratistas])

  const filtrados = useMemo(() => {
    return estadosPago.filter((ep) => {
      if (subcontratoId && ep.subcontrato_id !== subcontratoId) return false
      if (estadoFiltro && ep.estado !== estadoFiltro) return false
      if (search) {
        const q = search.toLowerCase()
        const enNumero = ep.numero_ep.toLowerCase().includes(q)
        const enPeriodo = ep.periodo?.toLowerCase().includes(q)
        const enSubcontrato = subcontratoLabel(ep.subcontrato_id).toLowerCase().includes(q)
        if (!enNumero && !enPeriodo && !enSubcontrato) return false
      }
      return true
    })
  }, [estadosPago, subcontratoId, estadoFiltro, search, subcontratoLabel])

  async function onEliminar(id: string, numero: string) {
    if (!confirm(`¿Eliminar el EP ${numero}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('estados_pago').delete().eq('id', id)
    if (error) toast.error(error.message)
    else await refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar N° EP, período o subcontrato…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Select value={subcontratoId || 'todos'} onValueChange={(v) => setSubcontratoId(v === 'todos' ? '' : v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos los subcontratos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los subcontratos</SelectItem>
              {subcontratos.map((sc) => (
                <SelectItem key={sc.id} value={sc.id}>
                  {subcontratoLabel(sc.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <FormularioEstadoPago subcontratos={subcontratos} trigger={<Button size="sm">Nuevo Estado de Pago</Button>} onCrear={crear} onActualizar={actualizar} />
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
                <TableHead>Subcontrato</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Monto neto</TableHead>
                <TableHead className="text-right">Saldo pendiente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={7} />
            ) : (
              <TableBody>
                {filtrados.map((ep) => (
                  <TableRow key={ep.id}>
                    <TableCell className="font-medium">{ep.numero_ep}</TableCell>
                    <TableCell>{subcontratoLabel(ep.subcontrato_id)}</TableCell>
                    <TableCell>{ep.periodo ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(ep.monto_neto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(ep.saldo_pendiente)}</TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[ep.estado]}>{ESTADO_LABEL[ep.estado]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <DetalleEstadoPago
                          estadoPago={ep}
                          subcontratoLabel={subcontratoLabel(ep.subcontrato_id)}
                          onCambiarEstado={cambiarEstado}
                          onRegistrarPago={registrarPago}
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

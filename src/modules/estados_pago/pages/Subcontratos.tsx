import { useMemo } from 'react'
import { toast } from 'sonner'
import { Building2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { useSubcontratistas } from '../hooks/useSubcontratistas'
import { useSubcontratos } from '../hooks/useSubcontratos'
import { useEstadosPago } from '../hooks/useEstadosPago'
import { useAuth } from '../hooks/useAuth'
import FormularioSubcontratista from '../components/FormularioSubcontratista'
import FormularioSubcontrato from '../components/FormularioSubcontrato'

export default function Subcontratos() {
  const { puedeCrear, puedeEditar, puedeAdministrar } = useAuth()
  const { subcontratistas, loading: loadingSc, crear: crearSc, actualizar: actualizarSc, eliminar: eliminarSc } = useSubcontratistas()
  const { subcontratos, loading: loadingSub, crear: crearSub, actualizar: actualizarSub, eliminar: eliminarSub } = useSubcontratos()
  const { estadosPago } = useEstadosPago()
  const puedeEscribir = puedeCrear || puedeEditar

  const nombreSubcontratista = (id: string) => subcontratistas.find((s) => s.id === id)?.nombre ?? '—'

  // Rechazado no descuenta del contrato — los demás estados (emitido, en_revision, aprobado, pagado) sí.
  const consumidoPorSubcontrato = useMemo(() => {
    const map = new Map<string, number>()
    for (const ep of estadosPago) {
      if (ep.estado === 'rechazado') continue
      map.set(ep.subcontrato_id, (map.get(ep.subcontrato_id) ?? 0) + ep.monto_neto)
    }
    return map
  }, [estadosPago])

  async function onEliminarSubcontratista(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el subcontratista "${nombre}"? Falla si tiene subcontratos asociados.`)) return
    try {
      await eliminarSc(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function onEliminarSubcontrato(id: string, especialidad: string) {
    if (!confirm(`¿Eliminar el subcontrato "${especialidad}"? Falla si tiene Estados de Pago asociados.`)) return
    try {
      await eliminarSub(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Subcontratistas</h2>
          {puedeEscribir && (
            <FormularioSubcontratista trigger={<Button size="sm">Nuevo subcontratista</Button>} onCrear={crearSc} onActualizar={actualizarSc} />
          )}
        </div>
        {!loadingSc && subcontratistas.length === 0 ? (
          <EmptyState icon={Building2} title="Todavía no hay subcontratistas" description={puedeEscribir ? 'Creá el primero con el botón de arriba.' : undefined} />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Giro</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  {(puedeEscribir || puedeAdministrar) && <TableHead />}
                </TableRow>
              </TableHeader>
              {loadingSc ? (
                <TableSkeleton columns={5 + (puedeEscribir || puedeAdministrar ? 1 : 0)} />
              ) : (
                <TableBody>
                  {subcontratistas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.nombre}</TableCell>
                      <TableCell>{s.rut ?? '—'}</TableCell>
                      <TableCell>{s.giro ?? '—'}</TableCell>
                      <TableCell>{[s.telefono, s.email].filter(Boolean).join(' · ') || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={s.activo ? 'success' : 'secondary'}>{s.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </TableCell>
                      {(puedeEscribir || puedeAdministrar) && (
                        <TableCell>
                          <div className="flex gap-2">
                            {puedeEscribir && (
                              <FormularioSubcontratista
                                subcontratista={s}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Editar
                                  </Button>
                                }
                                onCrear={crearSc}
                                onActualizar={actualizarSc}
                              />
                            )}
                            {puedeAdministrar && (
                              <Button variant="outline" size="sm" onClick={() => onEliminarSubcontratista(s.id, s.nombre)}>
                                Eliminar
                              </Button>
                            )}
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
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Subcontratos</h2>
          {puedeEscribir && (
            <FormularioSubcontrato
              subcontratistas={subcontratistas}
              trigger={<Button size="sm">Nuevo subcontrato</Button>}
              onCrear={crearSub}
              onActualizar={actualizarSub}
            />
          )}
        </div>
        {!loadingSub && subcontratos.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Todavía no hay subcontratos"
            description={puedeEscribir ? 'Creá el primero con el botón de arriba.' : undefined}
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subcontratista</TableHead>
                  <TableHead>Especialidad / Partida</TableHead>
                  <TableHead className="text-right">Monto contractual</TableHead>
                  <TableHead className="text-right">EP acumulados</TableHead>
                  <TableHead className="text-right">% Avance</TableHead>
                  <TableHead className="text-right">Saldo disponible</TableHead>
                  <TableHead>Estado</TableHead>
                  {(puedeEscribir || puedeAdministrar) && <TableHead />}
                </TableRow>
              </TableHeader>
              {loadingSub ? (
                <TableSkeleton columns={7 + (puedeEscribir || puedeAdministrar ? 1 : 0)} />
              ) : (
                <TableBody>
                  {subcontratos.map((sc) => {
                    const consumido = consumidoPorSubcontrato.get(sc.id) ?? 0
                    const saldo = sc.monto_contractual - consumido
                    const avance = sc.monto_contractual > 0 ? (consumido / sc.monto_contractual) * 100 : 0
                    return (
                    <TableRow key={sc.id}>
                      <TableCell className="font-medium">{nombreSubcontratista(sc.subcontratista_id)}</TableCell>
                      <TableCell>{sc.especialidad}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(sc.monto_contractual)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(consumido)}</TableCell>
                      <TableCell className="text-right tabular-nums">{avance.toFixed(1)}%</TableCell>
                      <TableCell className={`text-right tabular-nums ${saldo < 0 ? 'text-destructive' : ''}`}>{formatCLP(saldo)}</TableCell>
                      <TableCell>
                        <Badge variant={sc.estado === 'activo' ? 'success' : 'secondary'}>{sc.estado}</Badge>
                      </TableCell>
                      {(puedeEscribir || puedeAdministrar) && (
                        <TableCell>
                          <div className="flex gap-2">
                            {puedeEscribir && (
                              <FormularioSubcontrato
                                subcontrato={sc}
                                subcontratistas={subcontratistas}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Editar
                                  </Button>
                                }
                                onCrear={crearSub}
                                onActualizar={actualizarSub}
                              />
                            )}
                            {puedeAdministrar && (
                              <Button variant="outline" size="sm" onClick={() => onEliminarSubcontrato(sc.id, sc.especialidad)}>
                                Eliminar
                              </Button>
                            )}
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
      </section>
    </div>
  )
}

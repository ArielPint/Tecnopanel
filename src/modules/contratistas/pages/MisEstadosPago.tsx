import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import FormularioEstadoPago from '@/modules/estados_pago/components/FormularioEstadoPago'
import DetalleEstadoPago from '@/modules/estados_pago/components/DetalleEstadoPago'
import { AuthProviderSubcontratista } from '@/modules/estados_pago/hooks/useAuth'
import { ESTADO_LABEL, ESTADO_VARIANT } from '@/modules/estados_pago/lib/estadosFlujo'
import type { EstadoPago, Subcontrato } from '@/modules/estados_pago/types'
import { actualizarEstadoPago, crearEstadoPago, misEstadosPago, misSubcontratos, type MiSubcontrato } from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

// FormularioEstadoPago pide el Subcontrato completo; usa id y especialidad
const comoSubcontrato = (s: MiSubcontrato) => s as unknown as Subcontrato

/** Estados de pago de la empresa, por proyecto y subcontrato. Los emite la empresa; Tecnopanel los
 *  revisa, aprueba o rechaza y registra el pago. Mientras están emitidos, la empresa puede corregirlos. */
export default function MisEstadosPago() {
  const [subcontratos, setSubcontratos] = useState<MiSubcontrato[]>([])
  const [eps, setEps] = useState<EstadoPago[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const sc = await misSubcontratos()
      setSubcontratos(sc)
      setEps(await misEstadosPago(sc.map((s) => s.id)))
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const porProyecto = useMemo(() => {
    const m = new Map<string, { nombre: string; subcontratos: MiSubcontrato[] }>()
    for (const s of subcontratos) {
      if (!m.has(s.proyecto_id)) m.set(s.proyecto_id, { nombre: s.proyecto_nombre, subcontratos: [] })
      m.get(s.proyecto_id)!.subcontratos.push(s)
    }
    return [...m.entries()]
  }, [subcontratos])

  // El detalle cambia estados y registra pagos solo para Tecnopanel: aquí no se ofrece
  const sinPermiso = async () => {
    throw new Error('Lo revisa Tecnopanel')
  }

  return (
    <AuthProviderSubcontratista>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-extrabold">Estados de pago</h1>
          <p className="text-sm text-muted-foreground">
            Emita aquí los estados de pago de cada subcontrato. Tecnopanel los revisa y los aprueba o rechaza; mientras estén emitidos (sin revisar)
            puede corregirlos.
          </p>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : subcontratos.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Su empresa no tiene subcontratos registrados en Tecnopanel. Cuando se registre uno, aparecerá aquí con su proyecto.
          </p>
        ) : (
          porProyecto.map(([proyectoId, p]) => (
            <section key={proyectoId} className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{p.nombre}</h2>
              {p.subcontratos.map((s) => {
                const propios = eps.filter((e) => e.subcontrato_id === s.id)
                const neto = propios.filter((e) => e.estado !== 'rechazado').reduce((t, e) => t + Number(e.monto_neto ?? 0), 0)
                const pagado = propios.reduce((t, e) => t + Number(e.monto_pagado ?? 0), 0)
                return (
                  <Card key={s.id}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold">
                            {s.especialidad}
                            {s.estado !== 'activo' && (
                              <Badge variant="secondary" className="ml-2">
                                {s.estado}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            Contrato {formatCLP(s.monto_contractual)} · Cobrado {formatCLP(neto)} · Pagado {formatCLP(pagado)}
                          </p>
                        </div>
                        {s.estado === 'activo' && (
                          <FormularioEstadoPago
                            subcontratos={[comoSubcontrato(s)]}
                            trigger={
                              <Button size="sm">
                                <Plus className="mr-1 h-4 w-4" /> Nuevo estado de pago
                              </Button>
                            }
                            onCrear={async (input) => {
                              const ep = await crearEstadoPago(input, s.proyecto_id)
                              await cargar()
                              return ep
                            }}
                            onActualizar={async (id, patch) => {
                              await actualizarEstadoPago(id, patch)
                              await cargar()
                            }}
                          />
                        )}
                      </div>

                      {propios.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todavía no hay estados de pago de este subcontrato.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead>
                              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                <th className="px-3 py-2 font-semibold">N° EP</th>
                                <th className="px-3 py-2 font-semibold">Período</th>
                                <th className="px-3 py-2 text-right font-semibold">Monto neto</th>
                                <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                                <th className="px-3 py-2 font-semibold">Estado</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {propios.map((ep) => (
                                <tr key={ep.id} className="border-b last:border-0">
                                  <td className="px-3 py-2 font-medium">{ep.numero_ep}</td>
                                  <td className="px-3 py-2">{ep.periodo ?? '—'}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCLP(ep.monto_neto)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCLP(ep.saldo_pendiente)}</td>
                                  <td className="px-3 py-2">
                                    <Badge variant={ESTADO_VARIANT[ep.estado]}>{ESTADO_LABEL[ep.estado]}</Badge>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-end gap-2">
                                      {ep.estado === 'emitido' && (
                                        <FormularioEstadoPago
                                          estadoPago={ep}
                                          subcontratos={[comoSubcontrato(s)]}
                                          trigger={
                                            <Button size="sm" variant="outline">
                                              Corregir
                                            </Button>
                                          }
                                          onCrear={async (input) => crearEstadoPago(input, s.proyecto_id)}
                                          onActualizar={async (id, patch) => {
                                            await actualizarEstadoPago(id, patch)
                                            await cargar()
                                          }}
                                        />
                                      )}
                                      <DetalleEstadoPago
                                        estadoPago={ep}
                                        subcontratoLabel={`${p.nombre} · ${s.especialidad}`}
                                        onCambiarEstado={sinPermiso}
                                        onRegistrarPago={sinPermiso}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          ))
        )}
      </div>
    </AuthProviderSubcontratista>
  )
}

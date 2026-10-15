import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Ban, Check, CheckCircle2, Circle, FileText, Link2, PackageCheck, Pencil, Plus, Send, Trash2, Undo2, Unlink, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import MontoInput from '@/components/MontoInput'
import { cn } from '@/lib/utils'
import { fmtFecha, fmtFechaHora } from '@/modules/sso/lib/estados'
import CamposSolicitud, { Seccion, limpiarSolicitud, validarSolicitud } from '../components/CamposSolicitud'
import EditorItems from '../components/EditorItems'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { ESTADO } from '../lib/catalogos'
import {
  ARCHIVOS_ACEPTADOS,
  abrirArchivo,
  actualizarCotizacion,
  actualizarSolicitud,
  anular,
  aprobar,
  buscarProveedores,
  comentar,
  crearCotizacion,
  desvincularOc,
  eliminarArchivo,
  eliminarCotizacion,
  enviarAprobacion,
  etiquetaCeco,
  fmtPesos,
  guardarItems,
  listarAprobaciones,
  listarArchivos,
  listarBitacora,
  listarCotizaciones,
  listarFacturasOc,
  listarItems,
  listarLineasOc,
  listarNiveles,
  listarOcVinculadas,
  marcarRecibida,
  nivelPara,
  obtenerSolicitud,
  presupuestoSolicitud,
  rechazar,
  subirAdjunto,
  subirArchivoCotizacion,
  vincularOc,
  type Aprobacion,
  type Archivo,
  type Cotizacion,
  type DatosCotizacion,
  type DatosSolicitud,
  type EventoBitacora,
  type FacturaOc,
  type Item,
  type LineaOc,
  type Nivel,
  type OcVinculada,
  type PresupuestoSolicitud,
  type ProveedorSap,
  type Solicitud as SolicitudT,
} from '../lib/api'
import { RUTA } from '../lib/rutas'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)
const num = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n)

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm">{children || '—'}</div>
    </div>
  )
}

function BotonSubir({ label, onArchivo, disabled }: { label: string; onArchivo: (f: File) => void; disabled?: boolean }) {
  return (
    <label
      className={cn(
        'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-semibold hover:bg-accent',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Upload className="h-3.5 w-3.5" /> {label}
      <input
        type="file"
        accept={ARCHIVOS_ACEPTADOS}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onArchivo(f)
        }}
      />
    </label>
  )
}

function FilaArchivo({ a, puedeBorrar, onBorrar }: { a: Archivo; puedeBorrar: boolean; onBorrar: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => abrirArchivo(a).catch((err) => toast.error(msg(err, 'No se pudo abrir')))}
        className="inline-flex min-w-0 items-center gap-1 text-brand hover:underline"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{a.nombre}</span>
      </button>
      {puedeBorrar && (
        <button type="button" onClick={onBorrar} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${a.nombre}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** Cómo queda el presupuesto anual del CECO si esta solicitud se compra. null si no hay presupuesto cargado. */
function saldoPresupuesto(p: PresupuestoSolicitud | null, s: SolicitudT) {
  if (!p || p.presupuesto == null) return null
  const esta = p.esta_incluida ? 0 : (s.monto_referencia ?? 0)
  const usado = p.ejecutado + p.comprometido + esta
  return { usado, disponible: p.presupuesto - usado, pct: p.presupuesto > 0 ? Math.round((100 * usado) / p.presupuesto) : 100 }
}

function TarjetaPresupuesto({ p, s }: { p: PresupuestoSolicitud; s: SolicitudT }) {
  const saldo = saldoPresupuesto(p, s)
  // con OC emitida la compra ya está en el ejecutado de SAP
  const yaComprada = ['oc_emitida', 'recibida', 'rechazada', 'anulada'].includes(s.estado)
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            Presupuesto {p.anio} · CECO {p.centro_costo}
          </h2>
          {saldo && saldo.disponible < 0 && !yaComprada && (
            <Badge variant="destructive">
              <AlertTriangle /> Excede
            </Badge>
          )}
        </div>
        {p.presupuesto == null || !saldo ? (
          <p className="text-sm text-muted-foreground">
            Este centro de costo no tiene presupuesto cargado para {p.anio}. Ejecutado en SAP:{' '}
            <span className="font-mono-tabular">{fmtPesos(p.ejecutado)}</span>.
          </p>
        ) : (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full', saldo.disponible < 0 ? 'bg-destructive' : 'bg-brand')} style={{ width: `${Math.min(100, saldo.pct)}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Presupuesto anual</dt>
              <dd className="text-right font-mono-tabular">{fmtPesos(p.presupuesto)}</dd>
              <dt className="text-muted-foreground">Ejecutado (OC en SAP)</dt>
              <dd className="text-right font-mono-tabular">{fmtPesos(p.ejecutado)}</dd>
              <dt className="text-muted-foreground">Comprometido en el portal</dt>
              <dd className="text-right font-mono-tabular">{fmtPesos(p.comprometido)}</dd>
              {!p.esta_incluida && !yaComprada && (
                <>
                  <dt className="text-muted-foreground">Esta solicitud</dt>
                  <dd className="text-right font-mono-tabular">{fmtPesos(s.monto_referencia)}</dd>
                </>
              )}
              <dt className="font-semibold">{yaComprada ? 'Disponible' : 'Disponible después de esta'}</dt>
              <dd className={cn('text-right font-mono-tabular font-semibold', saldo.disponible < 0 && 'text-destructive')}>{fmtPesos(saldo.disponible)}</dd>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const PASOS = ['Cotización', 'Aprobación', 'OC en SAP', 'Recepción'] as const

function Pasos({ s }: { s: SolicitudT }) {
  const actual = { cotizando: 0, en_aprobacion: 1, aprobada: 2, oc_emitida: 3, recibida: 4, rechazada: -1, anulada: -1 }[s.estado]
  if (actual < 0) return null
  return (
    <ol className="grid grid-cols-4 gap-2">
      {PASOS.map((p, i) => (
        <li key={p} className="space-y-1">
          <div className={cn('h-1.5 rounded-full', i < actual ? 'bg-brand' : i === actual ? 'bg-brand/40' : 'bg-muted')} />
          <p className={cn('text-[11px] font-semibold', i <= actual ? 'text-foreground' : 'text-muted-foreground')}>{p}</p>
        </li>
      ))}
    </ol>
  )
}

export default function Solicitud() {
  const { id = '' } = useParams<{ id: string }>()
  const { userId, comprasEn, veControl } = usePermisosAdq()
  const [s, setS] = useState<SolicitudT | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([])
  const [ocs, setOcs] = useState<OcVinculada[]>([])
  const [lineas, setLineas] = useState<LineaOc[]>([])
  const [facturas, setFacturas] = useState<FacturaOc[]>([])
  const [presupuesto, setPresupuesto] = useState<PresupuestoSolicitud | null>(null)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [bitacora, setBitacora] = useState<EventoBitacora[]>([])
  const [niveles, setNiveles] = useState<Nivel[]>([])
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [dialogo, setDialogo] = useState<
    | null
    | { tipo: 'editar' }
    | { tipo: 'cotizacion'; c: Cotizacion | null }
    | { tipo: 'enviar'; c: Cotizacion }
    | { tipo: 'aprobar' | 'devolver' | 'rechazar' | 'anular' | 'oc' | 'recibida' }
  >(null)
  const [comentario, setComentario] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [sol, it, co, ap, oc, ar, bi, ni] = await Promise.all([
        obtenerSolicitud(id),
        listarItems(id),
        listarCotizaciones(id),
        listarAprobaciones(id),
        listarOcVinculadas(id),
        listarArchivos(id),
        listarBitacora(id),
        listarNiveles(),
      ])
      setS(sol)
      setItems(it)
      setCotizaciones(co)
      setAprobaciones(ap)
      setOcs(oc)
      setArchivos(ar)
      setBitacora(bi)
      setNiveles(ni)
      const docs = oc.map((o) => o.doc_entry).filter((d): d is number => d != null)
      const [li, fa, pr] = await Promise.all([listarLineasOc(docs), listarFacturasOc(docs), veControl ? presupuestoSolicitud(id) : null])
      setLineas(li)
      setFacturas(fa)
      setPresupuesto(pr)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [id, veControl])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true)
    try {
      await accion()
      toast.success(exito)
      await cargar()
      return true
    } catch (err) {
      toast.error(msg(err, 'No se pudo completar la acción'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function cerrarCon(accion: () => Promise<unknown>, exito: string) {
    if (await hacer(accion, exito)) setDialogo(null)
  }

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!s) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La solicitud no existe o no tienes acceso.</p>
      </div>
    )
  }

  // Compras de la sucursal de esta solicitud (puede ser comprador en una y aprobador en otra)
  const esCompras = comprasEn(s.sucursal)
  const cotizando = s.estado === 'cotizando'
  const cerrada = ['recibida', 'rechazada', 'anulada'].includes(s.estado)
  const puedeEditar = cotizando && (s.creado_por === userId || esCompras)
  const puedeAnular = !cerrada && (esCompras || (s.creado_por === userId && (cotizando || s.estado === 'en_aprobacion')))
  const masBarata = cotizaciones.length ? Math.min(...cotizaciones.map((c) => c.monto_neto)) : null
  const adjuntos = archivos.filter((a) => !a.cotizacion_id)
  const rondas = [...new Set(aprobaciones.map((a) => a.ronda))].sort((a, b) => b - a)

  function borrarArchivo(a: Archivo) {
    if (!window.confirm(`¿Eliminar "${a.nombre}"?`)) return
    hacer(() => eliminarArchivo(a), 'Archivo eliminado')
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-tabular text-xs text-muted-foreground">Solicitud de compra SC-{s.numero}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold">{s.titulo}</h1>
            <Badge variant={ESTADO[s.estado].variant}>{ESTADO[s.estado].label}</Badge>
            {s.prioridad === 'urgente' && !cerrada && <Badge variant="destructive">Urgente</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {s.area} · {s.sucursal}
            {s.fecha_requerida && (
              <>
                {' '}
                · se necesita el <span className="font-mono-tabular text-foreground">{fmtFecha(s.fecha_requerida)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'editar' })}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
          )}
          {puedeAnular && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialogo({ tipo: 'anular' })}>
              <Ban className="mr-1 h-4 w-4" /> Anular
            </Button>
          )}
          {s.puedo_aprobar && (
            <>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialogo({ tipo: 'rechazar' })}>
                <X className="mr-1 h-4 w-4" /> Rechazar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'devolver' })}>
                <Undo2 className="mr-1 h-4 w-4" /> Devolver
              </Button>
              <Button size="sm" onClick={() => setDialogo({ tipo: 'aprobar' })}>
                <Check className="mr-1 h-4 w-4" /> Aprobar
              </Button>
            </>
          )}
          {esCompras && (s.estado === 'aprobada' || s.estado === 'oc_emitida') && (
            <Button size="sm" variant={s.estado === 'aprobada' ? 'default' : 'outline'} onClick={() => setDialogo({ tipo: 'oc' })}>
              <Link2 className="mr-1 h-4 w-4" /> Vincular OC de SAP
            </Button>
          )}
          {esCompras && s.estado === 'oc_emitida' && (
            <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: 'recibida' })}>
              <PackageCheck className="mr-1 h-4 w-4" /> Marcar recibida
            </Button>
          )}
        </div>
      </div>

      {(s.estado === 'rechazada' || s.estado === 'anulada') && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          {s.estado === 'rechazada' ? 'Rechazada' : 'Anulada'} el {fmtFechaHora(s.fecha_cierre)} por {s.cerrado_por_nombre ?? '—'}. Motivo: {s.motivo_cierre}
        </p>
      )}
      {s.estado === 'aprobada' && esCompras && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          Aprobada. Emite la OC en SAP y escribe <b className="font-mono-tabular">SC-{s.numero}</b> en sus comentarios: se vincula sola en la próxima sincronización
          (cada hora). También puedes vincularla ahora con su N°.
        </p>
      )}

      <Card>
        <CardContent className="pt-4">
          <Pasos s={s} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <h2 className="text-sm font-bold sm:col-span-2">Datos</h2>
              <Dato label="Pidió">{s.creado_por_nombre}</Dato>
              <Dato label="Creada el">{fmtFechaHora(s.created_at)}</Dato>
              <Dato label="Centro de costo">
                {etiquetaCeco(s.centro_costo ?? '', s.centro_costo_nombre)}
                {s.linea && <span className="block text-xs text-muted-foreground">{s.linea}</span>}
              </Dato>
              <Dato label="Obra">{s.proyecto_nombre}</Dato>
              <Dato label="Lugar de entrega">{s.lugar_entrega}</Dato>
              <Dato label="Monto neto">
                <span className="font-mono-tabular">{fmtPesos(s.monto_referencia)}</span>
                {s.monto_aprobacion == null && s.monto_referencia != null && <span className="text-xs text-muted-foreground"> (estimado)</span>}
              </Dato>
              {s.justificacion && (
                <div className="sm:col-span-2">
                  <Dato label="Justificación">
                    <span className="whitespace-pre-wrap">{s.justificacion}</span>
                  </Dato>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <h2 className="text-sm font-bold">Ítems</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-2 font-semibold">Descripción</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Cantidad</th>
                      <th className="py-1.5 pl-2 text-right font-semibold">Estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          {it.descripcion}
                          {it.articulo_codigo && <span className="ml-1.5 font-mono-tabular text-[11px] text-muted-foreground">SAP {it.articulo_codigo}</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono-tabular">
                          {num(it.cantidad)} {it.unidad}
                        </td>
                        <td className="whitespace-nowrap py-2 pl-2 text-right font-mono-tabular text-muted-foreground">
                          {it.precio_estimado != null ? fmtPesos(it.cantidad * it.precio_estimado) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">Adjuntos</h2>
                {puedeEditar && <BotonSubir label="Adjuntar" disabled={ocupado} onArchivo={(f) => hacer(() => subirAdjunto(s.id, f), 'Archivo adjunto')} />}
              </div>
              {adjuntos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin especificaciones ni planos adjuntos.</p>
              ) : (
                adjuntos.map((a) => <FilaArchivo key={a.id} a={a} puedeBorrar={puedeEditar} onBorrar={() => borrarArchivo(a)} />)
              )}
            </CardContent>
          </Card>

          {ocs.length > 0 && (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <h2 className="text-sm font-bold">Órdenes de compra en SAP</h2>
                {ocs.map((o) => {
                  const lin = lineas.filter((l) => l.doc_entry === o.doc_entry)
                  const fac = facturas.filter((f) => f.oc_doc_entry === o.doc_entry && !f.cancelada)
                  return (
                    <div key={o.docnum} className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            OC N° <span className="font-mono-tabular">{o.docnum}</span>
                            {o.cancelada && <Badge variant="destructive" className="ml-2">Cancelada en SAP</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o.en_sap
                              ? `${o.proveedor_nombre ?? '—'} · ${fmtFecha(o.fecha)} · total ${fmtPesos(o.total)}${o.moneda && o.moneda !== 'CLP' ? ` ${o.moneda}` : ''} con IVA`
                              : 'Todavía no llega de SAP (se sincroniza cada hora)'}
                            {o.automatica ? ' · vinculada por comentario' : o.vinculado_por_nombre ? ` · vinculó ${o.vinculado_por_nombre}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {o.recepcion_pct != null && (
                            <span className={cn('text-xs font-semibold', o.recepcion_pct >= 100 ? 'text-success' : 'text-muted-foreground')}>
                              Recibido {o.recepcion_pct}%
                            </span>
                          )}
                          {esCompras && s.estado === 'oc_emitida' && (
                            <button
                              type="button"
                              onClick={() => window.confirm(`¿Desvincular la OC ${o.docnum}?`) && hacer(() => desvincularOc(s.id, o.docnum), 'OC desvinculada')}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Desvincular OC ${o.docnum}`}
                            >
                              <Unlink className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {o.en_sap && !o.cancelada && (
                        <div className="space-y-1 rounded bg-muted/40 px-2 py-1.5 text-xs">
                          <p>
                            Facturado <span className="font-mono-tabular font-semibold">{fmtPesos(o.facturado)}</span> de{' '}
                            <span className="font-mono-tabular">{fmtPesos(o.neto)}</span> neto
                            {o.neto ? ` (${Math.min(100, Math.round((100 * (o.facturado ?? 0)) / o.neto))}%)` : ''}
                          </p>
                          {fac.map((f) => (
                            <p key={f.doc_entry} className="flex flex-wrap justify-between gap-x-3 text-muted-foreground">
                              <span>
                                Factura <span className="font-mono-tabular">{f.folio ?? f.docnum}</span> · {fmtFecha(f.fecha)}
                              </span>
                              <span className="font-mono-tabular">
                                {fmtPesos(f.total)} con IVA ·{' '}
                                {f.pagado >= f.total ? 'pagada' : f.pagado > 0 ? `pagado ${fmtPesos(f.pagado)}` : `vence ${fmtFecha(f.vencimiento)}`}
                              </span>
                            </p>
                          ))}
                        </div>
                      )}
                      {lin.length > 0 && (
                        <table className="w-full text-xs">
                          <tbody>
                            {lin.map((l) => (
                              <tr key={l.linea} className="border-t">
                                <td className="py-1 pr-2">{l.descripcion ?? l.articulo_codigo}</td>
                                <td className="whitespace-nowrap py-1 text-right font-mono-tabular">
                                  {num(l.cantidad - l.pendiente)}/{num(l.cantidad)} {l.unidad ?? ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {presupuesto && <TarjetaPresupuesto p={presupuesto} s={s} />}

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">Cotizaciones</h2>
                {s.puedo_cotizar && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDialogo({ tipo: 'cotizacion', c: null })}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                  </Button>
                )}
              </div>
              {cotizaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">{cotizando ? 'Compras todavía no carga cotizaciones.' : 'Sin cotizaciones.'}</p>
              ) : (
                <div className="space-y-2">
                  {cotizaciones.map((c) => {
                    const elegida = c.id === s.cotizacion_id
                    const pdfs = archivos.filter((a) => a.cotizacion_id === c.id)
                    return (
                      <div key={c.id} className={cn('space-y-1.5 rounded-md border p-3', elegida && 'border-brand bg-brand/5')}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {c.proveedor_nombre}
                              {elegida && <Badge className="ml-2">Elegida</Badge>}
                              {c.monto_neto === masBarata && cotizaciones.length > 1 && (
                                <Badge variant="success" className="ml-2">
                                  Menor precio
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                c.proveedor_rut,
                                c.plazo_entrega_dias != null && `entrega ${c.plazo_entrega_dias} días`,
                                c.condicion_pago,
                                c.validez && `válida al ${fmtFecha(c.validez)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          <p className="font-mono-tabular font-bold">{fmtPesos(c.monto_neto)}</p>
                        </div>
                        {c.observacion && <p className="whitespace-pre-wrap text-xs">{c.observacion}</p>}
                        {pdfs.map((a) => (
                          <FilaArchivo key={a.id} a={a} puedeBorrar={s.puedo_cotizar} onBorrar={() => borrarArchivo(a)} />
                        ))}
                        {s.puedo_cotizar && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <BotonSubir label="PDF" disabled={ocupado} onArchivo={(f) => hacer(() => subirArchivoCotizacion(s.id, c.id, f), 'Cotización adjunta')} />
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDialogo({ tipo: 'cotizacion', c })}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-destructive"
                              disabled={ocupado}
                              onClick={() =>
                                window.confirm(`¿Eliminar la cotización de ${c.proveedor_nombre}?`) &&
                                hacer(() => eliminarCotizacion(c, archivos), 'Cotización eliminada')
                              }
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                            </Button>
                            <Button size="sm" className="ml-auto h-8 text-xs" disabled={ocupado} onClick={() => setDialogo({ tipo: 'enviar', c })}>
                              <Send className="mr-1 h-3.5 w-3.5" /> Enviar a aprobación
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <h2 className="text-sm font-bold">Aprobación</h2>
              {s.estado === 'en_aprobacion' && (
                <ol className="space-y-1.5">
                  {niveles
                    .filter((n) => n.sucursal === s.sucursal && n.nivel <= s.nivel_requerido)
                    .map((n) => (
                      <li key={n.nivel} className="flex items-center gap-2 text-sm">
                        {n.nivel <= s.nivel_aprobado ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Circle className={cn('h-4 w-4', n.nivel === s.nivel_aprobado + 1 ? 'text-warning' : 'text-muted-foreground/50')} />
                        )}
                        <span className={cn(n.nivel === s.nivel_aprobado + 1 && 'font-semibold')}>
                          Nivel {n.nivel} · {n.nombre}
                        </span>
                        {n.nivel === s.nivel_aprobado + 1 && <span className="text-xs text-muted-foreground">pendiente</span>}
                      </li>
                    ))}
                </ol>
              )}
              {aprobaciones.length === 0 && s.estado !== 'en_aprobacion' && (
                <p className="text-sm text-muted-foreground">
                  {cotizando ? 'Compras la envía a aprobación al elegir una cotización.' : 'Sin decisiones registradas.'}
                </p>
              )}
              {rondas.map((r) => (
                <div key={r} className="space-y-1.5">
                  {rondas.length > 1 && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Envío {r}</p>}
                  {aprobaciones
                    .filter((a) => a.ronda === r)
                    .map((a) => (
                      <div key={a.id} className="grid gap-0.5 text-sm sm:grid-cols-[120px_1fr] sm:gap-3">
                        <span className="font-mono-tabular text-xs text-muted-foreground">{fmtFechaHora(a.created_at)}</span>
                        <span>
                          <span
                            className={cn(
                              'font-semibold',
                              a.decision === 'aprobada' ? 'text-success' : a.decision === 'rechazada' ? 'text-destructive' : 'text-warning',
                            )}
                          >
                            {a.decision === 'aprobada' ? 'Aprobó' : a.decision === 'rechazada' ? 'Rechazó' : 'Devolvió'}
                          </span>{' '}
                          nivel {a.nivel} ({a.nivel_nombre}) · {a.usuario_nombre}
                          {a.comentario && <span className="block text-xs text-muted-foreground">{a.comentario}</span>}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-4">
              <h2 className="text-sm font-bold">Historial</h2>
              <form
                className="flex gap-2"
                onSubmit={async (e: FormEvent) => {
                  e.preventDefault()
                  if (!comentario.trim()) return
                  if (await hacer(() => comentar(s.id, comentario.trim()), 'Comentario agregado')) setComentario('')
                }}
              >
                <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Agregar un comentario" className="h-9" />
                <Button type="submit" size="sm" variant="outline" disabled={ocupado || !comentario.trim()}>
                  Comentar
                </Button>
              </form>
              <ul className="space-y-2.5">
                {bitacora.map((b) => (
                  <li key={b.id} className="grid gap-0.5 text-sm sm:grid-cols-[120px_1fr] sm:gap-3">
                    <span className="font-mono-tabular text-xs text-muted-foreground">{fmtFechaHora(b.created_at)}</span>
                    <span className={cn(b.tipo === 'comentario' && 'rounded bg-muted/60 px-2 py-1')}>
                      {b.texto}
                      {b.usuario_nombre && <span className="text-xs text-muted-foreground"> · {b.usuario_nombre}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {dialogo?.tipo === 'editar' && (
        <DialogoEditar
          s={s}
          itemsIniciales={items}
          ocupado={ocupado}
          onCerrar={() => setDialogo(null)}
          onGuardar={(d, its) =>
            cerrarCon(async () => {
              await actualizarSolicitud(s.id, d)
              await guardarItems(s.id, its)
            }, 'Solicitud actualizada')
          }
        />
      )}

      {dialogo?.tipo === 'cotizacion' && (
        <DialogoCotizacion
          inicial={dialogo.c}
          ocupado={ocupado}
          onCerrar={() => setDialogo(null)}
          onGuardar={(d, pdf) =>
            cerrarCon(async () => {
              if (dialogo.c) {
                await actualizarCotizacion(dialogo.c.id, d)
                if (pdf) await subirArchivoCotizacion(s.id, dialogo.c.id, pdf)
              } else {
                const nuevaId = await crearCotizacion(s.id, d)
                if (pdf) await subirArchivoCotizacion(s.id, nuevaId, pdf)
              }
            }, dialogo.c ? 'Cotización actualizada' : 'Cotización agregada')
          }
        />
      )}

      {dialogo?.tipo === 'enviar' && (
        <Dialog open onOpenChange={(o) => !o && setDialogo(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar SC-{s.numero} a aprobación</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Con la cotización de <b>{dialogo.c.proveedor_nombre}</b> por <b className="font-mono-tabular">{fmtPesos(dialogo.c.monto_neto)}</b> neto.
              </p>
              {cotizaciones.length < 3 && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  Hay {cotizaciones.length} {cotizaciones.length === 1 ? 'cotización' : 'cotizaciones'}. Lo habitual es comparar al menos tres.
                </p>
              )}
              {(() => {
                const saldo = saldoPresupuesto(presupuesto && { ...presupuesto, esta_incluida: false }, { ...s, monto_referencia: dialogo.c.monto_neto })
                return saldo && saldo.disponible < 0 ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Excede el presupuesto {presupuesto?.anio} del CECO {s.centro_costo} en {fmtPesos(-saldo.disponible)}. Los aprobadores lo verán marcado.
                  </p>
                ) : null
              })()}
              {masBarata != null && dialogo.c.monto_neto > masBarata && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  No es la de menor precio ({fmtPesos(masBarata)}). Explica el motivo en las observaciones de la cotización.
                </p>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Va a necesitar</p>
                <ol className="space-y-0.5">
                  {niveles
                    .filter((n) => n.sucursal === s.sucursal && n.activo && n.nivel <= nivelPara(niveles, s.sucursal, dialogo.c.monto_neto))
                    .map((n) => (
                      <li key={n.nivel}>
                        Nivel {n.nivel} · {n.nombre}
                      </li>
                    ))}
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">Mientras está en aprobación no se pueden cambiar los ítems ni las cotizaciones.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogo(null)}>
                Cancelar
              </Button>
              <Button disabled={ocupado} onClick={() => cerrarCon(() => enviarAprobacion(s.id, dialogo.c.id), 'Enviada a aprobación')}>
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <DialogoTexto
        abierto={dialogo?.tipo === 'aprobar'}
        titulo={`Aprobar SC-${s.numero}`}
        detalle={`${fmtPesos(s.monto_aprobacion)} neto con ${s.proveedor_elegido ?? '—'}, CECO ${s.centro_costo}.${
          (saldoPresupuesto(presupuesto, s)?.disponible ?? 0) < 0 ? ` EXCEDE el presupuesto ${presupuesto?.anio} del centro de costo.` : ''
        } Si tu nivel alcanza, quedan aprobados también los niveles siguientes que falten.`}
        etiqueta="Comentario (opcional)"
        boton="Aprobar"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => aprobar(s.id, t), 'Solicitud aprobada')}
      />
      <DialogoTexto
        abierto={dialogo?.tipo === 'devolver'}
        titulo={`Devolver SC-${s.numero} a cotización`}
        detalle="Compras podrá agregar o cambiar cotizaciones y volver a enviarla. La aprobación parte de cero."
        etiqueta="Qué falta o qué cambiar"
        requerido
        boton="Devolver"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => rechazar(s.id, t, true), 'Devuelta a cotización')}
      />
      <DialogoTexto
        abierto={dialogo?.tipo === 'rechazar'}
        titulo={`Rechazar SC-${s.numero}`}
        detalle="La solicitud queda cerrada y no se puede reabrir. Se avisa a quien la pidió y a Compras."
        etiqueta="Motivo"
        requerido
        boton="Rechazar"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => rechazar(s.id, t, false), 'Solicitud rechazada')}
      />
      <DialogoTexto
        abierto={dialogo?.tipo === 'anular'}
        titulo={`Anular SC-${s.numero}`}
        detalle="La solicitud queda como registro y no se puede reabrir."
        etiqueta="Motivo"
        requerido
        boton="Anular"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => anular(s.id, t), 'Solicitud anulada')}
      />
      <DialogoTexto
        abierto={dialogo?.tipo === 'recibida'}
        titulo={`Marcar SC-${s.numero} como recibida`}
        detalle="Úsalo cuando la recepción no se registra en SAP (servicios, por ejemplo). Si se registra en SAP, la solicitud se cierra sola al recibir todo."
        etiqueta="Comentario (opcional)"
        boton="Marcar recibida"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => marcarRecibida(s.id, t), 'Solicitud cerrada como recibida')}
      />
      <DialogoTexto
        abierto={dialogo?.tipo === 'oc'}
        titulo={`Vincular una OC de SAP a SC-${s.numero}`}
        detalle="El N° de la orden de compra tal como aparece en SAP Business One. Una solicitud puede tener varias OC."
        etiqueta="N° de OC en SAP"
        requerido
        numerico
        boton="Vincular"
        ocupado={ocupado}
        onCerrar={() => setDialogo(null)}
        onAceptar={(t) => cerrarCon(() => vincularOc(s.id, Number(t)), `OC ${t} vinculada`)}
      />
    </div>
  )
}

function DialogoEditar({
  s,
  itemsIniciales,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  s: SolicitudT
  itemsIniciales: Item[]
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (d: DatosSolicitud, items: Item[]) => void
}) {
  const [datos, setDatos] = useState<DatosSolicitud>(() => ({
    sucursal: s.sucursal,
    area: s.area,
    titulo: s.titulo,
    justificacion: s.justificacion,
    proyecto_id: s.proyecto_id,
    centro_costo: s.centro_costo,
    prioridad: s.prioridad,
    fecha_requerida: s.fecha_requerida,
    lugar_entrega: s.lugar_entrega,
  }))
  const [items, setItems] = useState<Item[]>(itemsIniciales)
  const [problema, setProblema] = useState<string | null>(null)

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Editar SC-{s.numero}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const p = validarSolicitud(datos, items, false)
            setProblema(p)
            if (!p) onGuardar(limpiarSolicitud(datos), items)
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <CamposSolicitud datos={datos} onChange={setDatos} nueva={false} />
            <Seccion titulo="Ítems">
              <EditorItems items={items} onChange={setItems} />
            </Seccion>
          </div>
          <DialogFooter className="items-center gap-2 border-t pt-3">
            {problema && <p className="mr-auto text-sm text-destructive">{problema}</p>}
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoCotizacion({
  inicial,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  inicial: Cotizacion | null
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (d: DatosCotizacion, pdf: File | null) => void
}) {
  const [d, setD] = useState<DatosCotizacion>(() => ({
    proveedor_codigo: inicial?.proveedor_codigo ?? null,
    proveedor_nombre: inicial?.proveedor_nombre ?? '',
    proveedor_rut: inicial?.proveedor_rut ?? null,
    monto_neto: inicial?.monto_neto ?? 0,
    plazo_entrega_dias: inicial?.plazo_entrega_dias ?? null,
    condicion_pago: inicial?.condicion_pago ?? null,
    validez: inicial?.validez ?? null,
    observacion: inicial?.observacion ?? null,
  }))
  const [monto, setMonto] = useState<number | null>(inicial?.monto_neto ?? null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [sugerencias, setSugerencias] = useState<ProveedorSap[]>([])
  const [buscando, setBuscando] = useState(false)
  const [problema, setProblema] = useState<string | null>(null)
  const set = <K extends keyof DatosCotizacion>(k: K, v: DatosCotizacion[K]) => setD((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!buscando || d.proveedor_codigo) return
    const t = setTimeout(() => buscarProveedores(d.proveedor_nombre).then(setSugerencias).catch(() => setSugerencias([])), 250)
    return () => clearTimeout(t)
  }, [d.proveedor_nombre, d.proveedor_codigo, buscando])

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar cotización' : 'Agregar cotización'}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!d.proveedor_nombre.trim()) return setProblema('Indica el proveedor.')
            if (monto == null) return setProblema('Indica el monto neto.')
            setProblema(null)
            onGuardar({ ...d, monto_neto: monto }, pdf)
          }}
        >
          <div className="relative space-y-1">
            <Label htmlFor="adq-prov">Proveedor</Label>
            <Input
              id="adq-prov"
              value={d.proveedor_nombre}
              onChange={(e) => setD((x) => ({ ...x, proveedor_nombre: e.target.value, proveedor_codigo: null }))}
              onFocus={() => setBuscando(true)}
              onBlur={() => setTimeout(() => setBuscando(false), 150)}
              placeholder="Busca en los proveedores de SAP o escribe uno nuevo"
              autoComplete="off"
            />
            {d.proveedor_codigo && <p className="font-mono-tabular text-[11px] text-muted-foreground">SAP {d.proveedor_codigo}</p>}
            {buscando && sugerencias.length > 0 && !d.proveedor_codigo && (
              <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover text-sm text-popover-foreground shadow-lg">
                {sugerencias.map((p) => (
                  <li key={p.codigo}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setD((x) => ({ ...x, proveedor_nombre: p.nombre, proveedor_codigo: p.codigo, proveedor_rut: p.rut }))
                        setBuscando(false)
                      }}
                      className="flex w-full justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="truncate">{p.nombre}</span>
                      <span className="shrink-0 font-mono-tabular text-xs text-muted-foreground">{p.rut}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="adq-rut">RUT</Label>
              <Input id="adq-rut" value={d.proveedor_rut ?? ''} onChange={(e) => set('proveedor_rut', e.target.value)} className="font-mono-tabular" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adq-monto">Monto neto (CLP, sin IVA)</Label>
              <MontoInput
                id="adq-monto"
                value={monto}
                onChange={setMonto}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adq-plazo">Plazo de entrega (días)</Label>
              <Input
                id="adq-plazo"
                type="number"
                min={0}
                value={d.plazo_entrega_dias ?? ''}
                onChange={(e) => set('plazo_entrega_dias', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adq-pago">Condición de pago</Label>
              <Input id="adq-pago" list="adq-pagos" value={d.condicion_pago ?? ''} onChange={(e) => set('condicion_pago', e.target.value)} />
              <datalist id="adq-pagos">
                {['Contado', '30 días', '45 días', '60 días', '50% anticipo'].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adq-validez">Válida hasta</Label>
              <Input id="adq-validez" type="date" value={d.validez ?? ''} onChange={(e) => set('validez', e.target.value || null)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adq-pdf">PDF de la cotización</Label>
              <Input id="adq-pdf" type="file" accept={ARCHIVOS_ACEPTADOS} onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adq-obs">Observaciones</Label>
            <Textarea
              id="adq-obs"
              rows={2}
              value={d.observacion ?? ''}
              onChange={(e) => set('observacion', e.target.value)}
              placeholder="Moneda original, flete incluido, garantía, por qué se prefiere…"
            />
          </div>
          <DialogFooter className="items-center gap-2">
            {problema && <p className="mr-auto text-sm text-destructive">{problema}</p>}
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoTexto({
  abierto,
  titulo,
  detalle,
  etiqueta,
  requerido,
  numerico,
  boton,
  ocupado,
  onCerrar,
  onAceptar,
}: {
  abierto: boolean
  titulo: string
  detalle: string
  etiqueta: string
  requerido?: boolean
  numerico?: boolean
  boton: string
  ocupado: boolean
  onCerrar: () => void
  onAceptar: (texto: string) => void
}) {
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (abierto) setTexto('')
  }, [abierto])
  const valido = numerico ? /^\d+$/.test(texto.trim()) && Number(texto) > 0 : !requerido || !!texto.trim()

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valido) onAceptar(texto.trim())
          }}
        >
          <p className="text-sm text-muted-foreground">{detalle}</p>
          <div className="space-y-1">
            <Label htmlFor="adq-dialogo-texto">{etiqueta}</Label>
            {numerico ? (
              <Input id="adq-dialogo-texto" inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value)} className="font-mono-tabular" autoFocus />
            ) : (
              <Textarea id="adq-dialogo-texto" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado || !valido}>
              {boton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

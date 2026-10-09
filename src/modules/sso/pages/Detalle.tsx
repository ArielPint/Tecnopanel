import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import {
  actualizarHallazgo,
  cambiarEstado,
  eliminarHallazgo,
  listarBitacora,
  listarEvidencias,
  obtenerHallazgo,
  type EdicionHallazgo,
} from '../lib/api'
import { fmtFecha, fmtFechaHora } from '../lib/estados'
import { exportarFichaPdf } from '../lib/export'
import type { EstadoSso, EventoBitacora, Evidencia, Hallazgo } from '../lib/tipos'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { RUTA } from '../lib/rutas'
import { useDatosSso } from '../hooks/useDatosSso'
import { EstadoBadge, VencidoBadge } from '../components/EstadoBadge'
import { Evidencias } from '../components/Evidencias'
import { Bitacora } from '../components/Bitacora'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export default function Detalle() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, puedeEn, userId } = usePermisosSso('hallazgos')
  const { areas, responsables, nombreUsuario, nombreArea } = useDatosSso()

  const [hallazgo, setHallazgo] = useState<Hallazgo | null>(null)
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [bitacora, setBitacora] = useState<EventoBitacora[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [accion, setAccion] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [edicion, setEdicion] = useState<EdicionHallazgo>({})
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [h, ev, bi] = await Promise.all([obtenerHallazgo(id), listarEvidencias(id), listarBitacora(id)])
      setHallazgo(h)
      setEvidencias(ev)
      setBitacora(bi)
      setAccion(h?.accion_correctiva ?? '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el hallazgo')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (error || !hallazgo) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.hallazgos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a hallazgos
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{error ?? 'El hallazgo no existe o no tienes acceso.'}</p>
      </div>
    )
  }

  const h = hallazgo
  // Mismas reglas que sso_hallazgo_before_update() y sso_cambiar_estado(): la base las exige igual.
  const esValidador = puede('aprobar')
  const esEncargado = h.responsable_user_id === userId && puede('editar')
  const enManosDelEncargado = h.estado === 'abierto' || h.estado === 'en_proceso'
  const puedeResponder = enManosDelEncargado && (esEncargado || esValidador)
  const fotosCierre = evidencias.filter((e) => e.tipo === 'cierre')
  const accionGuardada = (h.accion_correctiva ?? '').trim()
  const faltaParaVerificar = !accionGuardada ? 'Guarda la acción correctiva' : fotosCierre.length === 0 ? 'Sube al menos una foto de la corrección' : null

  async function ejecutar(fn: () => Promise<void>, ok: string) {
    setTrabajando(true)
    try {
      await fn()
      toast.success(ok)
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setTrabajando(false)
    }
  }

  const irA = (estado: EstadoSso, ok: string, comentario?: string) => ejecutar(() => cambiarEstado(h.id, estado, comentario), ok)

  function abrirEdicion() {
    setEdicion({
      area_id: h.area_id,
      ubicacion: h.ubicacion,
      descripcion: h.descripcion,
      responsable_user_id: h.responsable_user_id,
      fecha_compromiso: h.fecha_compromiso,
    })
    setEditando(true)
  }

  async function guardarEdicion() {
    if (!edicion.ubicacion?.trim() || !edicion.descripcion?.trim()) {
      toast.error('Ubicación y descripción son obligatorias')
      return
    }
    if (edicion.fecha_compromiso && edicion.fecha_compromiso < h.fecha_deteccion) {
      toast.error('El plazo no puede ser anterior a la fecha de detección')
      return
    }
    // Solo lo que cambió: así la bitácora registra cambios reales y no todos los campos
    const cambios = Object.fromEntries(
      Object.entries(edicion).filter(([k, v]) => (h as unknown as Record<string, unknown>)[k] !== v),
    ) as EdicionHallazgo
    if (Object.keys(cambios).length === 0) {
      setEditando(false)
      return
    }
    await ejecutar(() => actualizarHallazgo(h.id, cambios), 'Hallazgo actualizado')
    setEditando(false)
  }

  async function fichaPdf() {
    setGenerandoPdf(true)
    try {
      await exportarFichaPdf(h, evidencias, bitacora, nombreUsuario, nombreArea)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el PDF')
    } finally {
      setGenerandoPdf(false)
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar el hallazgo N° ${h.numero} con sus fotos y bitácora? No se puede deshacer.`)) return
    try {
      await eliminarHallazgo(h, evidencias)
      toast.success(`Hallazgo N° ${h.numero} eliminado`)
      navigate(RUTA.hallazgos, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.hallazgos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a hallazgos
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold">Hallazgo N° {h.numero}</h2>
        <EstadoBadge estado={h.estado} />
        {h.vencido && <VencidoBadge dias={h.dias_atraso} />}
        <div className="ml-auto flex gap-2">
          {puede('exportar') && (
            <Button size="sm" variant="outline" disabled={generandoPdf} onClick={fichaPdf}>
              <FileText className="mr-1 h-4 w-4" /> {generandoPdf ? 'Generando…' : 'Ficha PDF'}
            </Button>
          )}
          {esValidador && h.estado !== 'cerrado' && (
            <Button size="sm" variant="outline" onClick={abrirEdicion}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
              <Dato label="Área">{nombreArea(h.area_id)}</Dato>
              <Dato label="Ubicación">{h.ubicacion}</Dato>
              <div className="sm:col-span-2">
                <Dato label="Descripción">
                  <p className="whitespace-pre-wrap">{h.descripcion}</p>
                </Dato>
              </div>
              <Dato label="Detectado">
                {fmtFecha(h.fecha_deteccion)} por {nombreUsuario(h.reportado_por)}
                {h.origen_inspeccion_id &&
                  (puedeEn('inspecciones', 'ver') ? (
                    <Link to={RUTA.inspeccion(h.origen_inspeccion_id)} className="ml-1 text-xs font-semibold text-primary hover:underline">
                      · en una inspección
                    </Link>
                  ) : (
                    <span className="ml-1 text-xs text-muted-foreground">· en una inspección</span>
                  ))}
              </Dato>
              <Dato label="Responsable">{nombreUsuario(h.responsable_user_id)}</Dato>
              <Dato label="Plazo de cumplimiento">{fmtFecha(h.fecha_compromiso)}</Dato>
              {h.estado === 'cerrado' && (
                <Dato label="Cierre">
                  {fmtFechaHora(h.fecha_cierre)} por {nombreUsuario(h.cerrado_por)} ·{' '}
                  {h.cerrado_en_plazo ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">en plazo</span>
                  ) : (
                    <span className="font-semibold text-red-700 dark:text-red-400">fuera de plazo ({h.dias_atraso} días)</span>
                  )}
                </Dato>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <Evidencias
                hallazgoId={h.id}
                tipo="deteccion"
                titulo="Fotos de la condición detectada"
                evidencias={evidencias.filter((e) => e.tipo === 'deteccion')}
                userId={userId}
                puedeSubir={h.estado !== 'cerrado' && puede('crear')}
                puedeBorrar={(e) => h.estado !== 'cerrado' && (esValidador || (enManosDelEncargado && e.subido_por === userId))}
                nombreUsuario={nombreUsuario}
                onCambio={cargar}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-2">
                <p className="text-sm font-bold">Acción correctiva</p>
                {puedeResponder ? (
                  <>
                    <Textarea value={accion} onChange={(e) => setAccion(e.target.value)} rows={3} placeholder="Qué se hizo para corregir la condición" />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={trabajando || accion.trim() === accionGuardada}
                      onClick={() => ejecutar(() => actualizarHallazgo(h.id, { accion_correctiva: accion.trim() || null }), 'Acción correctiva guardada')}
                    >
                      Guardar acción correctiva
                    </Button>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{h.accion_correctiva || <span className="text-muted-foreground">Sin registrar.</span>}</p>
                )}
              </div>
              <Evidencias
                hallazgoId={h.id}
                tipo="cierre"
                titulo="Fotos de la corrección"
                evidencias={fotosCierre}
                userId={userId}
                puedeSubir={puedeResponder}
                puedeBorrar={(e) => h.estado !== 'cerrado' && (esValidador || (enManosDelEncargado && e.subido_por === userId))}
                nombreUsuario={nombreUsuario}
                onCambio={cargar}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-bold">Acciones</p>
              {h.estado === 'abierto' && (esEncargado || esValidador) && (
                <Button className="w-full" variant="outline" disabled={trabajando} onClick={() => irA('en_proceso', 'Hallazgo en proceso')}>
                  Marcar en proceso
                </Button>
              )}
              {puedeResponder && (
                <div className="space-y-1">
                  <Button
                    className="w-full"
                    disabled={trabajando || !!faltaParaVerificar}
                    onClick={() => irA('pend_verificacion', 'Enviado a verificación')}
                  >
                    Enviar a verificación
                  </Button>
                  {faltaParaVerificar && <p className="text-xs text-muted-foreground">{faltaParaVerificar} para poder enviarlo.</p>}
                </div>
              )}
              {h.estado === 'pend_verificacion' && esValidador && (
                <>
                  <Button className="w-full" disabled={trabajando} onClick={() => irA('cerrado', `Hallazgo N° ${h.numero} cerrado`)}>
                    Validar y cerrar
                  </Button>
                  <Button className="w-full" variant="outline" disabled={trabajando} onClick={() => setRechazando(true)}>
                    Rechazar cierre
                  </Button>
                </>
              )}
              {h.estado === 'pend_verificacion' && !esValidador && (
                <p className="text-sm text-muted-foreground">Esperando la validación de Prevención de Riesgos.</p>
              )}
              {h.estado === 'cerrado' && <p className="text-sm text-muted-foreground">Hallazgo cerrado. Queda como registro histórico.</p>}
              {enManosDelEncargado && !esEncargado && !esValidador && (
                <p className="text-sm text-muted-foreground">Lo gestiona {nombreUsuario(h.responsable_user_id)}.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <Bitacora hallazgoId={h.id} eventos={bitacora} userId={userId} nombreUsuario={nombreUsuario} onCambio={cargar} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar hallazgo N° {h.numero}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Área</Label>
                <select
                  value={edicion.area_id ?? ''}
                  onChange={(e) => setEdicion((x) => ({ ...x, area_id: e.target.value || null }))}
                  className={selectClase}
                >
                  <option value="">Sin área</option>
                  {areas
                    .filter((a) => a.activa || a.id === h.area_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ubicación</Label>
                <Input value={edicion.ubicacion ?? ''} onChange={(e) => setEdicion((x) => ({ ...x, ubicacion: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción</Label>
              <Textarea value={edicion.descripcion ?? ''} onChange={(e) => setEdicion((x) => ({ ...x, descripcion: e.target.value }))} rows={4} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Responsable</Label>
                <select
                  value={edicion.responsable_user_id ?? ''}
                  onChange={(e) => setEdicion((x) => ({ ...x, responsable_user_id: e.target.value }))}
                  className={selectClase}
                >
                  {responsables.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Plazo de cumplimiento</Label>
                <Input
                  type="date"
                  value={edicion.fecha_compromiso ?? ''}
                  min={h.fecha_deteccion}
                  onChange={(e) => setEdicion((x) => ({ ...x, fecha_compromiso: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicion} disabled={trabajando}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rechazando} onOpenChange={setRechazando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar el cierre</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Motivo (lo verá el responsable)</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={trabajando || !motivo.trim()}
              onClick={async () => {
                await irA('en_proceso', 'Cierre rechazado: vuelve al responsable', motivo)
                setRechazando(false)
                setMotivo('')
              }}
            >
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

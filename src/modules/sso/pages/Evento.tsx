import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileText, Lock, Pencil, Plus, Trash2, Unlock, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  CON_LESION,
  ESTADO_EVENTO,
  MUTUAL,
  TIPO_EVENTO,
  agregarMedida,
  eliminarEvento,
  guardarEvento,
  listarArchivos,
  listarMedidas,
  obtenerEvento,
  subirArchivo,
  urlArchivo,
  type ArchivoEvento,
  type EventoV,
  type MedidaResumen,
} from '../lib/apiAccidentes'
import { obtenerTrabajador } from '../lib/apiTrabajadores'
import { ESTADO_META, fmtFecha, fmtFechaHora, hoyChile, sumarDias } from '../lib/estados'
import { formatearRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import type { EstadoSso } from '../lib/tipos'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { GravedadBadge } from './Eventos'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children || '—'}</div>
    </div>
  )
}

export default function Evento() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, puedeEn, userId } = usePermisosSso('accidentes')
  const { nombreArea, nombreUsuario, responsables } = useDatosSso()
  const [ev, setEv] = useState<EventoV | null>(null)
  const [afectado, setAfectado] = useState<TrabajadorV | null>(null)
  const [medidas, setMedidas] = useState<MedidaResumen[]>([])
  const [archivos, setArchivos] = useState<ArchivoEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [causasI, setCausasI] = useState('')
  const [causasB, setCausasB] = useState('')
  const [medida, setMedida] = useState({ descripcion: '', responsable: '', plazo: sumarDias(hoyChile(), 14) })

  const cargar = useCallback(async () => {
    try {
      const e = await obtenerEvento(id)
      setEv(e)
      if (e) {
        setCausasI(e.causas_inmediatas ?? '')
        setCausasB(e.causas_basicas ?? '')
        const [t, m, a] = await Promise.all([
          e.trabajador_id ? obtenerTrabajador(e.trabajador_id) : null,
          listarMedidas(e.id).catch(() => []),
          listarArchivos(e.id),
        ])
        setAfectado(t)
        setMedidas(m)
        setArchivos(a)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!ev) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.accidentes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a accidentes e incidentes
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El evento no existe o no tienes acceso.</p>
      </div>
    )
  }
  const e = ev
  const investiga = puede('editar') || puede('aprobar')
  const cerrado = e.estado === 'cerrado'
  const puedeCompletar = (investiga && !cerrado) || puede('aprobar') || (e.reportado_por === userId && e.estado === 'reportado' && puede('crear'))
  const conLesion = CON_LESION.includes(e.tipo)
  const grave = conLesion && (e.gravedad === 'grave' || e.gravedad === 'fatal')

  async function ejecutar(fn: () => Promise<unknown>, ok: string) {
    setTrabajando(true)
    try {
      await fn()
      toast.success(ok)
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar')
    } finally {
      setTrabajando(false)
    }
  }

  const guardarInvestigacion = () =>
    ejecutar(
      () =>
        guardarEvento(e.id, {
          causas_inmediatas: causasI.trim() || null,
          causas_basicas: causasB.trim() || null,
          investigado_por: userId,
          estado: e.estado === 'reportado' ? 'en_investigacion' : e.estado,
        }),
      'Investigación guardada',
    )

  async function onMedida(f: FormEvent) {
    f.preventDefault()
    if (!medida.descripcion.trim() || !medida.responsable) {
      toast.error('Describe la medida y elige el responsable')
      return
    }
    await ejecutar(() => agregarMedida(e.id, medida.descripcion.trim(), medida.responsable, medida.plazo), 'Medida creada como hallazgo')
    setMedida((m) => ({ ...m, descripcion: '' }))
  }

  async function abrir(path: string) {
    try {
      window.open(await urlArchivo(path), '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar el evento N° ${e.numero}? Afecta las tasas. Las medidas (hallazgos) se conservan.`)) return
    try {
      await eliminarEvento(e.id)
      toast.success('Evento eliminado')
      navigate(RUTA.accidentes, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.accidentes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a accidentes e incidentes
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold">
          N° {e.numero} · {TIPO_EVENTO[e.tipo].label}
        </h1>
        <GravedadBadge gravedad={e.gravedad} />
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_EVENTO[e.estado].clase)}>{ESTADO_EVENTO[e.estado].label}</span>
        <div className="ml-auto flex gap-2">
          {puedeCompletar && (
            <Button size="sm" variant="outline" onClick={() => navigate(RUTA.editarEvento(e.id))}>
              <Pencil className="mr-1 h-4 w-4" /> Completar datos
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      {grave && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Accidente {e.gravedad}</p>
            <p className="text-xs">
              {e.autoridad_notificada_en
                ? `Inspección del Trabajo y Seremi de Salud notificadas el ${fmtFechaHora(e.autoridad_notificada_en)}.`
                : 'Falta registrar la notificación inmediata a la Inspección del Trabajo y a la Seremi de Salud.'}
            </p>
          </div>
          {!e.autoridad_notificada_en && investiga && (
            <Button size="sm" variant="outline" disabled={trabajando} onClick={() => ejecutar(() => guardarEvento(e.id, { autoridad_notificada_en: new Date().toISOString() }), 'Notificación registrada')}>
              Registrar que se notificó
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-4">
          <Dato label="Ocurrido">{fmtFechaHora(e.ocurrido_en)}</Dato>
          <Dato label="Área">{e.area_id ? nombreArea(e.area_id) : null}</Dato>
          <Dato label="Lugar">{e.lugar}</Dato>
          <Dato label="Empresa">{e.empresa}</Dato>
          <div className="sm:col-span-2">
            <Dato label={conLesion ? 'Afectado' : 'Involucrado'}>
              {afectado && (
                <Link to={RUTA.trabajador(afectado.id)} className="hover:underline">
                  {afectado.apellidos}, {afectado.nombres} · {formatearRut(afectado.rut)} · {afectado.cargo ?? 'sin cargo'}
                </Link>
              )}
            </Dato>
          </div>
          <Dato label="Reportó">{nombreUsuario(e.reportado_por)}</Dato>
          <Dato label="Testigos">{e.testigos}</Dato>
          <div className="sm:col-span-4">
            <Dato label="Qué ocurrió">
              <p className="whitespace-pre-wrap">{e.descripcion}</p>
            </Dato>
          </div>
        </CardContent>
      </Card>

      {conLesion && (
        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-4">
            <p className="text-sm font-bold sm:col-span-4">Lesión y atención · {MUTUAL}</p>
            <Dato label="Lesión">{e.lesion}</Dato>
            <Dato label="Parte del cuerpo">{e.parte_cuerpo}</Dato>
            <Dato label="Días perdidos">{e.dias_perdidos}</Dato>
            <Dato label="Alta">{e.fecha_alta && fmtFecha(e.fecha_alta)}</Dato>
            <Dato label="Folio DIAT / DIEP">{e.diat_folio}</Dato>
            <Dato label="Fecha DIAT">{e.diat_fecha && fmtFecha(e.diat_fecha)}</Dato>
            {!e.diat_folio && <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-2">Falta el folio de la DIAT/DIEP ingresada a la Mutual.</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Investigación de causas</p>
              {e.investigado_por && <p className="text-xs text-muted-foreground">Investigó {nombreUsuario(e.investigado_por)}</p>}
            </div>
            {investiga && !cerrado ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ci">Causas inmediatas (actos y condiciones inseguras)</Label>
                  <Textarea id="ci" rows={3} value={causasI} onChange={(x) => setCausasI(x.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cb">Causas básicas (factores personales y del trabajo)</Label>
                  <Textarea id="cb" rows={3} value={causasB} onChange={(x) => setCausasB(x.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={trabajando} onClick={guardarInvestigacion}>
                    Guardar investigación
                  </Button>
                  {puede('aprobar') && (
                    <Button
                      size="sm"
                      disabled={trabajando || !causasI.trim() || !causasB.trim()}
                      onClick={() =>
                        ejecutar(
                          () => guardarEvento(e.id, { causas_inmediatas: causasI.trim(), causas_basicas: causasB.trim(), estado: 'cerrado', investigado_por: e.investigado_por ?? userId }),
                          'Investigación cerrada',
                        )
                      }
                    >
                      <Lock className="mr-1 h-4 w-4" /> Cerrar investigación
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <Dato label="Causas inmediatas">
                  <p className="whitespace-pre-wrap">{e.causas_inmediatas}</p>
                </Dato>
                <Dato label="Causas básicas">
                  <p className="whitespace-pre-wrap">{e.causas_basicas}</p>
                </Dato>
                {cerrado && (
                  <p className="text-xs text-muted-foreground">
                    Cerrada el {fmtFechaHora(e.cerrado_en)} por {nombreUsuario(e.cerrado_por)}.
                  </p>
                )}
                {cerrado && puede('aprobar') && (
                  <Button size="sm" variant="outline" disabled={trabajando} onClick={() => ejecutar(() => guardarEvento(e.id, { estado: 'en_investigacion' }), 'Investigación reabierta')}>
                    <Unlock className="mr-1 h-4 w-4" /> Reabrir
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-bold">Medidas correctivas</p>
            {puedeEn('hallazgos', 'ver') ? (
              medidas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin medidas todavía.</p>
              ) : (
                <ul className="divide-y">
                  {medidas.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <Link to={RUTA.hallazgo(m.id)} className="min-w-0 flex-1 truncate hover:underline">
                        N° {m.numero} · {m.descripcion.replace(/^Medida correctiva \(evento N° \d+\): /, '')}
                      </Link>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {nombreUsuario(m.responsable_user_id)} · {fmtFecha(m.fecha_compromiso)}
                      </span>
                      <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', m.vencido ? 'bg-red-600 text-white' : ESTADO_META[m.estado as EstadoSso].clase)}>
                        {m.vencido ? 'Vencida' : ESTADO_META[m.estado as EstadoSso].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                {e.medidas} medida{e.medidas === 1 ? '' : 's'} ({e.medidas_pendientes} pendiente{e.medidas_pendientes === 1 ? '' : 's'}). Se gestionan en Hallazgos.
              </p>
            )}
            {investiga && (
              <form onSubmit={onMedida} className="space-y-2 border-t pt-3">
                <Input value={medida.descripcion} onChange={(x) => setMedida((m) => ({ ...m, descripcion: x.target.value }))} placeholder="Nueva medida (ej: instalar baranda en plataforma 2)" />
                <div className="grid grid-cols-[1fr_150px_auto] gap-2">
                  <select value={medida.responsable} onChange={(x) => setMedida((m) => ({ ...m, responsable: x.target.value }))} className={selectClase} aria-label="Responsable">
                    <option value="">Responsable…</option>
                    {responsables.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.email}
                      </option>
                    ))}
                  </select>
                  <Input type="date" value={medida.plazo} min={hoyChile()} onChange={(x) => setMedida((m) => ({ ...m, plazo: x.target.value }))} aria-label="Plazo" />
                  <Button type="submit" size="sm" disabled={trabajando}>
                    <Plus className="mr-1 h-4 w-4" /> Agregar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Cada medida se crea como hallazgo: el responsable la cierra con evidencia y Prevención la valida.</p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Fotos y documentos</p>
            {puedeCompletar && (
              <label className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                <Upload className="h-3.5 w-3.5" /> Agregar
                <input
                  type="file"
                  multiple
                  hidden
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(x) => {
                    const fs = Array.from(x.target.files ?? [])
                    if (fs.length) ejecutar(async () => { for (const a of fs) await subirArchivo(e.id, a) }, 'Archivos agregados')
                  }}
                />
              </label>
            )}
          </div>
          {archivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin archivos.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {archivos.map((a) => (
                <li key={a.path}>
                  <button type="button" onClick={() => abrir(a.path)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent">
                    <FileText className="h-4 w-4" /> {a.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

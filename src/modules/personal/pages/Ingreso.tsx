import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CheckCircle2, Circle, FileText, Lock, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha, fmtFechaHora } from '@/modules/sso/lib/estados'
import CamposIngreso, { limpiarDatos, validarDatos } from '../components/CamposIngreso'
import CamposRenta, { rentaVacia } from '../components/CamposRenta'
import { usePermisosIngreso } from '../hooks/usePermisosIngreso'
import { AREA_TAREA, DOCUMENTOS, REQUERIMIENTOS, SITUACION, TIPO_CONTRATO, docsRequeridos } from '../lib/catalogos'
import {
  ARCHIVOS_ACEPTADOS,
  abrirArchivo,
  actualizarIngreso,
  anularIngreso,
  cerrarIngreso,
  comentar,
  completarTarea,
  eliminarArchivo,
  guardarRemuneracion,
  listarArchivos,
  listarAreas,
  listarBitacora,
  listarTareas,
  obtenerIngreso,
  obtenerRemuneracion,
  reabrirTarea,
  subirDocumento,
  subirEvidencia,
  type Archivo,
  type Area,
  type DatosIngreso,
  type EventoBitacora,
  type Ingreso as IngresoT,
  type Remuneracion,
  type Tarea,
} from '../lib/api'
import { RUTA } from '../lib/rutas'
import { Avance } from './Ingresos'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm">{children || '—'}</div>
    </div>
  )
}

/** Botón que abre el selector de archivos y entrega el elegido. */
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
      <span className="shrink-0 text-muted-foreground">{fmtFecha(a.created_at.slice(0, 10))}</span>
      {puedeBorrar && (
        <button type="button" onClick={onBorrar} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${a.nombre}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export default function Ingreso() {
  const { id = '' } = useParams<{ id: string }>()
  const { tiene, userId } = usePermisosIngreso()
  const [ing, setIng] = useState<IngresoT | null>(null)
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [bitacora, setBitacora] = useState<EventoBitacora[]>([])
  const [renta, setRenta] = useState<Remuneracion | null>(null)
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [editar, setEditar] = useState(false)
  const [anular, setAnular] = useState(false)
  const [cerrar, setCerrar] = useState(false)
  const [completar, setCompletar] = useState<Tarea | null>(null)
  const [comentario, setComentario] = useState('')

  const esRrhh = tiene('rrhh')

  const cargar = useCallback(async () => {
    try {
      const [i, t, a, b] = await Promise.all([obtenerIngreso(id), listarTareas(id), listarArchivos(id), listarBitacora(id)])
      setIng(i)
      setTareas(t)
      setArchivos(a)
      setBitacora(b)
      if (esRrhh) setRenta((await obtenerRemuneracion(id)) ?? rentaVacia())
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [id, esRrhh])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<void>, exito: string) {
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

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!ing) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a ingresos
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El ingreso no existe o no tienes acceso.</p>
      </div>
    )
  }
  const i = ing
  const abierto = i.estado === 'en_proceso'
  const gestiona = abierto && (esRrhh || tiene('coordinador'))
  const veDocs = esRrhh || tiene('coordinador')
  const puedeAnular = abierto && (gestiona || i.creado_por === userId)
  const requeridos = docsRequeridos(i.req_vehiculo)
  const docs = archivos.filter((a) => a.tipo_doc)
  const tareaHecha = (tareaId: string | null) => !!tareas.find((t) => t.id === tareaId)?.hecha
  const puedeBorrar = (a: Archivo) => abierto && (esRrhh || a.subido_por === userId) && !tareaHecha(a.tarea_id)
  const pedidos = REQUERIMIENTOS.filter((r) => i[r.key]).map((r) => r.titulo)

  function borrar(a: Archivo) {
    if (!window.confirm(`¿Eliminar "${a.nombre}"?`)) return
    hacer(() => eliminarArchivo(a), 'Archivo eliminado')
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a ingresos
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-tabular text-xs text-muted-foreground">Ingreso N° {i.numero}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold">{i.nombre}</h1>
            <Badge variant={SITUACION[i.situacion].variant}>{SITUACION[i.situacion].label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {i.cargo} · {i.area} · {i.sucursal} · ingresa el <span className="font-mono-tabular text-foreground">{fmtFecha(i.fecha_ingreso)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gestiona && (
            <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
          )}
          {puedeAnular && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setAnular(true)}>
              <Ban className="mr-1 h-4 w-4" /> Anular
            </Button>
          )}
          {esRrhh && abierto && (
            <Button size="sm" disabled={i.situacion !== 'listo'} onClick={() => setCerrar(true)} title={i.situacion !== 'listo' ? 'Faltan documentos o tareas' : undefined}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Cerrar ingreso
            </Button>
          )}
        </div>
      </div>

      {i.estado === 'anulado' && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          Anulado el {fmtFechaHora(i.fecha_cierre)} por {i.cerrado_por_nombre ?? '—'}. Motivo: {i.motivo_anulacion}
        </p>
      )}
      {i.estado === 'ingresado' && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          Cerrado el {fmtFechaHora(i.fecha_cierre)} por {i.cerrado_por_nombre ?? '—'}.{i.buk_id && <> Ficha en BUK: <b className="font-mono-tabular">{i.buk_id}</b>.</>}
        </p>
      )}

      <Card>
        <CardContent className="pt-4">
          <Avance i={i} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <h2 className="text-sm font-bold sm:col-span-2">Datos</h2>
              <Dato label="RUT">
                <span className="font-mono-tabular">{formatearRut(i.rut)}</span>
              </Dato>
              <Dato label="Teléfono">{i.telefono}</Dato>
              <Dato label="Correo personal">{i.email}</Dato>
              <Dato label="Contrato">{TIPO_CONTRATO[i.tipo_contrato]}</Dato>
              <Dato label="Jornada">{i.jornada}</Dato>
              <Dato label="Tallas">{i.tallas}</Dato>
              <Dato label="Pidió">{i.creado_por_nombre}</Dato>
              <Dato label="Solicitada el">{fmtFechaHora(i.created_at)}</Dato>
              <div className="sm:col-span-2">
                <Dato label="Necesita">{pedidos.join(' · ') || 'Solo contrato'}</Dato>
              </div>
              {i.observacion && (
                <div className="sm:col-span-2">
                  <Dato label="Observaciones">
                    <span className="whitespace-pre-wrap">{i.observacion}</span>
                  </Dato>
                </div>
              )}
            </CardContent>
          </Card>

          {esRrhh && renta && <TarjetaRenta ingresoId={i.id} inicial={renta} onGuardado={cargar} />}

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">Documentos del trabajador</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.min(i.docs_ok, i.docs_requeridos)}/{i.docs_requeridos} requeridos
                </span>
              </div>
              {!veDocs ? (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" /> Los documentos personales solo los ven RRHH y el coordinador de la sucursal.
                </p>
              ) : (
                <div className="divide-y">
                  {DOCUMENTOS.filter((d) => d.key !== 'licencia' || requeridos.includes(d.key) || docs.some((a) => a.tipo_doc === d.key)).map((d) => {
                    const propios = docs.filter((a) => a.tipo_doc === d.key)
                    const requerido = requeridos.includes(d.key)
                    return (
                      <div key={d.key} className="flex items-start gap-2.5 py-2.5">
                        {propios.length ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', requerido ? 'text-warning' : 'text-muted-foreground/50')} />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium">
                            {d.label}
                            {!requerido && <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>}
                          </p>
                          {propios.map((a) => (
                            <FilaArchivo key={a.id} a={a} puedeBorrar={puedeBorrar(a)} onBorrar={() => borrar(a)} />
                          ))}
                        </div>
                        {gestiona && (
                          <BotonSubir
                            label={propios.length ? 'Agregar' : 'Subir'}
                            disabled={ocupado}
                            onArchivo={(f) => hacer(() => subirDocumento(i.id, d.key, f), 'Documento cargado')}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">Tareas por área</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {i.tareas_hechas}/{i.tareas_total}
                </span>
              </div>
              <div className="divide-y">
                {tareas.map((t) => {
                  const evidencias = archivos.filter((a) => a.tarea_id === t.id)
                  const activa = abierto && t.puedo
                  return (
                    <div key={t.id} className="flex items-start gap-2.5 py-2.5">
                      {t.hecha ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold">{AREA_TAREA[t.area]}</span>
                          <span className="text-sm font-medium">{t.titulo}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t.hecha
                            ? `Hecha el ${fmtFechaHora(t.fecha_hecha)} por ${t.hecha_por_nombre ?? '—'}${t.comentario ? ` · ${t.comentario}` : ''}`
                            : t.requiere_evidencia
                              ? 'Requiere adjuntar evidencia firmada'
                              : 'Pendiente'}
                        </p>
                        {/* la evidencia del contrato no le llega a quien no es RRHH (RLS) */}
                        {evidencias.map((a) => (
                          <FilaArchivo key={a.id} a={a} puedeBorrar={puedeBorrar(a)} onBorrar={() => borrar(a)} />
                        ))}
                      </div>
                      {activa && (
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {!t.hecha && t.requiere_evidencia && (
                            <BotonSubir
                              label={evidencias.length ? 'Agregar' : 'Evidencia'}
                              disabled={ocupado}
                              onArchivo={(f) => hacer(() => subirEvidencia(i.id, t.id, f), 'Evidencia adjunta')}
                            />
                          )}
                          {!t.hecha ? (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={ocupado || (t.requiere_evidencia && evidencias.length === 0)}
                              title={t.requiere_evidencia && evidencias.length === 0 ? 'Adjunta primero la evidencia' : undefined}
                              onClick={() => setCompletar(t)}
                            >
                              Marcar hecha
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              disabled={ocupado}
                              onClick={() => hacer(() => reabrirTarea(t.id), 'Tarea reabierta')}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
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
                  if (await hacer(() => comentar(i.id, comentario.trim()), 'Comentario agregado')) setComentario('')
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

      {editar && (
        <DialogoEditar
          ingreso={i}
          onCerrar={() => setEditar(false)}
          onGuardar={async (d) => {
            if (await hacer(() => actualizarIngreso(i.id, d), 'Solicitud actualizada')) setEditar(false)
          }}
          ocupado={ocupado}
        />
      )}

      <DialogoTexto
        abierto={anular}
        titulo={`Anular el ingreso N° ${i.numero}`}
        detalle="El ingreso queda como registro y no se puede reabrir. Se avisa a quien lo pidió, al coordinador y a RRHH."
        etiqueta="Motivo"
        requerido
        boton="Anular ingreso"
        ocupado={ocupado}
        onCerrar={() => setAnular(false)}
        onAceptar={async (motivo) => {
          if (await hacer(() => anularIngreso(i.id, motivo), 'Ingreso anulado')) setAnular(false)
        }}
      />

      <DialogoTexto
        abierto={cerrar}
        titulo={`Cerrar el ingreso N° ${i.numero}`}
        detalle="Crea primero la ficha del trabajador en BUK con estos datos y documentos, y anota aquí su identificador. Se avisa a quien lo pidió y al coordinador."
        etiqueta="Id o N° de ficha en BUK"
        boton="Cerrar ingreso"
        ocupado={ocupado}
        onCerrar={() => setCerrar(false)}
        onAceptar={async (buk) => {
          if (await hacer(() => cerrarIngreso(i.id, buk), 'Ingreso cerrado')) setCerrar(false)
        }}
      />

      <DialogoTexto
        abierto={!!completar}
        titulo={completar ? `${AREA_TAREA[completar.area]}: ${completar.titulo}` : ''}
        detalle="Queda registrado quién la hizo y cuándo."
        etiqueta="Comentario (opcional)"
        boton="Marcar hecha"
        ocupado={ocupado}
        onCerrar={() => setCompletar(null)}
        onAceptar={async (texto) => {
          if (completar && (await hacer(() => completarTarea(completar.id, texto), 'Tarea hecha'))) setCompletar(null)
        }}
      />
    </div>
  )
}

function TarjetaRenta({ ingresoId, inicial, onGuardado }: { ingresoId: string; inicial: Remuneracion; onGuardado: () => void }) {
  const [renta, setRenta] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setRenta(inicial), [inicial])
  const cambio = JSON.stringify(renta) !== JSON.stringify(inicial)

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <h2 className="text-sm font-bold">Renta</h2>
        <CamposRenta renta={renta} onChange={setRenta} />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!cambio || guardando}
            onClick={async () => {
              setGuardando(true)
              try {
                await guardarRemuneracion(ingresoId, renta)
                toast.success('Renta guardada')
                onGuardado()
              } catch (err) {
                toast.error(msg(err, 'No se pudo guardar la renta'))
              } finally {
                setGuardando(false)
              }
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar renta'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DialogoEditar({
  ingreso,
  onCerrar,
  onGuardar,
  ocupado,
}: {
  ingreso: IngresoT
  onCerrar: () => void
  onGuardar: (d: DatosIngreso) => void
  ocupado: boolean
}) {
  const [datos, setDatos] = useState<DatosIngreso>(() => ({
    sucursal: ingreso.sucursal,
    area: ingreso.area,
    cargo: ingreso.cargo,
    fecha_ingreso: ingreso.fecha_ingreso,
    tipo_contrato: ingreso.tipo_contrato,
    jornada: ingreso.jornada,
    nombre: ingreso.nombre,
    rut: formatearRut(ingreso.rut),
    telefono: ingreso.telefono,
    email: ingreso.email,
    tallas: ingreso.tallas,
    req_ti: ingreso.req_ti,
    req_epp: ingreso.req_epp,
    req_uniforme: ingreso.req_uniforme,
    req_induccion: ingreso.req_induccion,
    req_vehiculo: ingreso.req_vehiculo,
    observacion: ingreso.observacion,
  }))
  const [problema, setProblema] = useState<string | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  useEffect(() => {
    listarAreas()
      .then(setAreas)
      .catch(() => setAreas([]))
  }, [])

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Editar solicitud N° {ingreso.numero}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const p = validarDatos(datos, false)
            setProblema(p)
            if (!p) onGuardar(limpiarDatos(datos))
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <p className="mb-3 text-xs text-muted-foreground">
              Si quitas un requerimiento, su tarea se elimina mientras no tenga avance. Si agregas uno, se avisa al área.
            </p>
            <CamposIngreso datos={datos} onChange={setDatos} nueva={false} areas={areas} />
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

function DialogoTexto({
  abierto,
  titulo,
  detalle,
  etiqueta,
  requerido,
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
  boton: string
  ocupado: boolean
  onCerrar: () => void
  onAceptar: (texto: string) => void
}) {
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (abierto) setTexto('')
  }, [abierto])

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
            if (requerido && !texto.trim()) return
            onAceptar(texto.trim())
          }}
        >
          <p className="text-sm text-muted-foreground">{detalle}</p>
          <div className="space-y-1">
            <Label htmlFor="ip-dialogo-texto">{etiqueta}</Label>
            <Textarea id="ip-dialogo-texto" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado || (requerido && !texto.trim())}>
              {boton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

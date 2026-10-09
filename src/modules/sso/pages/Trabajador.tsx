import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Lock, Pencil, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import {
  actualizarTrabajador,
  eliminarExamen,
  eliminarTrabajador,
  listarExamenes,
  obtenerTrabajador,
  registrarExamen,
  urlArchivoExamen,
} from '../lib/apiTrabajadores'
import { fmtFecha, hoyChile } from '../lib/estados'
import { formatearRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import { RESULTADOS, type Examen, type ResultadoExamen, type SituacionExamen, type TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'
import { FormTrabajador } from '../components/FormTrabajador'
import { CapacitacionesTrabajador } from '../components/CapacitacionesTrabajador'
import { EppTrabajador } from '../components/EppTrabajador'
import { EventosTrabajador } from '../components/EventosTrabajador'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

const SITUACION: Record<SituacionExamen, { label: string; clase: string }> = {
  vigente: { label: 'Vigente', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  por_vencer: { label: 'Por vencer', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  vencido: { label: 'Vencido', clase: 'bg-red-600 text-white' },
}
const RESULTADO_LABEL = Object.fromEntries(RESULTADOS.map((r) => [r.key, r.label])) as Record<ResultadoExamen, string>

function situacionDe(e: Examen, hoy: string): SituacionExamen {
  if (!e.vencimiento) return 'vigente'
  if (e.vencimiento < hoy) return 'vencido'
  const en30 = new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + 30)).toISOString().slice(0, 10)
  return e.vencimiento <= en30 ? 'por_vencer' : 'vigente'
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children || '—'}</div>
    </div>
  )
}

export default function Trabajador() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, puedeEn } = usePermisosSso('trabajadores')
  const { areas, nombreArea } = useDatosSso()
  const { empresas, tiposExamen } = useCatalogosTrabajadores()
  const salud = puede('aprobar')
  const hoy = hoyChile()

  const [t, setT] = useState<TrabajadorV | null>(null)
  const [examenes, setExamenes] = useState<Examen[]>([])
  const [loading, setLoading] = useState(true)
  const [editar, setEditar] = useState(false)
  const [nuevoExamen, setNuevoExamen] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [tr, ex] = await Promise.all([obtenerTrabajador(id), salud ? listarExamenes(id) : Promise.resolve([])])
      setT(tr)
      setExamenes(ex)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar la ficha')
    } finally {
      setLoading(false)
    }
  }, [id, salud])

  useEffect(() => {
    cargar()
  }, [cargar])

  // el último de cada tipo es el que cuenta para la vigencia (mismo criterio que sso_examenes_vigentes)
  const vigentes = useMemo(() => {
    const porTipo = new Map<string, Examen>()
    for (const e of examenes) if (!porTipo.has(e.tipo_id)) porTipo.set(e.tipo_id, e)
    return [...porTipo.values()]
  }, [examenes])
  const nombreTipo = (tid: string) => tiposExamen.find((x) => x.id === tid)?.nombre ?? '—'

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!t) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.trabajadores} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a trabajadores
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El trabajador no existe o no tienes acceso.</p>
      </div>
    )
  }
  const tr = t

  async function cambiarActivo() {
    const baja = tr.activo
    if (baja && !window.confirm(`¿Dar de baja a ${tr.nombres} ${tr.apellidos}? Su ficha y su historial se conservan.`)) return
    try {
      await actualizarTrabajador(tr.id, { activo: !baja })
      toast.success(baja ? 'Trabajador dado de baja' : 'Trabajador reactivado')
      cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar la ficha de ${tr.nombres} ${tr.apellidos} con todo su historial? No se puede deshacer. Lo normal es darlo de baja.`)) return
    try {
      for (const e of examenes) await eliminarExamen(e)
      await eliminarTrabajador(tr.id)
      toast.success('Ficha eliminada')
      navigate(RUTA.trabajadores, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  async function verArchivo(path: string) {
    try {
      window.open(await urlArchivoExamen(path), '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el archivo')
    }
  }

  async function quitarExamen(e: Examen) {
    if (!window.confirm(`¿Eliminar el examen ${nombreTipo(e.tipo_id)} del ${fmtFecha(e.fecha)}?`)) return
    try {
      await eliminarExamen(e)
      cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.trabajadores} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a trabajadores
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold">
          {tr.nombres} {tr.apellidos}
        </h1>
        {!tr.activo && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">De baja desde {fmtFecha(tr.fecha_baja)}</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {puede('editar') && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
                <Pencil className="mr-1 h-4 w-4" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={cambiarActivo}>
                {tr.activo ? <UserMinus className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
                {tr.activo ? 'Dar de baja' : 'Reactivar'}
              </Button>
            </>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          <Dato label="RUT">{formatearRut(tr.rut)}</Dato>
          <Dato label="Empresa">
            {tr.empresa}
            {!tr.empresa_propia && <span className="ml-1 text-xs text-muted-foreground">(contratista)</span>}
          </Dato>
          <Dato label="Cargo">{tr.cargo}</Dato>
          <Dato label="Área">{tr.area_id ? nombreArea(tr.area_id) : 'Sin área'}</Dato>
          <Dato label="Fecha de ingreso">{tr.fecha_ingreso && fmtFecha(tr.fecha_ingreso)}</Dato>
          <Dato label="Teléfono">{tr.telefono}</Dato>
          <Dato label="Email">{tr.email}</Dato>
          <div className="sm:col-span-2">
            <Dato label="Contacto de emergencia">{tr.contacto_emergencia}</Dato>
          </div>
          {tr.observaciones && (
            <div className="sm:col-span-3">
              <Dato label="Observaciones">
                <p className="whitespace-pre-wrap">{tr.observaciones}</p>
              </Dato>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Exámenes ocupacionales</p>
            {salud && (
              <Button size="sm" variant="outline" onClick={() => setNuevoExamen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Registrar examen
              </Button>
            )}
          </div>
          {!salud ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" /> Datos de salud: solo visibles con el permiso de exámenes ocupacionales.
            </p>
          ) : examenes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin exámenes registrados.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {vigentes.map((e) => {
                  const s = SITUACION[situacionDe(e, hoy)]
                  return (
                    <div key={e.id} className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-semibold">{nombreTipo(e.tipo_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {RESULTADO_LABEL[e.resultado]} · {e.vencimiento ? `vence ${fmtFecha(e.vencimiento)}` : 'no vence'}
                      </p>
                      <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', s.clase)}>{s.label}</span>
                    </div>
                  )
                })}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Examen</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examenes.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{nombreTipo(e.tipo_id)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtFecha(e.fecha)}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.vencimiento ? fmtFecha(e.vencimiento) : 'No vence'}</TableCell>
                      <TableCell>{RESULTADO_LABEL[e.resultado]}</TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">{e.observaciones}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {e.archivo_path && (
                          <Button size="icon" variant="ghost" title={e.archivo_nombre ?? 'Certificado'} onClick={() => verArchivo(e.archivo_path!)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title="Eliminar" onClick={() => quitarExamen(e)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {puedeEn('accidentes', 'ver') && <EventosTrabajador trabajadorId={tr.id} />}
      {puedeEn('epp', 'ver') && <EppTrabajador trabajadorId={tr.id} puedeEntregar={tr.activo && puedeEn('epp', 'crear')} />}
      {puedeEn('capacitaciones', 'ver') && <CapacitacionesTrabajador trabajadorId={tr.id} />}

      <FormTrabajador
        open={editar}
        onOpenChange={setEditar}
        trabajador={tr}
        empresas={empresas}
        areas={areas}
        cargos={[]}
        onGuardado={() => cargar()}
      />
      <DialogExamen
        open={nuevoExamen}
        onOpenChange={setNuevoExamen}
        trabajadorId={tr.id}
        tipos={tiposExamen.filter((x) => x.activo)}
        onGuardado={cargar}
      />
    </div>
  )
}

function DialogExamen({
  open,
  onOpenChange,
  trabajadorId,
  tipos,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trabajadorId: string
  tipos: { id: string; nombre: string; vigencia_meses: number | null }[]
  onGuardado: () => void
}) {
  const [tipoId, setTipoId] = useState('')
  const [fecha, setFecha] = useState(hoyChile())
  const [vencimiento, setVencimiento] = useState('')
  const [resultado, setResultado] = useState<ResultadoExamen>('apto')
  const [obs, setObs] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    setTipoId(tipos[0]?.id ?? '')
    setFecha(hoyChile())
    setVencimiento('')
    setResultado('apto')
    setObs('')
    setArchivo(null)
  }, [open, tipos])

  const tipo = tipos.find((x) => x.id === tipoId)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!tipoId) return
    if (archivo && archivo.size > 10 * 1024 * 1024) {
      toast.error('El archivo supera los 10 MB')
      return
    }
    setEnviando(true)
    try {
      await registrarExamen(
        { trabajador_id: trabajadorId, tipo_id: tipoId, fecha, vencimiento: vencimiento || null, resultado, observaciones: obs.trim() || null },
        archivo,
      )
      toast.success('Examen registrado')
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar el examen')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar examen ocupacional</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-tipo">Tipo de examen</Label>
            <select id="e-tipo" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={selectClase} required>
              {tipos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-fecha">Fecha del examen</Label>
              <Input id="e-fecha" type="date" value={fecha} max={hoyChile()} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-venc">Vencimiento</Label>
              <Input id="e-venc" type="date" value={vencimiento} min={fecha} onChange={(e) => setVencimiento(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                {tipo?.vigencia_meses ? `Vacío: ${tipo.vigencia_meses} meses desde el examen` : 'Vacío: no vence'}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-res">Resultado</Label>
            <select id="e-res" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoExamen)} className={selectClase}>
              {RESULTADOS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-obs">Observaciones / restricciones</Label>
            <Textarea id="e-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-arch">Certificado (PDF o foto, opcional)</Label>
            <Input id="e-arch" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !tipoId}>
              {enviando ? 'Guardando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import {
  ARCHIVOS_ACTA,
  errorActa,
  guardarAsistencia,
  guardarReunion,
  listarAsistencia,
  listarComites,
  listarMiembros,
  obtenerReunion,
  subirActa,
  type ComiteV,
  type EstadoReunion,
  type MiembroV,
  type ReunionV,
  type TipoReunion,
} from '../lib/apiComite'
import { hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/** Integrantes en funciones a la fecha de la reunión. */
const enFunciones = (m: MiembroV, fecha: string) => m.desde <= fecha && (!m.hasta || m.hasta >= fecha)

export default function FormReunion() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('comite')
  const [original, setOriginal] = useState<ReunionV | null>(null)
  const [comites, setComites] = useState<ComiteV[]>([])
  const [comiteId, setComiteId] = useState(params.get('comite') ?? '')
  const [miembros, setMiembros] = useState<MiembroV[]>([])
  const [presentes, setPresentes] = useState<Set<string>>(new Set())
  const [tipo, setTipo] = useState<TipoReunion>('ordinaria')
  const [estado, setEstado] = useState<EstadoReunion>('realizada')
  const [fecha, setFecha] = useState(hoyChile())
  const [hora, setHora] = useState('')
  const [lugar, setLugar] = useState('')
  const [temas, setTemas] = useState('')
  const [desarrollo, setDesarrollo] = useState('')
  const [acta, setActa] = useState<File | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const cs = await listarComites()
        setComites(cs)
        if (id) {
          const r = await obtenerReunion(id)
          if (r) {
            setOriginal(r)
            setComiteId(r.comite_id)
            setTipo(r.tipo)
            setEstado(r.estado)
            setFecha(r.fecha)
            setHora(r.hora?.slice(0, 5) ?? '')
            setLugar(r.lugar ?? '')
            setTemas(r.temas ?? '')
            setDesarrollo(r.desarrollo ?? '')
            const asis = await listarAsistencia(id)
            setPresentes(new Set(asis.filter((a) => a.asistio).map((a) => a.miembro_id)))
          }
        } else if (!params.get('comite') && cs[0]) {
          setComiteId(cs.find((c) => c.activo)?.id ?? cs[0].id)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
      } finally {
        setCargando(false)
      }
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!comiteId) return
    listarMiembros(comiteId)
      .then(setMiembros)
      .catch(() => setMiembros([]))
  }, [comiteId])

  const convocados = useMemo(() => miembros.filter((m) => enFunciones(m, fecha) || presentes.has(m.id)), [miembros, fecha, presentes])
  const hayEmpresa = convocados.some((m) => m.representa === 'empresa' && presentes.has(m.id))
  const hayTrab = convocados.some((m) => m.representa === 'trabajadores' && presentes.has(m.id))

  const puedeGuardar = id ? puede('editar') || (original?.creado_por === userId && puede('crear')) : puede('crear')
  if (!permisosLoading && !cargando && !puedeGuardar) return <Navigate to={id ? RUTA.reunion(id) : RUTA.comite} replace />

  const alternar = (mid: string, v: boolean) =>
    setPresentes((s) => {
      const n = new Set(s)
      if (v) n.add(mid)
      else n.delete(mid)
      return n
    })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!comiteId) {
      toast.error('Elige el comité')
      return
    }
    if (estado === 'realizada' && fecha > hoyChile()) {
      toast.error('Una reunión realizada no puede tener fecha futura: márcala como programada')
      return
    }
    const err = acta && errorActa(acta)
    if (err) {
      toast.error(err)
      return
    }
    if (estado === 'realizada' && (!hayEmpresa || !hayTrab) && !window.confirm('No hay quórum (al menos un representante de cada parte). ¿Guardar igual?')) return
    setEnviando(true)
    try {
      const rid = await guardarReunion(id ?? null, {
        comite_id: comiteId,
        tipo,
        estado,
        fecha,
        hora: hora || null,
        lugar: lugar.trim() || null,
        temas: temas.trim() || null,
        desarrollo: desarrollo.trim() || null,
      })
      if (estado === 'realizada') await guardarAsistencia(rid, convocados.map((m) => m.id), presentes)
      if (acta) {
        try {
          await subirActa({ id: rid, acta_path: original?.acta_path ?? null }, acta)
        } catch (er) {
          toast.warning(`Reunión guardada, pero el acta no se pudo subir: ${er instanceof Error ? er.message : ''}`)
        }
      }
      toast.success(id ? 'Reunión actualizada' : 'Reunión registrada')
      navigate(RUTA.reunion(rid), { replace: true })
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo guardar')
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={id ? RUTA.reunion(id) : RUTA.comite} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Volver a la reunión' : 'Volver al comité'}
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h1 className="text-lg font-extrabold">{id ? `Editar reunión N° ${original?.numero ?? ''}` : 'Registrar reunión'}</h1>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="re-com">Comité</Label>
                <select id="re-com" value={comiteId} onChange={(e) => setComiteId(e.target.value)} className={selectClase} disabled={!!id}>
                  {comites.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="re-tipo">Tipo</Label>
                <select id="re-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoReunion)} className={selectClase}>
                  <option value="ordinaria">Ordinaria (mensual)</option>
                  <option value="extraordinaria">Extraordinaria</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="re-est">Estado</Label>
                <select id="re-est" value={estado} onChange={(e) => setEstado(e.target.value as EstadoReunion)} className={selectClase}>
                  <option value="realizada">Realizada</option>
                  <option value="programada">Programada</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="re-fecha">Fecha *</Label>
                <Input id="re-fecha" type="date" value={fecha} max={estado === 'realizada' ? hoyChile() : undefined} onChange={(e) => setFecha(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="re-hora">Hora</Label>
                <Input id="re-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="re-lugar">Lugar</Label>
                <Input id="re-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Sala de reuniones planta" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="re-temas">Tabla / temas</Label>
              <Textarea id="re-temas" rows={3} value={temas} onChange={(e) => setTemas(e.target.value)} />
            </div>
            {estado === 'realizada' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="re-des">Acta: desarrollo de la reunión</Label>
                <Textarea id="re-des" rows={6} value={desarrollo} onChange={(e) => setDesarrollo(e.target.value)} placeholder="Lo tratado en cada punto. Los acuerdos se registran aparte, en la reunión." />
              </div>
            )}
          </CardContent>
        </Card>

        {estado === 'realizada' && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">Asistencia</p>
                <p className={hayEmpresa && hayTrab ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs font-semibold text-red-700 dark:text-red-400'}>
                  {hayEmpresa && hayTrab ? 'Con quórum' : 'Sin quórum: falta al menos un representante de cada parte'}
                </p>
              </div>
              {convocados.length === 0 ? (
                <p className="text-sm text-muted-foreground">El comité no tiene integrantes en funciones a esa fecha. Agrégalos en la pestaña Integrantes.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(['empresa', 'trabajadores'] as const).map((rep) => (
                    <div key={rep}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rep === 'empresa' ? 'Empresa' : 'Trabajadores'}</p>
                      {convocados
                        .filter((m) => m.representa === rep)
                        .map((m) => (
                          <label key={m.id} className="flex items-center gap-2 py-1 text-sm">
                            <Checkbox checked={presentes.has(m.id)} onCheckedChange={(v) => alternar(m.id, !!v)} />
                            {m.nombre}
                            <span className="text-xs text-muted-foreground">{m.calidad === 'suplente' ? 'suplente' : 'titular'}</span>
                          </label>
                        ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1.5 border-t pt-3">
                <Label htmlFor="re-acta">{original?.acta_path ? 'Reemplazar acta firmada' : 'Acta firmada (PDF o foto, opcional)'}</Label>
                <Input id="re-acta" type="file" accept={ARCHIVOS_ACTA.join(',')} onChange={(e) => setActa(e.target.files?.[0] ?? null)} />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Registrar reunión'}
          </Button>
        </div>
      </form>
    </div>
  )
}

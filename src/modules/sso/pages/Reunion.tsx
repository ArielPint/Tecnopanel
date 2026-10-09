import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Pencil, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ARCHIVOS_ACTA,
  eliminarReunion,
  errorActa,
  listarAcuerdos,
  listarAsistencia,
  listarMiembros,
  obtenerReunion,
  quitarActa,
  subirActa,
  urlActa,
  type AcuerdoV,
  type MiembroV,
  type ReunionV,
} from '../lib/apiComite'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { TablaAcuerdos } from './Comite'

export default function Reunion() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSso('comite')
  const [r, setR] = useState<ReunionV | null>(null)
  const [miembros, setMiembros] = useState<MiembroV[]>([])
  const [asistencia, setAsistencia] = useState<{ miembro_id: string; asistio: boolean }[]>([])
  const [acuerdos, setAcuerdos] = useState<AcuerdoV[]>([])
  const [loading, setLoading] = useState(true)
  const [subiendo, setSubiendo] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const reu = await obtenerReunion(id)
      setR(reu)
      if (reu) {
        const [m, a, ac] = await Promise.all([listarMiembros(reu.comite_id), listarAsistencia(id), listarAcuerdos({ reunionId: id })])
        setMiembros(m)
        setAsistencia(a)
        setAcuerdos(ac)
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
  if (!r) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.comite} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver al comité
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La reunión no existe o no tienes acceso.</p>
      </div>
    )
  }
  const reu = r
  const puedeEditar = puede('editar') || (reu.creado_por === userId && puede('crear'))
  const nombre = new Map(miembros.map((m) => [m.id, m]))

  async function onActa(archivo: File | undefined) {
    if (!archivo) return
    const err = errorActa(archivo)
    if (err) {
      toast.error(err)
      return
    }
    setSubiendo(true)
    try {
      await subirActa(reu, archivo)
      toast.success('Acta subida')
      cargar()
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo subir')
    } finally {
      setSubiendo(false)
    }
  }

  async function sacarActa() {
    if (!window.confirm('¿Quitar el acta firmada?')) return
    try {
      await quitarActa(reu)
      cargar()
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo quitar')
    }
  }

  async function descargar() {
    try {
      window.open(await urlActa(reu.acta_path!, reu.acta_nombre!), '_blank')
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo descargar')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar la reunión N° ${reu.numero} con su asistencia, acta y acuerdos?`)) return
    try {
      await eliminarReunion(reu)
      toast.success('Reunión eliminada')
      navigate(RUTA.comite, { replace: true })
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.comite} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver al comité
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold">
            Reunión {reu.tipo} N° {reu.numero}
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmtFecha(reu.fecha)}
            {reu.hora && ` · ${reu.hora.slice(0, 5)}`}
            {reu.lugar && ` · ${reu.lugar}`}
          </p>
        </div>
        {reu.estado === 'programada' ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">Programada</span>
        ) : (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              reu.quorum ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-600 text-white',
            )}
          >
            {reu.quorum ? 'Con quórum' : 'Sin quórum'}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => navigate(RUTA.editarReunion(reu.id))}>
              <Pencil className="mr-1 h-4 w-4" /> {reu.estado === 'programada' ? 'Registrar realización' : 'Editar'}
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="space-y-4 pt-5 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tabla</p>
              <p className="whitespace-pre-wrap">{reu.temas || '—'}</p>
            </div>
            {reu.estado === 'realizada' && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desarrollo (acta)</p>
                <p className="whitespace-pre-wrap">{reu.desarrollo || '—'}</p>
              </div>
            )}
            {reu.estado === 'realizada' && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Acta firmada</p>
                {reu.acta_path ? (
                  <>
                    <Button size="sm" variant="outline" onClick={descargar}>
                      <Download className="mr-1 h-4 w-4" /> {reu.acta_nombre}
                    </Button>
                    {puedeEditar && (
                      <Button size="icon" variant="ghost" title="Quitar" onClick={sacarActa}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Falta subirla</span>
                )}
                {puedeEditar && (
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> {subiendo ? 'Subiendo…' : reu.acta_path ? 'Reemplazar' : 'Subir'}
                    <input type="file" className="hidden" accept={ARCHIVOS_ACTA.join(',')} disabled={subiendo} onChange={(e) => onActa(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {reu.estado === 'realizada' && (
          <Card>
            <CardContent className="pt-5 text-sm">
              <p className="mb-2 font-bold">
                Asistencia <span className="font-normal text-muted-foreground">({reu.presentes_empresa} empresa · {reu.presentes_trabajadores} trabajadores)</span>
              </p>
              {asistencia.length === 0 ? (
                <p className="text-muted-foreground">Sin registro.</p>
              ) : (
                <ul className="space-y-1">
                  {asistencia
                    .map((a) => ({ ...a, m: nombre.get(a.miembro_id) }))
                    .sort((a, b) => Number(b.asistio) - Number(a.asistio) || (a.m?.nombre ?? '').localeCompare(b.m?.nombre ?? ''))
                    .map((a) => (
                      <li key={a.miembro_id} className={cn(!a.asistio && 'text-muted-foreground line-through')}>
                        {a.m?.nombre ?? '—'} <span className="text-xs text-muted-foreground no-underline">{a.m?.representa === 'empresa' ? 'empresa' : 'trabajadores'}</span>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-sm font-bold">Acuerdos de la reunión</p>
          <TablaAcuerdos acuerdos={acuerdos} comiteId={reu.comite_id} reunionId={reu.id} mostrarReunion={false} onCambio={cargar} />
        </CardContent>
      </Card>
    </div>
  )
}

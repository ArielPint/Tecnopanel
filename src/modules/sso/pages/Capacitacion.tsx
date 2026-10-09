import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import { eliminarCapacitacion, listarAsistentes, obtenerCapacitacion, urlEvidencia, type Asistente, type CapacitacionV } from '../lib/apiCapacitaciones'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { fmtFecha } from '../lib/estados'
import { formatearRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children || '—'}</div>
    </div>
  )
}

export default function Capacitacion() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSso('capacitaciones')
  const { nombreArea, nombreUsuario } = useDatosSso()
  const [c, setC] = useState<CapacitacionV | null>(null)
  const [asistentes, setAsistentes] = useState<Asistente[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([obtenerCapacitacion(id), listarAsistentes(id), listarTrabajadores()])
      .then(([cap, asis, tr]) => {
        setC(cap)
        setAsistentes(asis)
        setTrabajadores(tr)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [id])

  const filas = useMemo(() => {
    const porId = new Map(trabajadores.map((t) => [t.id, t]))
    return asistentes
      .map((a) => ({ ...a, t: porId.get(a.trabajador_id) }))
      .sort((x, y) => Number(y.asistio) - Number(x.asistio) || (x.t?.apellidos ?? '').localeCompare(y.t?.apellidos ?? ''))
  }, [asistentes, trabajadores])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!c) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.capacitaciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a capacitaciones
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La capacitación no existe o no tienes acceso.</p>
      </div>
    )
  }
  const cap = c
  const puedeEditar = puede('editar') || (cap.registrado_por === userId && puede('crear'))

  async function verEvidencia() {
    try {
      window.open(await urlEvidencia(cap.evidencia_path!), '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir la evidencia')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar "${cap.tema}" (${fmtFecha(cap.fecha)}) con su asistencia? Afecta las vigencias de los asistentes.`)) return
    try {
      await eliminarCapacitacion(cap)
      toast.success('Capacitación eliminada')
      navigate(RUTA.capacitaciones, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.capacitaciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a capacitaciones
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{cap.tema}</h1>
          <p className="text-sm text-muted-foreground">
            {cap.tipo} · {fmtFecha(cap.fecha)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {cap.evidencia_path && (
            <Button size="sm" variant="outline" onClick={verEvidencia}>
              <FileText className="mr-1 h-4 w-4" /> Lista firmada
            </Button>
          )}
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => navigate(RUTA.editarCapacitacion(cap.id))}>
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

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-4">
          <Dato label="Duración">{cap.duracion_min} minutos</Dato>
          <Dato label="Relator">{cap.relator}</Dato>
          <Dato label="Área">{cap.area_id ? nombreArea(cap.area_id) : 'Toda la empresa'}</Dato>
          <Dato label="Lugar">{cap.lugar}</Dato>
          <Dato label="Asistentes">
            {cap.asistentes}
            {cap.ausentes > 0 && ` (${cap.ausentes} ausentes)`}
          </Dato>
          <Dato label="Horas-hombre">{Number(cap.horas_hombre).toLocaleString('es-CL')}</Dato>
          <Dato label="Vigencia">{cap.vigencia_meses ? `${cap.vigencia_meses} meses` : 'No vence'}</Dato>
          <Dato label="Registró">{nombreUsuario(cap.registrado_por)}</Dato>
          {cap.contenido && (
            <div className="sm:col-span-4">
              <Dato label="Contenidos tratados">
                <p className="whitespace-pre-wrap">{cap.contenido}</p>
              </Dato>
            </div>
          )}
          {!cap.evidencia_path && (
            <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-4">Falta adjuntar la lista de asistencia firmada.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-sm font-bold">Asistencia</p>
          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin asistentes registrados.</p>
          ) : (
            <ul className="divide-y">
              {filas.map((a) => (
                <li key={a.trabajador_id} className={cn('flex items-center gap-3 py-1.5 text-sm', !a.asistio && 'opacity-60')}>
                  <span className="min-w-0 flex-1">
                    {a.t ? (
                      <Link to={RUTA.trabajador(a.t.id)} className="font-medium hover:underline">
                        {a.t.apellidos}, {a.t.nombres}
                      </Link>
                    ) : (
                      'Trabajador'
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.t && formatearRut(a.t.rut)} · {a.t?.cargo ?? 'sin cargo'} · {a.t?.empresa}
                    </span>
                  </span>
                  {!a.asistio && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Ausente</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

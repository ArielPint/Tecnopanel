import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import {
  cumplimiento,
  eliminarInspeccion,
  generarHallazgos,
  listarRespuestas,
  obtenerInspeccion,
  urlsFotos,
  type InspeccionV,
  type Respuesta,
} from '../lib/apiInspecciones'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const RES = {
  cumple: { label: 'Cumple', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  no_cumple: { label: 'No cumple', clase: 'bg-red-600 text-white' },
  na: { label: 'No aplica', clase: 'bg-muted text-muted-foreground' },
}

export default function Inspeccion() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, puedeEn, userId } = usePermisosSso('inspecciones')
  const { nombreArea, nombreUsuario } = useDatosSso()
  const [ins, setIns] = useState<InspeccionV | null>(null)
  const [respuestas, setRespuestas] = useState<Respuesta[]>([])
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [i, r] = await Promise.all([obtenerInspeccion(id), listarRespuestas([id])])
      setIns(i)
      setRespuestas(r)
      setFotos(await urlsFotos(r.map((x) => x.foto_path).filter((p): p is string => !!p)).catch(() => ({})))
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
  if (!ins) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.inspeccionesRealizadas} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a inspecciones
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La inspección no existe o no tienes acceso.</p>
      </div>
    )
  }
  const i = ins
  const pct = cumplimiento(i)
  const pendientes = respuestas.filter((r) => r.resultado === 'no_cumple' && !r.hallazgo_id).length
  const puedeGenerar = puede('editar') || (i.inspector === userId && puede('crear'))
  // orden de la plantilla no se guarda en la respuesta: primero lo que no cumple
  const orden = { no_cumple: 0, cumple: 1, na: 2 }
  const lista = [...respuestas].sort((a, b) => orden[a.resultado] - orden[b.resultado])

  async function reintentar() {
    setGenerando(true)
    try {
      const n = await generarHallazgos(i.id)
      toast.success(`${n} hallazgo${n === 1 ? '' : 's'} generado${n === 1 ? '' : 's'}`)
      cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron generar')
    } finally {
      setGenerando(false)
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar la inspección "${i.checklist}" del ${fmtFecha(i.fecha)}? Los hallazgos generados se conservan.`)) return
    try {
      await eliminarInspeccion(i, respuestas)
      toast.success('Inspección eliminada')
      navigate(RUTA.inspeccionesRealizadas, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.inspeccionesRealizadas} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a inspecciones
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Inspección · {i.checklist}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtFecha(i.fecha)} · {i.area_id ? nombreArea(i.area_id) : 'General'}
            {i.ubicacion && ` · ${i.ubicacion}`} · {nombreUsuario(i.inspector)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {pendientes > 0 && puedeGenerar && (
            <Button size="sm" onClick={reintentar} disabled={generando}>
              <RefreshCw className="mr-1 h-4 w-4" /> Generar {pendientes} hallazgo{pendientes > 1 ? 's' : ''} pendiente{pendientes > 1 ? 's' : ''}
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Cumplimiento', pct === null ? '—' : `${pct}%`],
          ['Cumple', String(i.cumple)],
          ['No cumple', String(i.no_cumple)],
          ['Hallazgos generados', String(i.hallazgos)],
        ].map(([t, v]) => (
          <Card key={t}>
            <CardContent className="pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t}</p>
              <p className="mt-1 font-mono-tabular text-2xl font-extrabold">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          <ul className="divide-y">
            {lista.map((r) => (
              <li key={r.item_id} className="flex flex-wrap items-start gap-3 py-2.5">
                <span className={cn('mt-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', RES[r.resultado].clase)}>{RES[r.resultado].label}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p>{r.texto}</p>
                  {r.observacion && <p className="text-muted-foreground">{r.observacion}</p>}
                  {r.hallazgo_id &&
                    (puedeEn('hallazgos', 'ver') ? (
                      <Link to={RUTA.hallazgo(r.hallazgo_id)} className="text-xs font-semibold text-primary hover:underline">
                        Ver hallazgo generado
                      </Link>
                    ) : (
                      <p className="text-xs text-muted-foreground">Hallazgo generado</p>
                    ))}
                </div>
                {r.foto_path && fotos[r.foto_path] && (
                  <button type="button" onClick={() => setAmpliada(fotos[r.foto_path!])} className="h-16 w-16 overflow-hidden rounded-md border">
                    <img src={fotos[r.foto_path]} alt="" className="h-full w-full object-cover" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {i.observaciones && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm">{i.observaciones}</p>}
        </CardContent>
      </Card>

      {ampliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="" className="max-h-full max-w-full rounded-md" />
        </div>
      )}
    </div>
  )
}

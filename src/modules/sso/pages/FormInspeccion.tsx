import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  listarAreasPlantilla,
  listarItemsPlantilla,
  listarPlantillas,
  registrarInspeccion,
  type ItemPlantilla,
  type Plantilla,
  type Resultado,
} from '../lib/apiInspecciones'
import { hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

const OPCIONES: { key: Resultado; label: string; activo: string }[] = [
  { key: 'cumple', label: 'Cumple', activo: 'border-emerald-600 bg-emerald-600 text-white' },
  { key: 'no_cumple', label: 'No cumple', activo: 'border-red-600 bg-red-600 text-white' },
  { key: 'na', label: 'N/A', activo: 'border-foreground bg-foreground text-background' },
]

interface Estado {
  resultado: Resultado | null
  observacion: string
  foto: File | null
}

/** Realizar una inspección: cada ítem cumple / no cumple / no aplica. Al guardar, cada "no cumple"
 *  se convierte en un hallazgo (lo asigna la base al encargado del área). */
export default function FormInspeccion() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { puede, loading: permisosLoading } = usePermisosSso('inspecciones')
  const { areas, nombreArea } = useDatosSso()

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [asignaciones, setAsignaciones] = useState<{ checklist_id: string; area_id: string }[]>([])
  const [items, setItems] = useState<ItemPlantilla[]>([])
  const [checklistId, setChecklistId] = useState(params.get('plantilla') ?? '')
  const [areaId, setAreaId] = useState(params.get('area') ?? '')
  const [fecha, setFecha] = useState(hoyChile())
  const [ubicacion, setUbicacion] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [respuestas, setRespuestas] = useState<Record<string, Estado>>({})
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([listarPlantillas(), listarAreasPlantilla()])
      .then(([p, a]) => {
        setPlantillas(p.filter((x) => x.activo))
        setAsignaciones(a)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (!checklistId) {
      setItems([])
      return
    }
    listarItemsPlantilla(checklistId).then((its) => {
      const activos = its.filter((i) => i.activo)
      setItems(activos)
      setRespuestas(Object.fromEntries(activos.map((i) => [i.id, { resultado: null, observacion: '', foto: null }])))
    })
  }, [checklistId])

  // áreas: las asignadas a la plantilla; si es general, cualquiera
  const areasPlantilla = useMemo(() => {
    const asignadas = asignaciones.filter((a) => a.checklist_id === checklistId).map((a) => a.area_id)
    return asignadas.length ? areas.filter((a) => asignadas.includes(a.id)) : areas.filter((a) => a.activa)
  }, [asignaciones, checklistId, areas])

  if (!permisosLoading && !puede('crear')) return <Navigate to={RUTA.inspecciones} replace />

  const plantilla = plantillas.find((p) => p.id === checklistId)
  const set = (id: string, cambio: Partial<Estado>) => setRespuestas((r) => ({ ...r, [id]: { ...r[id], ...cambio } }))
  const sinResponder = items.filter((i) => !respuestas[i.id]?.resultado).length
  const noCumple = items.filter((i) => respuestas[i.id]?.resultado === 'no_cumple').length

  function marcarTodo(resultado: Resultado) {
    setRespuestas((r) => Object.fromEntries(items.map((i) => [i.id, { ...r[i.id], resultado: r[i.id]?.resultado ?? resultado }])))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!plantilla) {
      toast.error('Elige la plantilla')
      return
    }
    if (sinResponder > 0) {
      toast.error(`Faltan ${sinResponder} ítems por responder`)
      return
    }
    const sinDetalle = items.find((i) => respuestas[i.id].resultado === 'no_cumple' && !respuestas[i.id].observacion.trim())
    if (sinDetalle && !window.confirm(`"${sinDetalle.texto}" no cumple y no tiene observación. El hallazgo quedará solo con el texto del ítem. ¿Seguir?`)) return
    setEnviando(true)
    try {
      const r = await registrarInspeccion(
        { checklist_id: plantilla.id, area_id: areaId || null, fecha, ubicacion: ubicacion.trim() || null, observaciones: observaciones.trim() || null },
        items.map((i) => ({
          item_id: i.id,
          texto: i.texto,
          resultado: respuestas[i.id].resultado!,
          observacion: respuestas[i.id].observacion.trim() || null,
          foto: respuestas[i.id].foto,
        })),
      )
      for (const a of r.avisos) toast.warning(a)
      toast.success(r.hallazgos ? `Inspección registrada · ${r.hallazgos} hallazgo${r.hallazgos > 1 ? 's' : ''} generado${r.hallazgos > 1 ? 's' : ''}` : 'Inspección registrada')
      navigate(RUTA.inspeccion(r.id), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar')
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={RUTA.inspecciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a inspecciones
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h1 className="text-lg font-extrabold">Realizar inspección</h1>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-plantilla">Plantilla *</Label>
                <select id="i-plantilla" value={checklistId} onChange={(e) => { setChecklistId(e.target.value); setAreaId('') }} className={selectClase} required>
                  <option value="">Elegir…</option>
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-area">Área</Label>
                <select id="i-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase}>
                  <option value="">General / sin área</option>
                  {areasPlantilla.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-fecha">Fecha *</Label>
                <Input id="i-fecha" type="date" value={fecha} max={hoyChile()} onChange={(e) => setFecha(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-ubic">Ubicación</Label>
                <Input id="i-ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder={areaId ? nombreArea(areaId) : 'Ej: bodega norte'} />
              </div>
            </div>
            {plantilla?.descripcion && <p className="text-sm text-muted-foreground">{plantilla.descripcion}</p>}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  Ítems · {items.length - sinResponder}/{items.length} respondidos
                  {noCumple > 0 && <span className="ml-2 text-red-700 dark:text-red-400">· {noCumple} no cumple{noCumple > 1 ? 'n' : ''} → {noCumple} hallazgo{noCumple > 1 ? 's' : ''}</span>}
                </p>
                {sinResponder > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => marcarTodo('cumple')}>
                    Marcar el resto como "Cumple"
                  </Button>
                )}
              </div>
              <ol className="divide-y">
                {items.map((it, n) => {
                  const r = respuestas[it.id]
                  if (!r) return null
                  return (
                    <li key={it.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <p className="min-w-0 flex-1 text-sm">
                          <span className="mr-1 font-mono-tabular text-muted-foreground">{n + 1}.</span>
                          {it.texto}
                        </p>
                        <div className="flex gap-1">
                          {OPCIONES.map((o) => (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => set(it.id, { resultado: o.key })}
                              className={cn('rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors', r.resultado === o.key ? o.activo : 'hover:bg-accent')}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(r.resultado === 'no_cumple' || r.observacion || r.foto) && (
                        <div className="flex flex-wrap items-center gap-2 pl-5">
                          <Input
                            value={r.observacion}
                            onChange={(e) => set(it.id, { observacion: e.target.value })}
                            placeholder={r.resultado === 'no_cumple' ? 'Qué se encontró (va al hallazgo)' : 'Observación'}
                            className="h-8 min-w-[16rem] flex-1"
                          />
                          {r.foto ? (
                            <span className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                              {r.foto.name}
                              <button type="button" onClick={() => set(it.id, { foto: null })} aria-label="Quitar foto">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ) : (
                            <label className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                              <Camera className="h-3.5 w-3.5" /> Foto
                              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => set(it.id, { foto: e.target.files?.[0] ?? null })} />
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-obs">Observaciones generales</Label>
                <Textarea id="i-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando || items.length === 0}>
            {enviando ? 'Guardando…' : noCumple ? `Registrar y generar ${noCumple} hallazgo${noCumple > 1 ? 's' : ''}` : 'Registrar inspección'}
          </Button>
        </div>
      </form>
    </div>
  )
}

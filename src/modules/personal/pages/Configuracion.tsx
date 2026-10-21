import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import {
  actualizarArea,
  actualizarJornada,
  crearArea,
  crearJornada,
  eliminarArea,
  eliminarJornada,
  listarAreas,
  listarIngresos,
  listarJornadas,
  type Area,
  type Jornada,
} from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Configuración del portal (RRHH): áreas que pueden solicitar personal y jornadas con su horario. */
export default function Configuracion() {
  const [areas, setAreas] = useState<Area[]>([])
  const [usos, setUsos] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [a, ingresos] = await Promise.all([listarAreas(), listarIngresos()])
      setAreas(a)
      const conteo: Record<string, number> = {}
      for (const i of ingresos) conteo[i.area] = (conteo[i.area] ?? 0) + 1
      setUsos(conteo)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [])

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
      toast.error(msg(err, 'No se pudo guardar'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!nueva.trim()) return
    if (await hacer(() => crearArea(nueva.trim()), 'Área agregada')) setNueva('')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Áreas que pueden solicitar personal y jornadas con su horario. Son las que aparecen en el formulario de nueva solicitud.</p>
      </div>

      <h2 className="text-sm font-bold">Áreas</h2>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={agregar} className="flex gap-2">
            <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nombre del área, ej: Producción" className="h-9" aria-label="Nueva área" />
            <Button type="submit" size="sm" disabled={ocupado || !nueva.trim()}>
              Agregar
            </Button>
          </form>

          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : areas.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no hay áreas. Mientras no haya al menos una activa, nadie puede crear solicitudes.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {areas.map((a) => {
                const n = usos[a.nombre] ?? 0
                const enEdicion = editando?.id === a.id
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    {enEdicion ? (
                      <form
                        className="flex min-w-0 flex-1 gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (!editando.nombre.trim()) return
                          if (await hacer(() => actualizarArea(a.id, { nombre: editando.nombre.trim() }), 'Área renombrada')) setEditando(null)
                        }}
                      >
                        <Input
                          value={editando.nombre}
                          onChange={(e) => setEditando({ id: a.id, nombre: e.target.value })}
                          className="h-8"
                          autoFocus
                          aria-label="Nombre del área"
                        />
                        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={ocupado} aria-label="Guardar nombre">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditando(null)} aria-label="Cancelar">
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 font-medium">{a.nombre}</span>
                        {!a.activa && <Badge variant="secondary">Inactiva</Badge>}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {n === 0 ? 'Sin solicitudes' : n === 1 ? '1 solicitud' : `${n} solicitudes`}
                        </span>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditando({ id: a.id, nombre: a.nombre })} aria-label={`Renombrar ${a.nombre}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={ocupado}
                          onClick={() => hacer(() => actualizarArea(a.id, { activa: !a.activa }), a.activa ? 'Área desactivada' : 'Área activada')}
                        >
                          {a.activa ? 'Desactivar' : 'Activar'}
                        </Button>
                        {n === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-muted-foreground hover:text-destructive"
                            disabled={ocupado}
                            onClick={() => window.confirm(`¿Eliminar el área "${a.nombre}"?`) && hacer(() => eliminarArea(a.id), 'Área eliminada')}
                            aria-label={`Eliminar ${a.nombre}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Un área con solicitudes no se elimina: se desactiva y deja de aparecer en el formulario. Si la renombras, las solicitudes ya hechas
            conservan el nombre con que se pidieron.
          </p>
        </CardContent>
      </Card>

      <Jornadas />
    </div>
  )
}

/** Jornadas con su horario. Al elegir una en la solicitud se copia su horario (que se puede ajustar ahí),
 *  así que cambiarla aquí no toca las solicitudes ya hechas. */
function Jornadas() {
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState({ nombre: '', horario: '' })
  const [editando, setEditando] = useState<{ id: string; nombre: string; horario: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setJornadas(await listarJornadas())
    } catch (err) {
      toast.error(msg(err, 'Error al cargar las jornadas'))
    } finally {
      setLoading(false)
    }
  }, [])

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
      toast.error(msg(err, 'No se pudo guardar'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!nueva.nombre.trim()) return
    if (await hacer(() => crearJornada(nueva.nombre.trim(), nueva.horario.trim() || null), 'Jornada agregada')) setNueva({ nombre: '', horario: '' })
  }

  return (
    <>
      <h2 className="pt-2 text-sm font-bold">Jornadas y horarios</h2>
      <Card>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={agregar} className="flex flex-wrap gap-2">
            <Input
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              placeholder="Jornada, ej: Turno mañana"
              className="h-9 sm:w-48"
              aria-label="Nombre de la jornada"
            />
            <Input
              value={nueva.horario}
              onChange={(e) => setNueva({ ...nueva, horario: e.target.value })}
              placeholder="Horario, ej: lunes a viernes 07:00 a 15:00"
              className="h-9 min-w-0 flex-1"
              aria-label="Horario de la jornada"
            />
            <Button type="submit" size="sm" disabled={ocupado || !nueva.nombre.trim()}>
              Agregar
            </Button>
          </form>

          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : jornadas.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no hay jornadas. En la solicitud se pueden escribir a mano.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {jornadas.map((j) =>
                editando?.id === j.id ? (
                  <li key={j.id} className="px-3 py-2">
                    <form
                      className="flex flex-wrap gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault()
                        if (!editando.nombre.trim()) return
                        const cambios = { nombre: editando.nombre.trim(), horario: editando.horario.trim() || null }
                        if (await hacer(() => actualizarJornada(j.id, cambios), 'Jornada guardada')) setEditando(null)
                      }}
                    >
                      <Input
                        value={editando.nombre}
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                        className="h-8 sm:w-48"
                        autoFocus
                        aria-label="Nombre de la jornada"
                      />
                      <Input
                        value={editando.horario}
                        onChange={(e) => setEditando({ ...editando, horario: e.target.value })}
                        placeholder="Horario"
                        className="h-8 min-w-0 flex-1"
                        aria-label="Horario de la jornada"
                      />
                      <Button type="submit" size="sm" variant="outline" className="h-8" disabled={ocupado} aria-label="Guardar jornada">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditando(null)} aria-label="Cancelar">
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  </li>
                ) : (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{j.nombre}</p>
                      <p className={j.horario ? 'text-xs text-muted-foreground' : 'text-xs font-semibold text-warning'}>
                        {j.horario ?? 'Sin horario: complétalo para que se copie en las solicitudes'}
                      </p>
                    </div>
                    {!j.activa && <Badge variant="secondary">Inactiva</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setEditando({ id: j.id, nombre: j.nombre, horario: j.horario ?? '' })}
                      aria-label={`Editar ${j.nombre}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={ocupado}
                      onClick={() => hacer(() => actualizarJornada(j.id, { activa: !j.activa }), j.activa ? 'Jornada desactivada' : 'Jornada activada')}
                    >
                      {j.activa ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-muted-foreground hover:text-destructive"
                      disabled={ocupado}
                      onClick={() => window.confirm(`¿Eliminar la jornada "${j.nombre}"?`) && hacer(() => eliminarJornada(j.id), 'Jornada eliminada')}
                      aria-label={`Eliminar ${j.nombre}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ),
              )}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Las solicitudes guardan la jornada y el horario con que se pidieron: cambiar o eliminar una jornada aquí no las modifica.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

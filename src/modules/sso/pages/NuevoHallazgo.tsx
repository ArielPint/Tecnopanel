import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { agregarEvidencia, crearHallazgo } from '../lib/api'
import { hoyChile, sumarDias } from '../lib/estados'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { RUTA } from '../lib/rutas'
import { useDatosSso } from '../hooks/useDatosSso'
import { SelectorFotos } from '../components/SelectorFotos'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export default function NuevoHallazgo() {
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('hallazgos')
  const { areas, responsables } = useDatosSso()
  const hoy = hoyChile()

  const [areaId, setAreaId] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaDeteccion, setFechaDeteccion] = useState(hoy)
  const [fechaCompromiso, setFechaCompromiso] = useState(sumarDias(hoy, 7))
  const [responsableId, setResponsableId] = useState('')
  // Mientras el usuario no elija a mano, el responsable sigue al encargado del área.
  const [responsableManual, setResponsableManual] = useState(false)
  const [fotos, setFotos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)

  if (!permisosLoading && !puede('crear')) return <Navigate to={RUTA.hallazgos} replace />

  const areasActivas = areas.filter((a) => a.activa)

  function elegirArea(id: string) {
    setAreaId(id)
    if (!responsableManual) setResponsableId(areas.find((a) => a.id === id)?.encargado_user_id ?? '')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ubicacion.trim() || !descripcion.trim()) {
      toast.error('Ubicación y descripción son obligatorias')
      return
    }
    if (!responsableId) {
      toast.error('Elige un responsable (o un área que tenga encargado)')
      return
    }
    if (fechaCompromiso < fechaDeteccion) {
      toast.error('El plazo no puede ser anterior a la fecha de detección')
      return
    }
    setEnviando(true)
    try {
      const { id, numero } = await crearHallazgo({
        area_id: areaId || null,
        ubicacion: ubicacion.trim(),
        descripcion: descripcion.trim(),
        fecha_deteccion: fechaDeteccion,
        fecha_compromiso: fechaCompromiso,
        responsable_user_id: responsableId,
      })
      let fallidas = 0
      for (const f of fotos) {
        try {
          await agregarEvidencia(id, 'deteccion', f, userId)
        } catch {
          fallidas++
        }
      }
      if (fallidas) toast.warning(`Hallazgo N° ${numero} creado, pero ${fallidas} foto(s) no se pudieron subir. Agrégalas desde el detalle.`)
      else toast.success(`Hallazgo N° ${numero} reportado`)
      navigate(RUTA.hallazgo(id), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reportar el hallazgo')
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to={RUTA.hallazgos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a hallazgos
      </Link>
      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-4 text-base font-bold">Reportar no conformidad</h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="n-area">Área</Label>
                <select id="n-area" value={areaId} onChange={(e) => elegirArea(e.target.value)} className={selectClase}>
                  <option value="">Sin área</option>
                  {areasActivas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="n-ubicacion">Ubicación *</Label>
                <Input id="n-ubicacion" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: nave 2, junto a la sierra" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="n-descripcion">Descripción de la condición *</Label>
              <Textarea id="n-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="n-fecha">Fecha de detección</Label>
                <Input id="n-fecha" type="date" value={fechaDeteccion} max={hoy} onChange={(e) => setFechaDeteccion(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="n-plazo">Plazo de cumplimiento *</Label>
                <Input id="n-plazo" type="date" value={fechaCompromiso} min={fechaDeteccion} onChange={(e) => setFechaCompromiso(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="n-resp">Responsable *</Label>
                <select
                  id="n-resp"
                  value={responsableId}
                  onChange={(e) => {
                    setResponsableId(e.target.value)
                    setResponsableManual(true)
                  }}
                  className={selectClase}
                >
                  <option value="">Elegir…</option>
                  {responsables.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fotos de la condición detectada</Label>
              <SelectorFotos archivos={fotos} onChange={setFotos} disabled={enviando} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(RUTA.hallazgos)} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Reportar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

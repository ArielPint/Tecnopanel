import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import {
  guardarCapacitacion,
  listarAsistentes,
  listarTiposCapacitacion,
  obtenerCapacitacion,
  subirEvidencia,
  type CapacitacionV,
  type FichaCapacitacion,
  type TipoCapacitacion,
} from '../lib/apiCapacitaciones'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'
import { SelectorAsistentes, type Seleccion } from '../components/SelectorAsistentes'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

const TIPOS_EVIDENCIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** Alta (/capacitaciones/nueva) y edición (/capacitaciones/:id/editar). */
export default function FormCapacitacion() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('capacitaciones')
  const { areas } = useDatosSso()
  const { empresas } = useCatalogosTrabajadores()

  const [tipos, setTipos] = useState<TipoCapacitacion[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [original, setOriginal] = useState<CapacitacionV | null>(null)
  const [ficha, setFicha] = useState<FichaCapacitacion>({
    tipo_id: '', tema: '', fecha: hoyChile(), duracion_min: 30, relator: '', area_id: null, lugar: null, contenido: null,
  })
  const [asistentes, setAsistentes] = useState<Seleccion[]>([])
  const [evidencia, setEvidencia] = useState<File | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([listarTiposCapacitacion(), listarTrabajadores(), id ? obtenerCapacitacion(id) : null, id ? listarAsistentes(id) : []])
      .then(([ts, tr, cap, asis]) => {
        setTipos(ts)
        setTrabajadores(tr)
        if (cap) {
          setOriginal(cap)
          setFicha({
            tipo_id: cap.tipo_id, tema: cap.tema, fecha: cap.fecha, duracion_min: cap.duracion_min, relator: cap.relator,
            area_id: cap.area_id, lugar: cap.lugar, contenido: cap.contenido,
          })
          setAsistentes(asis.map((a) => ({ trabajador_id: a.trabajador_id, asistio: a.asistio })))
        } else {
          const charla = ts.find((t) => t.activo && t.nombre.toLowerCase().includes('charla')) ?? ts.find((t) => t.activo)
          setFicha((f) => ({ ...f, tipo_id: charla?.id ?? '' }))
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setCargando(false))
  }, [id])

  const puedeGuardar = id ? puede('editar') || (original?.registrado_por === userId && puede('crear')) : puede('crear')
  if (!permisosLoading && !cargando && !puedeGuardar) return <Navigate to={id ? RUTA.capacitacion(id) : RUTA.capacitaciones} replace />

  const set = <K extends keyof FichaCapacitacion>(k: K, v: FichaCapacitacion[K]) => setFicha((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ficha.tipo_id || !ficha.tema.trim() || !ficha.relator.trim()) {
      toast.error('Tipo, tema y relator son obligatorios')
      return
    }
    if (asistentes.length === 0 && !window.confirm('No agregaste asistentes. ¿Guardar igual?')) return
    if (evidencia && !TIPOS_EVIDENCIA.includes(evidencia.type)) {
      toast.error('La evidencia debe ser PDF o foto (JPG, PNG, WebP)')
      return
    }
    if (evidencia && evidencia.size > 10 * 1024 * 1024 && evidencia.type === 'application/pdf') {
      toast.error('El PDF supera los 10 MB')
      return
    }
    setEnviando(true)
    try {
      const capId = await guardarCapacitacion(id ?? null, { ...ficha, tema: ficha.tema.trim(), relator: ficha.relator.trim() }, asistentes)
      if (evidencia) {
        try {
          await subirEvidencia({ id: capId, evidencia_path: original?.evidencia_path ?? null }, evidencia)
        } catch (err) {
          toast.warning(`Capacitación guardada, pero la evidencia no se pudo subir: ${err instanceof Error ? err.message : ''}`)
        }
      }
      toast.success(id ? 'Capacitación actualizada' : 'Capacitación registrada')
      navigate(RUTA.capacitacion(capId), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={id ? RUTA.capacitacion(id) : RUTA.capacitaciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Volver a la capacitación' : 'Volver a capacitaciones'}
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h1 className="text-lg font-extrabold">{id ? 'Editar capacitación' : 'Registrar capacitación o charla'}</h1>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-tipo">Tipo *</Label>
                <select id="c-tipo" value={ficha.tipo_id} onChange={(e) => set('tipo_id', e.target.value)} className={selectClase} required>
                  {tipos
                    .filter((t) => t.activo || t.id === ficha.tipo_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                        {t.vigencia_meses ? ` (vigencia ${t.vigencia_meses} meses)` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-tema">Tema *</Label>
                <Input id="c-tema" value={ficha.tema} onChange={(e) => set('tema', e.target.value)} placeholder="Ej: Uso correcto del arnés" required />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-fecha">Fecha *</Label>
                <Input id="c-fecha" type="date" value={ficha.fecha} max={hoyChile()} onChange={(e) => set('fecha', e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-dur">Duración (minutos) *</Label>
                <Input id="c-dur" type="number" min={1} max={2400} value={ficha.duracion_min} onChange={(e) => set('duracion_min', Math.max(1, Number(e.target.value) || 1))} required />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="c-rel">Relator *</Label>
                <Input id="c-rel" value={ficha.relator} onChange={(e) => set('relator', e.target.value)} placeholder="Persona u organismo (mutual, OTEC)" required />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-area">Área</Label>
                <select id="c-area" value={ficha.area_id ?? ''} onChange={(e) => set('area_id', e.target.value || null)} className={selectClase}>
                  <option value="">Toda la empresa / sin área</option>
                  {areas
                    .filter((a) => a.activa || a.id === ficha.area_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-lugar">Lugar</Label>
                <Input id="c-lugar" value={ficha.lugar ?? ''} onChange={(e) => set('lugar', e.target.value || null)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-cont">Contenidos tratados</Label>
              <Textarea id="c-cont" rows={3} value={ficha.contenido ?? ''} onChange={(e) => set('contenido', e.target.value || null)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-ev">
                Lista de asistencia firmada (PDF o foto)
                {original?.evidencia_nombre && <span className="ml-1 font-normal text-muted-foreground">· actual: {original.evidencia_nombre} (se reemplaza si eliges otra)</span>}
              </Label>
              <Input id="c-ev" type="file" accept={TIPOS_EVIDENCIA.join(',')} onChange={(e) => setEvidencia(e.target.files?.[0] ?? null)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-bold">Asistentes</p>
            <SelectorAsistentes trabajadores={trabajadores} empresas={empresas} areas={areas} seleccion={asistentes} onChange={setAsistentes} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </div>
      </form>
    </div>
  )
}

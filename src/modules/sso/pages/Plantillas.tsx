import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { guardarPlantilla, listarAreasPlantilla, listarItemsPlantilla, listarPlantillas, type Plantilla } from '../lib/apiInspecciones'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

/** Lista de plantillas de checklist (pestaña "Plantillas"). */
export function Plantillas() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('inspecciones')
  const { nombreArea } = useDatosSso()
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [items, setItems] = useState<Record<string, number>>({})
  const [areas, setAreas] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarPlantillas(), listarItemsPlantilla(), listarAreasPlantilla()])
      .then(([p, its, as]) => {
        setPlantillas(p)
        const n: Record<string, number> = {}
        for (const i of its) if (i.activo) n[i.checklist_id] = (n[i.checklist_id] ?? 0) + 1
        setItems(n)
        const a: Record<string, string[]> = {}
        for (const x of as) a[x.checklist_id] = [...(a[x.checklist_id] ?? []), x.area_id]
        setAreas(a)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Las plantillas con periodicidad arman el programa (una línea por cada área asignada; sin áreas, una sola general).
        </p>
        {puede('aprobar') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevaPlantilla}>
              <Plus className="mr-1 h-4 w-4" /> Nueva plantilla
            </Link>
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plantilla</TableHead>
                <TableHead>Periodicidad</TableHead>
                <TableHead>Plazo hallazgos</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead>Áreas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plantillas.map((p) => (
                <TableRow key={p.id} className={cn(puede('aprobar') && 'cursor-pointer', !p.activo && 'opacity-60')} onClick={() => puede('aprobar') && navigate(RUTA.plantilla(p.id))}>
                  <TableCell>
                    <p className="font-medium">
                      {p.nombre}
                      {!p.activo && ' (inactiva)'}
                    </p>
                    {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
                  </TableCell>
                  <TableCell>{p.periodicidad_dias ? `Cada ${p.periodicidad_dias} días` : 'A demanda'}</TableCell>
                  <TableCell>{p.plazo_hallazgo_dias} días</TableCell>
                  <TableCell className="text-right font-mono-tabular">{items[p.id] ?? 0}</TableCell>
                  <TableCell className="text-sm">{(areas[p.id] ?? []).map((a) => nombreArea(a)).join(', ') || 'General'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

interface LineaItem {
  id?: string
  texto: string
  activo: boolean
}

/** Alta y edición de una plantilla: datos, áreas e ítems. */
export function FormPlantilla() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, loading: permisosLoading } = usePermisosSso('inspecciones')
  const { areas } = useDatosSso()
  const [p, setP] = useState<Omit<Plantilla, 'id'>>({ nombre: '', descripcion: null, periodicidad_dias: 30, plazo_hallazgo_dias: 7, activo: true })
  const [areasSel, setAreasSel] = useState<string[]>([])
  const [items, setItems] = useState<LineaItem[]>([{ texto: '', activo: true }])
  const [cargando, setCargando] = useState(!!id)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([listarPlantillas(), listarItemsPlantilla(id), listarAreasPlantilla()])
      .then(([ps, its, as]) => {
        const actual = ps.find((x) => x.id === id)
        if (actual) {
          const { id: _id, ...resto } = actual
          void _id
          setP(resto)
        }
        setItems(its.map((i) => ({ id: i.id, texto: i.texto, activo: i.activo })))
        setAreasSel(as.filter((a) => a.checklist_id === id).map((a) => a.area_id))
      })
      .finally(() => setCargando(false))
  }, [id])

  if (!permisosLoading && !puede('aprobar')) return <Navigate to={RUTA.plantillas} replace />

  const mover = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d
      if (j < 0 || j >= xs.length) return xs
      const copia = [...xs]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const validos = items.filter((i) => i.texto.trim())
    if (!p.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!validos.some((i) => i.activo)) {
      toast.error('La plantilla necesita al menos un ítem activo')
      return
    }
    setEnviando(true)
    try {
      await guardarPlantilla({ ...p, id, nombre: p.nombre.trim(), descripcion: p.descripcion?.trim() || null }, areasSel, validos.map((i) => ({ ...i, texto: i.texto.trim() })))
      toast.success(id ? 'Plantilla actualizada' : 'Plantilla creada')
      navigate(RUTA.plantillas, { replace: true })
    } catch (err) {
      const m = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.error(m.includes('duplicate') ? 'Ya existe una plantilla con ese nombre' : m)
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={RUTA.plantillas} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a plantillas
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h1 className="text-lg font-extrabold">{id ? 'Editar plantilla' : 'Nueva plantilla de inspección'}</h1>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-nom">Nombre *</Label>
                <Input id="p-nom" value={p.nombre} onChange={(e) => setP((x) => ({ ...x, nombre: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-per">Periodicidad (días)</Label>
                <Input
                  id="p-per"
                  type="number"
                  min={1}
                  value={p.periodicidad_dias ?? ''}
                  placeholder="A demanda"
                  onChange={(e) => setP((x) => ({ ...x, periodicidad_dias: e.target.value ? Math.max(1, Number(e.target.value)) : null }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-plazo">Plazo para corregir (días)</Label>
                <Input id="p-plazo" type="number" min={1} max={365} value={p.plazo_hallazgo_dias} onChange={(e) => setP((x) => ({ ...x, plazo_hallazgo_dias: Math.max(1, Number(e.target.value) || 1) }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">Descripción</Label>
              <Textarea id="p-desc" rows={2} value={p.descripcion ?? ''} onChange={(e) => setP((x) => ({ ...x, descripcion: e.target.value || null }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Áreas donde se aplica (sin marcar: una inspección general)</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {areas
                  .filter((a) => a.activa || areasSel.includes(a.id))
                  .map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={areasSel.includes(a.id)} onCheckedChange={(v) => setAreasSel((s) => (v ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
                      {a.nombre}
                    </label>
                  ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={p.activo} onCheckedChange={(v) => setP((x) => ({ ...x, activo: !!v }))} /> Plantilla activa
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-bold">Ítems a revisar</p>
            <p className="text-xs text-muted-foreground">
              Los ítems ya usados no se borran (los tienen inspecciones anteriores): se desactivan y dejan de preguntarse.
            </p>
            {items.map((it, i) => (
              <div key={it.id ?? `nuevo-${i}`} className={cn('flex items-center gap-2', !it.activo && 'opacity-60')}>
                <span className="w-6 text-right font-mono-tabular text-xs text-muted-foreground">{i + 1}.</span>
                <Input value={it.texto} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} placeholder="Qué se revisa" />
                <button type="button" onClick={() => mover(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Subir">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Bajar">
                  <ArrowDown className="h-4 w-4" />
                </button>
                {it.id ? (
                  <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                    <Checkbox checked={it.activo} onCheckedChange={(v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, activo: !!v } : x)))} /> Activo
                  </label>
                ) : (
                  <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Quitar">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setItems((xs) => [...xs, { texto: '', activo: true }])}>
              <Plus className="mr-1 h-4 w-4" /> Agregar ítem
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar plantilla'}
          </Button>
        </div>
      </form>
    </div>
  )
}

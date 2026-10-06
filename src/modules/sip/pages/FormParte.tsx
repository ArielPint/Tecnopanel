import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { Cargando, selectClase } from '../components/comunes'
import { guardarParte, obtenerParte, type LineaInput } from '../lib/api'
import { calcularMateriales } from '../lib/calculo'
import { aDestino, deDestino } from '../lib/destinos'
import SelectorDestino from '../components/SelectorDestino'
import { fmtCant, fmtHora, hoyChile } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

interface LineaForm {
  key: string
  id?: string
  panel_id: string
  buenos: string
  rechazados: string
  /** 'h:<obra>' | 'p:<proyecto propio>' | '' (ver lib/destinos) */
  destino: string
  referencia: string
}

let correlativo = 0
const nuevaLinea = (base?: Partial<LineaForm>): LineaForm => ({
  key: `n${++correlativo}`,
  panel_id: '',
  buenos: '',
  rechazados: '',
  destino: base?.destino ?? '',
  referencia: base?.referencia ?? '',
})

const entero = (s: string) => (s.trim() === '' ? 0 : Number(s))

/** Tramo sugerido para un ingreso por hora: la hora que acaba de terminar. */
function tramoSugerido(): { desde: string; hasta: string } {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const desde = Math.max(0, h - 1)
  return { desde: `${String(desde).padStart(2, '0')}:00`, hasta: `${String(desde + 1).padStart(2, '0')}:00` }
}

export default function FormParte() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSip('produccion')
  const { panelesProducibles, destinos, recetas, materiales, panelPorId, loading: catLoading } = useCatalogo()

  const [cargando, setCargando] = useState(!!id)
  const [autor, setAutor] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoyChile())
  const [porHora, setPorHora] = useState(false)
  const [horaDesde, setHoraDesde] = useState('')
  const [horaHasta, setHoraHasta] = useState('')
  const [observacion, setObservacion] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!id) return
    obtenerParte(id)
      .then(({ parte, lineas }) => {
        setAutor(parte.created_by)
        setFecha(parte.fecha)
        setPorHora(!!parte.hora_desde)
        setHoraDesde(fmtHora(parte.hora_desde))
        setHoraHasta(fmtHora(parte.hora_hasta))
        setObservacion(parte.observacion ?? '')
        setLineas(
          lineas.map((l) => ({
            key: l.id,
            id: l.id,
            panel_id: l.panel_id,
            buenos: String(l.buenos),
            rechazados: l.rechazados ? String(l.rechazados) : '',
            destino: aDestino(l),
            referencia: l.referencia ?? '',
          })),
        )
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar')
        navigate(RUTA.registro, { replace: true })
      })
      .finally(() => setCargando(false))
  }, [id, navigate])

  // Vista previa del consumo con la receta vigente (las líneas ya guardadas conservan la suya)
  const previa = useMemo(
    () =>
      calcularMateriales(
        lineas.filter((l) => l.panel_id).map((l) => ({ panel_id: l.panel_id, cantidad: entero(l.buenos) + entero(l.rechazados) })),
        recetas,
        materiales,
      ),
    [lineas, recetas, materiales],
  )

  if (permisosLoading || catLoading || cargando) return <Cargando />
  const puedeEditar = id ? puede('editar') || (puede('crear') && autor === userId) : puede('crear')
  if (!puedeEditar) return <Navigate to={id ? RUTA.parte(id) : RUTA.registro} replace />

  const cambiar = (key: string, cambios: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const validas = lineas.filter((l) => l.panel_id || l.buenos || l.rechazados)
    if (validas.length === 0) return toast.error('Agregue al menos un panel')
    for (const l of validas) {
      if (!l.panel_id) return toast.error('Falta elegir el panel en una de las líneas')
      const b = entero(l.buenos)
      const r = entero(l.rechazados)
      if (!Number.isInteger(b) || !Number.isInteger(r) || b < 0 || r < 0) return toast.error('Las cantidades deben ser números enteros, sin negativos')
      if (b + r === 0) return toast.error(`${panelPorId.get(l.panel_id)?.codigo ?? 'Un panel'}: indique cuántos buenos o rechazados`)
    }
    if (porHora && (!horaDesde || !horaHasta || horaHasta <= horaDesde)) return toast.error('El tramo de horas no es válido: "hasta" debe ser después de "desde"')

    setGuardando(true)
    try {
      const nuevoId = await guardarParte({
        id,
        fecha,
        hora_desde: porHora ? horaDesde : null,
        hora_hasta: porHora ? horaHasta : null,
        observacion,
        lineas: validas.map<LineaInput>((l) => ({
          id: l.id,
          panel_id: l.panel_id,
          buenos: entero(l.buenos),
          rechazados: entero(l.rechazados),
          ...deDestino(l.destino),
          referencia: l.referencia,
        })),
      })
      toast.success(id ? 'Registro corregido' : 'Producción registrada')
      navigate(RUTA.parte(nuevoId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  // Al corregir se puede dejar un panel ya desactivado; para elegir uno nuevo, solo los producibles
  const opcionesPanel = (actual: string) => {
    const lista = panelesProducibles.slice()
    const p = panelPorId.get(actual)
    if (p && !lista.includes(p)) lista.unshift(p)
    return lista
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link to={id ? RUTA.parte(id) : RUTA.registro} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="mt-1 text-xl font-extrabold">{id ? 'Corregir registro' : 'Registrar producción'}</h1>
        <p className="text-sm text-muted-foreground">
          Indique los paneles fabricados. Los materiales se calculan solos con la receta de cada panel.
        </p>
      </div>

      {panelesProducibles.length === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No hay paneles con receta. Cárguelos en <Link to={RUTA.recetas} className="font-semibold underline">Paneles y recetas</Link> (se puede importar el Excel de SAP).
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cuándo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-fecha">Fecha</Label>
            <Input id="f-fecha" type="date" value={fecha} max={hoyChile()} onChange={(e) => e.target.value && setFecha(e.target.value)} required className="w-auto" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ingreso</Label>
            <div className="inline-flex rounded-md border p-0.5" role="radiogroup">
              {[
                { v: false, label: 'Día completo' },
                { v: true, label: 'Por hora' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={porHora === o.v}
                  onClick={() => {
                    setPorHora(o.v)
                    if (o.v && !horaDesde) {
                      const t = tramoSugerido()
                      setHoraDesde(t.desde)
                      setHoraHasta(t.hasta)
                    }
                  }}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    porHora === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {porHora && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-desde">Desde</Label>
                <Input id="f-desde" type="time" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} required className="w-auto" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-hasta">Hasta</Label>
                <Input id="f-hasta" type="time" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} required className="w-auto" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paneles fabricados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineas.map((l, i) => (
            <div key={l.key} className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_90px_90px] lg:grid-cols-[minmax(0,2fr)_90px_90px_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-xs">Panel</Label>
                <select value={l.panel_id} onChange={(e) => cambiar(l.key, { panel_id: e.target.value })} className={`${selectClase} w-full`} required aria-label={`Panel línea ${i + 1}`}>
                  <option value="">Elegir panel…</option>
                  {opcionesPanel(l.panel_id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.descripcion}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Buenos</Label>
                <Input type="number" inputMode="numeric" min={0} step={1} value={l.buenos} onChange={(e) => cambiar(l.key, { buenos: e.target.value })} placeholder="0" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Rechazados</Label>
                <Input type="number" inputMode="numeric" min={0} step={1} value={l.rechazados} onChange={(e) => cambiar(l.key, { rechazados: e.target.value })} placeholder="0" />
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-xs">Proyecto (opcional)</Label>
                <SelectorDestino
                  destinos={destinos}
                  valor={l.destino}
                  onChange={(v) => cambiar(l.key, { destino: v })}
                  vacio="Sin proyecto"
                  className="w-full"
                  aria-label={`Proyecto línea ${i + 1}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">OT / pedido (opcional)</Label>
                <Input value={l.referencia} onChange={(e) => cambiar(l.key, { referencia: e.target.value })} placeholder="Ej: OT-1234" maxLength={80} />
              </div>
              <div className="flex items-end justify-end sm:justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLineas((ls) => (ls.length === 1 ? [nuevaLinea()] : ls.filter((x) => x.key !== l.key)))}
                  aria-label="Quitar panel"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, nuevaLinea(ls[ls.length - 1])])}>
            <Plus className="mr-1 h-4 w-4" /> Agregar otro panel
          </Button>
          <div className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="f-obs">Observación (opcional)</Label>
            <Textarea id="f-obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} maxLength={500} placeholder="Detenciones, cambios de turno, motivo de rechazos…" />
          </div>
        </CardContent>
      </Card>

      {previa.materiales.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Materiales que consume</CardTitle>
            <p className="text-xs text-muted-foreground">Buenos + rechazados, con la receta vigente de cada panel.</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previa.materiales.map((m) => (
                  <TableRow key={m.material_id}>
                    <TableCell>
                      <span className="font-mono-tabular text-xs text-muted-foreground">{m.codigo}</span> {m.descripcion}
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular font-semibold">{fmtCant(m.total)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || panelesProducibles.length === 0}>
          {guardando ? 'Guardando…' : id ? 'Guardar corrección' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}

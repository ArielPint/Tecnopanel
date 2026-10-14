import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Cargando, selectClase } from '../components/comunes'
import Cuando, { type ValorCuando } from '../components/Cuando'
import { guardarParteCorte, listarItemsSap, listarStock, obtenerParteCorte, type ItemSap, type LineaCorteInput, type StockPanel } from '../lib/api'
import { etiquetaItem } from '../lib/cortes'
import { fmtHora, fmtNum, hoyChile } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useSucursalSip } from '../hooks/useSucursalSip'
import type { Sucursal } from '@/lib/lineasNegocio'

interface LineaForm {
  key: string
  id?: string
  proyecto: string
  item_id: string
  cortados: string
  rechazados: string
  referencia: string
}

let correlativo = 0
const nuevaLinea = (base?: Partial<LineaForm>): LineaForm => ({
  key: `n${++correlativo}`,
  proyecto: base?.proyecto ?? '',
  item_id: '',
  cortados: '',
  rechazados: '',
  referencia: base?.referencia ?? '',
})

const entero = (s: string) => (s.trim() === '' ? 0 : Number(s))

export default function FormCorte() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSip('cortes')
  const { fija, porDefecto, loading: sucursalLoading } = useSucursalSip()

  const [items, setItems] = useState<ItemSap[]>([])
  const [stock, setStock] = useState<StockPanel[]>([])
  const [cargando, setCargando] = useState(true)
  const [autor, setAutor] = useState<string | null>(null)
  const [sucursal, setSucursal] = useState<Sucursal | ''>('')
  /** sucursal con que se guardó el registro que se corrige */
  const [sucursalOriginal, setSucursalOriginal] = useState<Sucursal | null>(null)
  const [cuando, setCuando] = useState<ValorCuando>({ fecha: hoyChile(), porHora: false, horaDesde: '', horaHasta: '' })
  const [observacion, setObservacion] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])
  /** Lo que este registro ya tenía descontado por panel: al corregir, vuelve a estar disponible */
  const [yaDescontado, setYaDescontado] = useState<Map<string, number>>(new Map())
  const [guardando, setGuardando] = useState(false)

  // Al registrar se sugiere la sucursal que se está mirando; al corregir, la del registro
  const sucursalElegida: Sucursal | '' = fija ?? (sucursal || (id ? '' : (porDefecto ?? '')))

  useEffect(() => {
    let cancelado = false
    Promise.all([listarItemsSap(), id ? obtenerParteCorte(id) : null])
      .then(([its, existente]) => {
        if (cancelado) return
        setItems(its)
        if (existente) {
          const { parte, lineas } = existente
          setAutor(parte.created_by)
          setSucursal(parte.sucursal)
          setSucursalOriginal(parte.sucursal)
          setCuando({ fecha: parte.fecha, porHora: !!parte.hora_desde, horaDesde: fmtHora(parte.hora_desde), horaHasta: fmtHora(parte.hora_hasta) })
          setObservacion(parte.observacion ?? '')
          setLineas(
            lineas.map((l) => ({
              key: l.id,
              id: l.id,
              proyecto: l.proyecto_codigo,
              item_id: l.item_id,
              cortados: String(l.cortados),
              rechazados: l.rechazados ? String(l.rechazados) : '',
              referencia: l.referencia ?? '',
            })),
          )
          const m = new Map<string, number>()
          for (const l of lineas) m.set(l.panel_id, (m.get(l.panel_id) ?? 0) + l.total)
          setYaDescontado(m)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar')
        navigate(id ? RUTA.corte(id) : RUTA.cortes, { replace: true })
      })
      .finally(() => !cancelado && setCargando(false))
    return () => {
      cancelado = true
    }
  }, [id, navigate])

  // El stock es de cada sucursal: se cuenta el de la elegida en el formulario
  useEffect(() => {
    if (!sucursalElegida) return setStock([])
    let cancelado = false
    listarStock(sucursalElegida)
      .then((st) => !cancelado && setStock(st))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo cargar el stock'))
    return () => {
      cancelado = true
    }
  }, [sucursalElegida])

  const itemPorId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const disponiblePorPanel = useMemo(() => new Map(stock.map((s) => [s.panel_id, s.disponible])), [stock])
  /** Lo ya descontado por este registro solo vuelve a estar disponible si sigue en la misma sucursal */
  const devuelto = useMemo(() => (sucursalElegida === sucursalOriginal ? yaDescontado : new Map<string, number>()), [sucursalElegida, sucursalOriginal, yaDescontado])

  // Proyectos para elegir: los activos, y al corregir también los que ya trae el registro
  const proyectos = useMemo(() => {
    const enUso = new Set(lineas.map((l) => l.proyecto))
    const m = new Map<string, { codigo: string; nombre: string }>()
    for (const i of items) if ((i.proyecto_activo && i.vigente) || enUso.has(i.proyecto_codigo)) m.set(i.proyecto_codigo, { codigo: i.proyecto_codigo, nombre: i.proyecto_nombre })
    return [...m.values()].sort((a, b) => b.codigo.localeCompare(a.codigo))
  }, [items, lineas])

  // Stock que queda por panel con lo que se está ingresando (todas las líneas del mismo panel juntas)
  const faltante = useMemo(() => {
    const usado = new Map<string, number>()
    for (const l of lineas) {
      const it = itemPorId.get(l.item_id)
      if (it) usado.set(it.panel_id, (usado.get(it.panel_id) ?? 0) + entero(l.cortados) + entero(l.rechazados))
    }
    const salida = new Map<string, { disponible: number; usado: number }>()
    for (const [panel, u] of usado) {
      const disponible = (disponiblePorPanel.get(panel) ?? 0) + (devuelto.get(panel) ?? 0)
      if (u > disponible) salida.set(panel, { disponible, usado: u })
    }
    return salida
  }, [lineas, itemPorId, disponiblePorPanel, devuelto])

  if (permisosLoading || sucursalLoading || cargando) return <Cargando />
  const puedeEditar = id ? puede('editar') || (puede('crear') && autor === userId) : puede('crear')
  if (!puedeEditar) return <Navigate to={id ? RUTA.corte(id) : RUTA.cortes} replace />

  const cambiar = (key: string, cambios: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const validas = lineas.filter((l) => l.item_id || l.cortados || l.rechazados)
    if (validas.length === 0) return toast.error('Agrega al menos un corte')
    for (const l of validas) {
      if (!l.item_id) return toast.error('Falta elegir el panel del proyecto en una de las líneas')
      const c = entero(l.cortados)
      const r = entero(l.rechazados)
      if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0) return toast.error('Las cantidades deben ser números enteros, sin negativos')
      if (c + r === 0) return toast.error(`${itemPorId.get(l.item_id)?.panel_codigo ?? 'Un panel'}: indica cuántos se cortaron o se rechazaron`)
    }
    if (!sucursalElegida) return toast.error('Elige la sucursal donde se cortó')
    if (faltante.size > 0) return toast.error('No hay stock suficiente para alguno de los paneles. Revisa las cantidades.')
    if (cuando.porHora && (!cuando.horaDesde || !cuando.horaHasta || cuando.horaHasta <= cuando.horaDesde))
      return toast.error('El tramo de horas no es válido: "hasta" debe ser después de "desde"')

    setGuardando(true)
    try {
      const nuevoId = await guardarParteCorte({
        id,
        fecha: cuando.fecha,
        hora_desde: cuando.porHora ? cuando.horaDesde : null,
        hora_hasta: cuando.porHora ? cuando.horaHasta : null,
        observacion,
        sucursal: sucursalElegida,
        lineas: validas.map<LineaCorteInput>((l) => ({
          id: l.id,
          item_id: l.item_id,
          cortados: entero(l.cortados),
          rechazados: entero(l.rechazados),
          referencia: l.referencia,
        })),
      })
      toast.success(id ? 'Registro corregido' : 'Corte registrado')
      navigate(RUTA.corte(nuevoId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link to={id ? RUTA.corte(id) : RUTA.cortes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        <h1 className="mt-1 text-xl font-extrabold">{id ? 'Corregir corte' : 'Registrar corte'}</h1>
        <p className="text-sm text-muted-foreground">
          Elige el proyecto de SAP y el panel de su estructura: el tipo de corte viene de SAP. Los paneles cortados salen del stock.
        </p>
      </div>

      {proyectos.length === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No hay proyectos activos de SAP con cortes. Se sincronizan solos desde SAP; si falta alguno, revisa que su Cubicación esté liberada.
        </p>
      )}

      <Cuando valor={cuando} onChange={setCuando} donde={{ sucursal: sucursalElegida, onSucursal: setSucursal, fija }} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paneles cortados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineas.map((l, i) => {
            const it = itemPorId.get(l.item_id)
            const opciones = items.filter((x) => x.proyecto_codigo === l.proyecto && (x.vigente || x.id === l.item_id))
            const falta = it ? faltante.get(it.panel_id) : undefined
            const disponible = it ? (disponiblePorPanel.get(it.panel_id) ?? 0) + (devuelto.get(it.panel_id) ?? 0) : null
            return (
              <div key={l.key} className={cn('space-y-2 rounded-md border p-3', falta && 'border-destructive/60')}>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                  <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
                    <Label className="text-xs">Proyecto SAP</Label>
                    <select
                      value={l.proyecto}
                      onChange={(e) => cambiar(l.key, { proyecto: e.target.value, item_id: '' })}
                      className={`${selectClase} w-full`}
                      required
                      aria-label={`Proyecto línea ${i + 1}`}
                    >
                      <option value="">Elegir proyecto…</option>
                      {proyectos.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.codigo} · {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
                    <Label className="text-xs">Modelo de vivienda · tipo de panel · corte</Label>
                    <select
                      value={l.item_id}
                      onChange={(e) => cambiar(l.key, { item_id: e.target.value })}
                      className={`${selectClase} w-full`}
                      required
                      disabled={!l.proyecto}
                      aria-label={`Panel línea ${i + 1}`}
                    >
                      <option value="">{l.proyecto ? 'Elegir panel…' : 'Primero elige el proyecto'}</option>
                      {opciones.map((x) => (
                        <option key={x.id} value={x.id}>
                          {etiquetaItem(x)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_90px_minmax(0,1fr)_auto]">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Cortados</Label>
                    <Input type="number" inputMode="numeric" min={0} step={1} value={l.cortados} onChange={(e) => cambiar(l.key, { cortados: e.target.value })} placeholder="0" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Rechazados</Label>
                    <Input type="number" inputMode="numeric" min={0} step={1} value={l.rechazados} onChange={(e) => cambiar(l.key, { rechazados: e.target.value })} placeholder="0" />
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
                      aria-label="Quitar línea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {it && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      SAP: <b className="text-foreground">{fmtNum(it.paneles_plan, 1)}</b> paneles ({fmtNum(it.paneles_por_vivienda, 2)} × {fmtNum(it.viviendas)} viv.)
                    </span>
                    <span>
                      Ya cortados: <b className="text-foreground">{fmtNum(it.cortados)}</b>
                    </span>
                    <span className={cn(falta && 'font-semibold text-destructive')}>
                      Stock de {it.panel_codigo}{sucursalElegida && ` en ${sucursalElegida}`}: {sucursalElegida ? fmtNum(disponible ?? 0) : '—'}
                      {falta && ` · faltan ${fmtNum(falta.usado - falta.disponible)}`}
                    </span>
                  </p>
                )}
              </div>
            )
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, nuevaLinea(ls[ls.length - 1])])}>
            <Plus className="mr-1 h-4 w-4" /> Agregar otro panel
          </Button>
          <div className="flex flex-col gap-1.5 pt-2">
            <Label htmlFor="f-obs">Observación (opcional)</Label>
            <Textarea id="f-obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} maxLength={500} placeholder="Detenciones, cambios de turno, motivo de rechazos…" />
          </div>
        </CardContent>
      </Card>

      {faltante.size > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          No hay stock suficiente en {sucursalElegida}. Registra primero la fabricación de esos paneles en esa sucursal o, si ya estaban en bodega, carga su stock inicial en{' '}
          <Link to={RUTA.stock} className="font-semibold underline">
            Stock de paneles
          </Link>
          .
        </p>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || proyectos.length === 0 || faltante.size > 0}>
          {guardando ? 'Guardando…' : id ? 'Guardar corrección' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}

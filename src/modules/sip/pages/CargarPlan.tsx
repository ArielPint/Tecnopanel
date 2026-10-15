import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Cargando, selectClase } from '../components/comunes'
import { guardarPlan, listarItemsSap, listarPlan, type ItemSap, type PlanFila } from '../lib/api'
import { fmtFecha, fmtFechaHora, fmtNum, hoyChile, inicioSemana, sumarDias } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useSucursalSip } from '../hooks/useSucursalSip'

interface FilaForm {
  key: string
  proyecto: string
  panel_id: string
  pegado: string
  corte: string
}

let correlativo = 0
const nuevaFila = (base?: Partial<FilaForm>): FilaForm => ({ key: `n${++correlativo}`, proyecto: base?.proyecto ?? '', panel_id: base?.panel_id ?? '', pegado: base?.pegado ?? '', corte: base?.corte ?? '' })
const aForm = (filas: PlanFila[]) => filas.map((f) => nuevaFila({ proyecto: f.proyecto_codigo, panel_id: f.panel_id, pegado: f.pegado ? String(f.pegado) : '', corte: f.corte ? String(f.corte) : '' }))
const entero = (s: string) => (s.trim() === '' ? 0 : Number(s))
/** para saber si hay cambios sin guardar */
const huella = (filas: FilaForm[]) => JSON.stringify(filas.filter((f) => f.proyecto || f.panel_id || f.pegado || f.corte).map((f) => [f.proyecto, f.panel_id, entero(f.pegado), entero(f.corte)]))

/** Panel de la estructura de un proyecto SAP, con lo planificado allí y lo ya cortado */
interface PanelProyecto {
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  plan: number
  cortados: number
}

/** Carga del plan de una semana en una sucursal: por proyecto SAP y panel, cuántos pegar y cuántos cortar. */
export default function CargarPlan() {
  const { puede, loading: permisosLoading } = usePermisosSip('plan')
  const { sucursal, loading: sucursalLoading } = useSucursalSip()
  const [semana, setSemana] = useState(() => sumarDias(inicioSemana(hoyChile()), 7))
  const [items, setItems] = useState<ItemSap[] | null>(null)
  const [guardadas, setGuardadas] = useState<PlanFila[] | null>(null)
  const [filas, setFilas] = useState<FilaForm[]>([nuevaFila()])
  const [guardando, setGuardando] = useState(false)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    listarItemsSap()
      .then(setItems)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos de SAP')
        setItems([])
      })
  }, [])

  useEffect(() => {
    if (sucursal === 'todas') return
    let cancelado = false
    setGuardadas(null)
    listarPlan(semana, semana, sucursal)
      .then((p) => {
        if (cancelado) return
        setGuardadas(p)
        setFilas(p.length ? aForm(p) : [nuevaFila()])
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo cargar el plan'))
    return () => {
      cancelado = true
    }
  }, [semana, sucursal])

  // Proyectos: los activos en SAP y los que ya están en el plan de la semana
  const proyectos = useMemo(() => {
    const enUso = new Set(filas.map((f) => f.proyecto))
    const m = new Map<string, string>()
    for (const i of items ?? []) if ((i.proyecto_activo && i.vigente) || enUso.has(i.proyecto_codigo)) m.set(i.proyecto_codigo, i.proyecto_nombre)
    return [...m].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items, filas])

  /** Paneles de cada proyecto (un panel puede estar en varios modelos de vivienda: se juntan) */
  const panelesPorProyecto = useMemo(() => {
    const m = new Map<string, Map<string, PanelProyecto>>()
    for (const i of items ?? []) {
      if (!i.vigente) continue
      let ps = m.get(i.proyecto_codigo)
      if (!ps) m.set(i.proyecto_codigo, (ps = new Map()))
      const p = ps.get(i.panel_id) ?? { panel_id: i.panel_id, panel_codigo: i.panel_codigo, panel_descripcion: i.panel_descripcion, plan: 0, cortados: 0 }
      p.plan += i.paneles_plan
      p.cortados += i.cortados
      ps.set(i.panel_id, p)
    }
    return m
  }, [items])

  const original = useMemo(() => huella(guardadas ? aForm(guardadas) : []), [guardadas])
  const cambiado = guardadas !== null && huella(filas) !== original

  if (permisosLoading || sucursalLoading) return <Cargando />
  if (!puede('editar')) return <Navigate to={RUTA.plan} replace />
  if (sucursal === 'todas') {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">El plan es de cada sucursal: elija Santiago o Puerto Varas arriba para cargarlo.</p>
  }
  if (!items) return <Cargando />

  const cambiar = (key: string, cambios: Partial<FilaForm>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambios } : f)))
  const totales = filas.reduce((t, f) => ({ pegado: t.pegado + entero(f.pegado), corte: t.corte + entero(f.corte) }), { pegado: 0, corte: 0 })
  const ultima = (guardadas ?? []).reduce<PlanFila | null>((m, f) => (!m || f.updated_at > m.updated_at ? f : m), null)

  async function copiarAnterior() {
    if (sucursal === 'todas') return
    setCopiando(true)
    try {
      const previas = await listarPlan(sumarDias(semana, -7), sumarDias(semana, -7), sucursal)
      if (previas.length === 0) toast.info('La semana anterior no tiene plan')
      else {
        setFilas(aForm(previas))
        toast.success(`Se copiaron ${previas.length} filas de la semana anterior. Revíselas y guarde.`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo copiar')
    } finally {
      setCopiando(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (sucursal === 'todas') return
    const validas = filas.filter((f) => f.proyecto || f.panel_id || f.pegado || f.corte)
    const vistos = new Set<string>()
    for (const f of validas) {
      if (!f.proyecto || !f.panel_id) return toast.error('Falta elegir el proyecto o el panel en una de las filas')
      const p = entero(f.pegado)
      const c = entero(f.corte)
      if (!Number.isInteger(p) || !Number.isInteger(c) || p < 0 || c < 0) return toast.error('Las cantidades deben ser números enteros, sin negativos')
      if (p + c === 0) return toast.error(`${panelesPorProyecto.get(f.proyecto)?.get(f.panel_id)?.panel_codigo ?? 'Un panel'}: indique cuántos pegar o cortar, o quite la fila`)
      const k = `${f.proyecto}|${f.panel_id}`
      if (vistos.has(k)) return toast.error('Hay un panel repetido en el mismo proyecto: júntelo en una sola fila')
      vistos.add(k)
    }
    setGuardando(true)
    try {
      const n = await guardarPlan(
        sucursal,
        semana,
        validas.map((f) => ({ proyecto_codigo: f.proyecto, panel_id: f.panel_id, pegado: entero(f.pegado), corte: entero(f.corte) })),
      )
      toast.success(n ? `Plan guardado (${n} filas)` : 'Plan de la semana borrado')
      const p = await listarPlan(semana, semana, sucursal)
      setGuardadas(p)
      setFilas(p.length ? aForm(p) : [nuevaFila()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" disabled={cambiado} onClick={() => setSemana((s) => sumarDias(s, -7))} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[220px] text-center">
          <p className="font-semibold">
            Semana del {fmtFecha(semana)} al {fmtFecha(sumarDias(semana, 6))}
          </p>
          <p className="text-xs text-muted-foreground">
            {sucursal}
            {semana === inicioSemana(hoyChile()) && ' · semana en curso'}
          </p>
        </div>
        <Button type="button" variant="outline" size="icon" disabled={cambiado} onClick={() => setSemana((s) => sumarDias(s, 7))} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={semana}
          disabled={cambiado}
          onChange={(e) => e.target.value && setSemana(inicioSemana(e.target.value))}
          className="w-auto"
          aria-label="Ir a la semana de"
        />
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={copiarAnterior} disabled={copiando || guardadas === null}>
          <Copy className="mr-1 h-4 w-4" /> Copiar la semana anterior
        </Button>
      </div>
      {cambiado && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          Hay cambios sin guardar. Guárdelos o descártelos para cambiar de semana.
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setFilas(guardadas?.length ? aForm(guardadas) : [nuevaFila()])}>
            Descartar cambios
          </Button>
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paneles a pegar y cortar</CardTitle>
          <p className="text-xs text-muted-foreground">
            Por proyecto de SAP y tipo de panel. Total: {fmtNum(totales.pegado)} a pegar · {fmtNum(totales.corte)} a cortar.
            {ultima && ` Última modificación: ${fmtFechaHora(ultima.updated_at)}${ultima.actualizado_por ? ` por ${ultima.actualizado_por}` : ''}.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {guardadas === null ? (
            <Cargando />
          ) : (
            filas.map((f, i) => {
              const opciones = [...(panelesPorProyecto.get(f.proyecto)?.values() ?? [])].sort((a, b) => a.panel_codigo.localeCompare(b.panel_codigo))
              const elegido = panelesPorProyecto.get(f.proyecto)?.get(f.panel_id)
              return (
                <div key={f.key} className="space-y-1 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_100px_100px_auto]">
                    <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
                      <Label className="text-xs">Proyecto SAP</Label>
                      <select
                        value={f.proyecto}
                        onChange={(e) => cambiar(f.key, { proyecto: e.target.value, panel_id: panelesPorProyecto.get(e.target.value)?.has(f.panel_id) ? f.panel_id : '' })}
                        className={`${selectClase} w-full`}
                        aria-label={`Proyecto fila ${i + 1}`}
                      >
                        <option value="">Elegir proyecto…</option>
                        {proyectos.map(([codigo, nombre]) => (
                          <option key={codigo} value={codigo}>
                            {codigo} · {nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
                      <Label className="text-xs">Panel</Label>
                      <select
                        value={f.panel_id}
                        onChange={(e) => cambiar(f.key, { panel_id: e.target.value })}
                        className={`${selectClase} w-full`}
                        disabled={!f.proyecto}
                        aria-label={`Panel fila ${i + 1}`}
                      >
                        <option value="">{f.proyecto ? 'Elegir panel…' : 'Primero elija el proyecto'}</option>
                        {opciones.map((p) => (
                          <option key={p.panel_id} value={p.panel_id}>
                            {p.panel_codigo} · {p.panel_descripcion}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">A pegar</Label>
                      <Input type="number" inputMode="numeric" min={0} step={1} value={f.pegado} onChange={(e) => cambiar(f.key, { pegado: e.target.value })} placeholder="0" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">A cortar</Label>
                      <Input type="number" inputMode="numeric" min={0} step={1} value={f.corte} onChange={(e) => cambiar(f.key, { corte: e.target.value })} placeholder="0" />
                    </div>
                    <div className="col-span-2 flex items-end justify-end lg:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setFilas((fs) => (fs.length === 1 ? [nuevaFila()] : fs.filter((x) => x.key !== f.key)))}
                        aria-label="Quitar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {elegido && (
                    <p className="text-xs text-muted-foreground">
                      SAP: {fmtNum(elegido.plan, 1)} paneles en el proyecto · ya cortados {fmtNum(elegido.cortados)} · faltan {fmtNum(Math.max(0, elegido.plan - elegido.cortados), 1)}
                    </p>
                  )}
                </div>
              )
            })
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setFilas((fs) => [...fs, nuevaFila({ proyecto: fs[fs.length - 1]?.proyecto })])}>
            <Plus className="mr-1 h-4 w-4" /> Agregar fila
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button type="submit" disabled={guardando || !cambiado}>
          {guardando ? 'Guardando…' : 'Guardar plan de la semana'}
        </Button>
      </div>
    </form>
  )
}

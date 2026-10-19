import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Download, Save, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cargarXLSX } from '@/lib/cargarLibrerias'
import { cn } from '@/lib/utils'
import {
  BODEGAS,
  guardarPlan,
  listarObras,
  listarTiposVivienda,
  planificar,
  type EstadoPlan,
  type FilaPlan,
  type ObraPlanificable,
  type TipoVivienda,
} from '../lib/api'
import DialogoTiposVivienda from '../components/DialogoTiposVivienda'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'

// Planificación de materiales por bodega. El requerimiento sale del programa de viviendas del mes (tipo ×
// cantidad), explotado por las recetas de SAP: kit -> panel -> materia prima. Opcional: sumar lo que falta
// emitir de las órdenes de fabricación abiertas, que sí se cubre con lo ya fabricado. La compra sugerida
// descuenta el disponible real (con el conteo de Bodega), todas las OC pendientes aunque estén atrasadas y
// lo que ya está pedido en solicitudes abiertas. La fecha de la OC solo genera alerta.

const num = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n)
const fecha = (s: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('es-CL') : '—')
const haceMeses = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}
// el programa es del mes siguiente: los materiales se necesitan al empezarlo
const inicioMesSiguiente = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 12).toISOString().slice(0, 10)
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const ESTADO_PLAN: Record<EstadoPlan, { label: string; variant: 'destructive' | 'warning' | 'default' | 'success' }> = {
  critico: { label: 'Crítico', variant: 'destructive' },
  comprar: { label: 'Comprar', variant: 'warning' },
  en_solicitud: { label: 'En solicitud', variant: 'default' },
  cubierto: { label: 'Cubierto', variant: 'success' },
}

export default function Planificacion() {
  const navigate = useNavigate()
  const { sucursales, comprasEn, tiene } = usePermisosAdq()
  const bodegas = (['B006', 'B007'] as const).filter((b) => {
    const s = b === 'B006' ? 'Santiago' : 'Puerto Varas'
    return sucursales.reposicion.includes(s) || sucursales.control.includes(s)
  })
  const [bodega, setBodega] = useState<'B006' | 'B007'>('B006')
  useEffect(() => {
    if (bodegas.length && !bodegas.includes(bodega)) setBodega(bodegas[0])
  }, [bodegas.join(), bodega]) // eslint-disable-line react-hooks/exhaustive-deps
  const sucursal = bodega === 'B006' ? 'Santiago' : 'Puerto Varas'
  const puedeGuardar = comprasEn(sucursal)

  const [obras, setObras] = useState<ObraPlanificable[]>([])
  const [elegidas, setElegidas] = useState<Set<string> | null>(null) // null = todas
  const [buscarObra, setBuscarObra] = useState('')
  const [tipos, setTipos] = useState<TipoVivienda[]>([])
  const [programa, setPrograma] = useState<Record<number, string>>({})
  const [editarTipos, setEditarTipos] = useState(false)
  const [incluirOt, setIncluirOt] = useState(false)
  const [fechaNecesidad, setFechaNecesidad] = useState(inicioMesSiguiente())
  // SAP tiene órdenes de fabricación de años anteriores que nunca se cerraron: por defecto, las de 6 meses
  const [desde, setDesde] = useState(haceMeses(6))
  const [filas, setFilas] = useState<FilaPlan[] | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [filtro, setFiltro] = useState<'accion' | EstadoPlan | 'todos'>('accion')
  const [texto, setTexto] = useState('')
  const [planificado, setPlanificado] = useState<Record<string, string>>({})
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [guardar, setGuardar] = useState(false)

  const cargarTipos = () =>
    listarTiposVivienda()
      .then(setTipos)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudieron cargar los tipos de vivienda'))
  useEffect(() => {
    cargarTipos()
  }, [])
  const programaLista = tipos
    .filter((t) => t.activo && Number(programa[t.id]) > 0)
    .map((t) => ({ tipo_id: t.id, nombre: t.nombre, cantidad: Number(programa[t.id]) }))
  const totalViviendas = programaLista.reduce((a, x) => a + x.cantidad, 0)

  useEffect(() => {
    setFilas(null)
    setElegidas(null)
    listarObras(bodega, desde)
      .then(setObras)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudieron cargar las obras'))
  }, [bodega, desde])

  const obrasVisibles = useMemo(() => {
    const q = buscarObra.trim().toLowerCase()
    return obras.filter((o) => !q || (o.proyecto_nombre ?? '').toLowerCase().includes(q) || o.proyecto_codigo.includes(q))
  }, [obras, buscarObra])
  const estaElegida = (c: string) => elegidas == null || elegidas.has(c)
  const nElegidas = elegidas == null ? obras.length : elegidas.size

  async function calcular() {
    setCalculando(true)
    try {
      const r = await planificar(bodega, programaLista, incluirOt, elegidas == null ? null : [...elegidas], fechaNecesidad || null, desde || null)
      setFilas(r)
      setPlanificado({})
      setSeleccion(new Set(r.filter((f) => f.compra_sugerida > 0).map((f) => f.articulo_codigo)))
      setFiltro('accion')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo calcular')
    } finally {
      setCalculando(false)
    }
  }

  const cumple = (f: FilaPlan, x: typeof filtro) =>
    x === 'todos' ? true : x === 'accion' ? f.estado === 'critico' || f.estado === 'comprar' || f.oc_atrasada > 0 : f.estado === x
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return (filas ?? [])
      .filter((f) => cumple(f, filtro))
      .filter(
        (f) =>
          !q ||
          f.articulo_nombre.toLowerCase().includes(q) ||
          f.articulo_codigo.toLowerCase().includes(q) ||
          (f.grupo ?? '').toLowerCase().includes(q) ||
          (f.familia ?? '').toLowerCase().includes(q),
      )
  }, [filas, filtro, texto]) // eslint-disable-line react-hooks/exhaustive-deps

  const cantidad = (f: FilaPlan) => {
    const v = planificado[f.articulo_codigo]
    return v == null ? f.compra_sugerida : Number(v)
  }
  const elegidasPlan = (filas ?? []).filter((f) => seleccion.has(f.articulo_codigo) && cantidad(f) > 0)
  const valorPlan = elegidasPlan.reduce((t, f) => t + cantidad(f) * (f.ultimo_precio ?? 0), 0)

  async function exportar() {
    if (!filas) return
    const XLSX = await cargarXLSX()
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(
        lista.map((f) => ({
          Código: f.articulo_codigo,
          Material: f.articulo_nombre,
          Unidad: f.unidad ?? '',
          Grupo: f.grupo ?? '',
          Requerimiento: f.requerimiento,
          'Del programa': f.req_programa,
          Familia: f.familia ?? '',
          'Stock SAP': f.stock_sap,
          'Stock físico': f.stock_fisico ?? '',
          Inutilizable: f.inutilizable,
          'Comprometido bodega': f.comprometido_bodega ?? '',
          'Disponible real': f.disponible_real,
          'OC pendiente': f.oc_pendiente,
          'OC atrasada': f.oc_atrasada,
          'OC en plazo': f.oc_en_plazo,
          'OC posterior': f.oc_posterior,
          'OC sin fecha': f.oc_sin_fecha,
          'En solicitud': f.en_solicitud,
          Mínimo: f.minimo,
          'Compra sugerida': f.compra_sugerida,
          'Saldo después del plan': f.saldo_despues,
          Estado: ESTADO_PLAN[f.estado].label,
          'Alerta OC': f.alerta_oc ?? '',
          'Último precio': f.ultimo_precio ?? '',
          'Último proveedor': f.ultimo_proveedor ?? '',
        })),
      ),
      'Planificación',
    )
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet([
        ...programaLista.map((x) => ({ Origen: 'Programa de viviendas', Detalle: x.nombre, Viviendas: x.cantidad })),
        ...(incluirOt
          ? obras.filter((o) => estaElegida(o.proyecto_codigo)).map((o) => ({ Origen: 'Orden de obra abierta', Detalle: `${o.proyecto_codigo} · ${o.proyecto_nombre ?? ''}`, Viviendas: '' }))
          : []),
      ]),
      'Alcance',
    )
    XLSX.writeFile(libro, `Planificacion_${bodega}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const FILTROS: [typeof filtro, string][] = [
    ['accion', 'Requieren acción'],
    ['critico', 'Críticos'],
    ['comprar', 'Comprar'],
    ['en_solicitud', 'En solicitud'],
    ['cubierto', 'Cubiertos'],
    ['todos', 'Todos'],
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Planificación de materiales</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Indica cuántas viviendas de cada tipo se fabricarán y el requerimiento sale de las recetas de SAP (kits, paneles y materia prima). Compra sugerida =
          requerimiento + mínimo − disponible real − OC pendientes − lo ya pedido en solicitudes. Una OC atrasada sigue cubriendo la necesidad: solo genera alerta.
          Crítico: hay que comprar y no queda disponible en bodega.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {bodegas.map((b) => (
          <button
            key={b}
            onClick={() => setBodega(b)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-semibold',
              bodega === b ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {BODEGAS[b]} <span className="font-mono-tabular text-xs opacity-70">{b}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">Programa de viviendas</p>
            {tiene('jefe_compras') && (
              <Button size="sm" variant="ghost" onClick={() => setEditarTipos(true)}>
                <Settings2 className="mr-1 h-4 w-4" /> Tipos de vivienda
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cuántas viviendas de cada tipo se van a fabricar. Cada tipo es un conjunto de kits de SAP y sus recetas dan la materia prima y los materiales.
          </p>
          {tipos.filter((t) => t.activo).length === 0 ? (
            <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">No hay tipos de vivienda activos.</p>
          ) : (
            <div className="divide-y rounded border">
              {tipos
                .filter((t) => t.activo)
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.nombre}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {t.kits.length} kits
                        {t.kits.some((k) => k.componentes === 0) && <span className="text-warning"> · hay kits sin receta en SAP</span>}
                      </span>
                    </span>
                    <Input
                      inputMode="numeric"
                      value={programa[t.id] ?? ''}
                      onChange={(e) => setPrograma((p) => ({ ...p, [t.id]: e.target.value.replace(/\D/g, '') }))}
                      className="h-8 w-20 text-right font-mono-tabular"
                      placeholder="0"
                      aria-label={`Viviendas ${t.nombre}`}
                    />
                    <span className="text-xs text-muted-foreground">viv.</span>
                  </div>
                ))}
            </div>
          )}
          <p className="text-right text-xs text-muted-foreground">
            Total: <span className="font-mono-tabular font-semibold text-foreground">{totalViviendas}</span> viviendas
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Materiales necesarios para el</span>
            <Input type="date" value={fechaNecesidad} onChange={(e) => setFechaNecesidad(e.target.value)} className="h-8 w-40" />
          </label>
          <p className="text-[11px] text-muted-foreground">Maquilas, fletes y gastos no se planifican: no son de inventario.</p>
          <div className="flex justify-end">
            <Button onClick={calcular} disabled={calculando || (totalViviendas === 0 && !(incluirOt && nElegidas > 0))}>
              <Calculator className="mr-1 h-4 w-4" /> {calculando ? 'Calculando…' : 'Calcular'}
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-2 rounded-md border bg-card p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-[hsl(var(--brand))]" checked={incluirOt} onChange={(e) => setIncluirOt(e.target.checked)} />
            <span>
              <span className="font-bold">Sumar lo pendiente de las órdenes de fabricación abiertas</span>
              <span className="block text-xs text-muted-foreground">
                Lo que falta emitir de las órdenes de obras, kits y paneles ya liberadas en SAP, para no usar dos veces el mismo stock. Lo programado no se cubre con
                kits o paneles ya fabricados: esos son de las obras en curso.
              </span>
            </span>
          </label>
          {incluirOt && (
            <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              Obras con orden abierta <span className="font-normal text-muted-foreground">· {nElegidas} de {obras.length}</span>
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setElegidas(null)}>
                Todas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setElegidas(new Set())}>
                Ninguna
              </Button>
            </div>
          </div>
          <Input value={buscarObra} onChange={(e) => setBuscarObra(e.target.value)} placeholder="Buscar obra" className="h-8" />
          <div className="max-h-56 overflow-y-auto rounded border">
            {obrasVisibles.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No hay obras con orden abierta en esta bodega.</p>
            ) : (
              obrasVisibles.map((o) => (
                <label key={o.proyecto_codigo} className="flex cursor-pointer items-start gap-2 border-b px-2 py-1.5 text-sm last:border-0 hover:bg-accent/50">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[hsl(var(--brand))]"
                    checked={estaElegida(o.proyecto_codigo)}
                    onChange={(e) =>
                      setElegidas((prev) => {
                        const n = new Set(prev ?? obras.map((x) => x.proyecto_codigo))
                        if (e.target.checked) n.add(o.proyecto_codigo)
                        else n.delete(o.proyecto_codigo)
                        return n
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={o.proyecto_nombre ?? undefined}>
                      {o.proyecto_nombre ?? o.proyecto_codigo}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-muted-foreground">
                      {o.proyecto_codigo} · desde {fecha(o.desde)} · {o.lineas_pendientes} líneas por emitir
                      {o.kits_pendientes > 0 && ` · ${num(o.kits_pendientes, 0)} kits`}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Órdenes de fabricación creadas desde</span>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-40" />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Las órdenes de kits y paneles liberadas desde esa fecha se consideran siempre: SAP no las asocia a una obra.
          </p>
            </>
          )}
        </div>

      </div>

      {filas && (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {label} <span className="tabular-nums opacity-70">{filas.filter((f) => cumple(f, k)).length}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar material, código, familia o grupo" className="h-9 w-full sm:w-72" />
            <Button size="sm" variant="outline" onClick={exportar}>
              <Download className="mr-1 h-4 w-4" /> Excel
            </Button>
            {puedeGuardar && (
              <Button size="sm" className="ml-auto" disabled={elegidasPlan.length === 0} onClick={() => setGuardar(true)}>
                <Save className="mr-1 h-4 w-4" /> Guardar plan ({elegidasPlan.length})
              </Button>
            )}
          </div>

          {lista.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {filas.length === 0 ? 'Con este programa no hay materiales que planificar.' : 'No hay materiales con estos filtros.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full min-w-[1200px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    {puedeGuardar && <th className="w-8 px-3 py-2" />}
                    <th className="px-2 py-2 font-semibold">Material</th>
                    <th className="px-2 py-2 text-right font-semibold">Requerimiento</th>
                    <th className="px-2 py-2 text-right font-semibold">Disponible real</th>
                    <th className="px-2 py-2 text-right font-semibold">OC pendiente</th>
                    <th className="px-2 py-2 text-right font-semibold">En solicitud</th>
                    <th className="px-2 py-2 text-right font-semibold">Mínimo</th>
                    <th className="px-2 py-2 text-right font-semibold">Saldo después</th>
                    <th className="px-2 py-2 text-right font-semibold">Sugerido</th>
                    {puedeGuardar && <th className="w-28 px-2 py-2 font-semibold">A comprar</th>}
                    <th className="px-2 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, 500).map((f) => (
                    <tr key={f.articulo_codigo} className={cn('border-b align-top last:border-0', f.estado === 'critico' && 'bg-destructive/5')}>
                      {puedeGuardar && (
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            className="mt-1 accent-[hsl(var(--brand))]"
                            aria-label={`Incluir ${f.articulo_nombre} en el plan`}
                            checked={seleccion.has(f.articulo_codigo)}
                            onChange={(e) =>
                              setSeleccion((s) => {
                                const n = new Set(s)
                                if (e.target.checked) n.add(f.articulo_codigo)
                                else n.delete(f.articulo_codigo)
                                return n
                              })
                            }
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        <p className="max-w-[320px] truncate font-medium" title={f.articulo_nombre}>
                          {f.articulo_nombre}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-muted-foreground">
                          {f.articulo_codigo} · {f.unidad ?? '—'}
                          {f.familia && ` · ${f.familia}`}
                          {f.ultimo_proveedor && ` · ${f.ultimo_proveedor}`}
                        </p>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono-tabular">
                        {num(f.requerimiento)}
                        {f.req_programa > 0 && f.req_programa < f.requerimiento && (
                          <p className="text-[11px] text-muted-foreground">{num(f.req_programa)} del programa</p>
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right font-mono-tabular"
                        title={`Stock ${f.fuente_stock === 'Físico' ? 'físico' : 'SAP'} ${num(f.stock_fisico ?? f.stock_sap)} − inutilizable ${num(f.inutilizable)} − comprometido bodega ${num(f.comprometido_bodega ?? 0)}`}
                      >
                        {num(f.disponible_real)}
                        <p className={cn('text-[11px]', f.estado_conteo === 'desactualizado' ? 'text-destructive' : 'text-muted-foreground')}>
                          {f.fuente_stock === 'Físico' ? (f.estado_conteo === 'desactualizado' ? 'conteo desactualizado' : 'conteo físico') : 'stock SAP'}
                        </p>
                      </td>
                      <td
                        className="px-2 py-1.5 text-right font-mono-tabular"
                        title={`Atrasada ${num(f.oc_atrasada)} · en plazo ${num(f.oc_en_plazo)} · posterior ${num(f.oc_posterior)} · sin fecha ${num(f.oc_sin_fecha)}`}
                      >
                        {f.oc_pendiente > 0 ? num(f.oc_pendiente) : <span className="text-muted-foreground">—</span>}
                        {f.alerta_oc && f.alerta_oc !== 'OC pendiente' && (
                          <p className={cn('text-[11px] font-semibold', f.oc_atrasada > 0 ? 'text-destructive' : 'text-warning')}>{f.alerta_oc}</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{f.en_solicitud > 0 ? num(f.en_solicitud) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{f.minimo > 0 ? num(f.minimo) : '—'}</td>
                      <td className={cn('px-2 py-1.5 text-right font-mono-tabular', f.saldo_despues < 0 && 'font-semibold text-destructive')}>{num(f.saldo_despues)}</td>
                      <td className="px-2 py-1.5 text-right font-mono-tabular font-semibold">{f.compra_sugerida > 0 ? num(f.compra_sugerida) : '—'}</td>
                      {puedeGuardar && (
                        <td className="px-2 py-1.5">
                          <Input
                            inputMode="decimal"
                            value={planificado[f.articulo_codigo] ?? (f.compra_sugerida ? String(f.compra_sugerida) : '')}
                            onChange={(e) => setPlanificado((p) => ({ ...p, [f.articulo_codigo]: e.target.value.replace(',', '.') }))}
                            placeholder="0"
                            className="h-8 text-right font-mono-tabular"
                            aria-label={`Cantidad a comprar de ${f.articulo_nombre}`}
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        <Badge variant={ESTADO_PLAN[f.estado].variant}>{ESTADO_PLAN[f.estado].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lista.length > 500 && <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 500 de {lista.length}. Usa el buscador.</p>}
            </div>
          )}
        </>
      )}

      <DialogoTiposVivienda abierto={editarTipos} tipos={tipos} onCerrar={() => setEditarTipos(false)} onGuardado={cargarTipos} />

      <DialogoGuardarPlan
        abierto={guardar}
        onCerrar={() => setGuardar(false)}
        resumen={`${elegidasPlan.length} materiales · valor de referencia ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(valorPlan)}`}
        onGuardar={async (anio, mes, nota) => {
          const id = await guardarPlan({
            bodega_codigo: bodega,
            anio,
            mes,
            fecha_necesidad: fechaNecesidad || null,
            ot_desde: incluirOt ? desde || null : null,
            obras: incluirOt && elegidas != null ? [...elegidas] : null,
            programa: programaLista,
            incluir_ot: incluirOt,
            nota,
            lineas: elegidasPlan.map((f) => ({
              articulo_codigo: f.articulo_codigo,
              articulo_nombre: f.articulo_nombre,
              unidad: f.unidad,
              requerimiento: f.requerimiento,
              disponible_real: f.disponible_real,
              oc_pendiente: f.oc_pendiente,
              en_solicitud: f.en_solicitud,
              minimo: f.minimo,
              sugerido: f.compra_sugerida,
              planificado: cantidad(f),
              precio_ref: f.ultimo_precio,
              proveedor_ref: f.ultimo_proveedor,
              alerta_oc: f.alerta_oc,
            })),
          })
          toast.success('Plan de compra guardado')
          navigate(RUTA.plan(id))
        }}
      />
    </div>
  )
}

function DialogoGuardarPlan({
  abierto,
  onCerrar,
  resumen,
  onGuardar,
}: {
  abierto: boolean
  onCerrar: () => void
  resumen: string
  onGuardar: (anio: number, mes: number, nota: string | null) => Promise<void>
}) {
  const siguiente = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
  const [anio, setAnio] = useState(siguiente.getFullYear())
  const [mes, setMes] = useState(siguiente.getMonth() + 1)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar plan de compra</DialogTitle>
          <DialogDescription>{resumen}. Se guarda como una versión nueva del período; las anteriores no cambian.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" aria-label="Mes">
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-9 w-24" aria-label="Año" />
        </div>
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota del plan" />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              try {
                await onGuardar(anio, mes, nota.trim() || null)
                onCerrar()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
              } finally {
                setEnviando(false)
              }
            }}
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import {
  CLASE,
  CRITERIOS,
  ESTADOS_NC,
  IMPACTOS_NC,
  TIPOS_NC,
  buscarProveedores,
  claseEvaluacion,
  guardarEvaluacion,
  guardarNc,
  puntajeEvaluacion,
  type CampoCriterio,
  type DatosNc,
  type Nc,
  type ProveedorSap,
} from '../lib/api'

// Diálogos de Proveedores: evaluar un proveedor (9 criterios de 1 a 5) y registrar o editar una No Conformidad.

const NOTAS = [
  [1, 'Deficiente'],
  [2, 'Bajo'],
  [3, 'Aceptable'],
  [4, 'Bueno'],
  [5, 'Excelente'],
] as const

const hoy = () => new Date().toISOString().slice(0, 10)
const haceMeses = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

/** Busca en el maestro de proveedores de SAP; también acepta un nombre escrito a mano. */
export function BuscadorProveedor({
  valor,
  onElegir,
}: {
  valor: { codigo: string | null; nombre: string }
  onElegir: (p: { codigo: string | null; nombre: string }) => void
}) {
  const [q, setQ] = useState(valor.nombre)
  const [opciones, setOpciones] = useState<ProveedorSap[]>([])
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    setQ(valor.nombre)
  }, [valor.nombre])
  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(() => buscarProveedores(q).then(setOpciones).catch(() => setOpciones([])), 250)
    return () => clearTimeout(t)
  }, [q, abierto])
  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setAbierto(true)
          onElegir({ codigo: null, nombre: e.target.value })
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre, RUT o código SAP"
        aria-label="Proveedor"
      />
      {valor.codigo && <p className="mt-0.5 font-mono-tabular text-[11px] text-muted-foreground">SAP {valor.codigo}</p>}
      {abierto && opciones.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {opciones.map((o) => (
            <button
              key={o.codigo}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onElegir({ codigo: o.codigo, nombre: o.nombre })
                setQ(o.nombre)
                setAbierto(false)
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
            >
              {o.nombre} <span className="font-mono-tabular text-[11px] text-muted-foreground">{o.codigo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DialogoEvaluacion({
  abierto,
  proveedor,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  proveedor: { codigo: string | null; nombre: string } | null
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [prov, setProv] = useState({ codigo: proveedor?.codigo ?? null, nombre: proveedor?.nombre ?? '' })
  const [desde, setDesde] = useState(haceMeses(6))
  const [hasta, setHasta] = useState(hoy())
  const [notas, setNotas] = useState<Partial<Record<CampoCriterio, number>>>({})
  const [observaciones, setObservaciones] = useState('')
  const [plan, setPlan] = useState('')
  const [proxima, setProxima] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setProv({ codigo: proveedor?.codigo ?? null, nombre: proveedor?.nombre ?? '' })
    setNotas({})
    setObservaciones('')
    setPlan('')
    setProxima('')
  }, [abierto, proveedor?.codigo, proveedor?.nombre])

  const completas = CRITERIOS.every((c) => notas[c.campo])
  const puntaje = puntajeEvaluacion(notas)
  const clase = claseEvaluacion(puntaje)
  const exigePlan = completas && (clase === 'C' || clase === 'D')

  async function guardar() {
    if (!prov.nombre.trim()) return toast.error('Elige el proveedor')
    if (!completas) return toast.error('Califica los 9 criterios')
    if (!desde || !hasta || hasta < desde) return toast.error('Revisa el período evaluado')
    if (exigePlan && !plan.trim()) return toast.error(`Con clase ${clase} el plan de acción es obligatorio`)
    setEnviando(true)
    try {
      await guardarEvaluacion({
        proveedor_codigo: prov.codigo,
        proveedor_nombre: prov.nombre.trim(),
        periodo_desde: desde,
        periodo_hasta: hasta,
        ...(notas as Record<CampoCriterio, number>),
        observaciones: observaciones.trim() || null,
        plan_accion: plan.trim() || null,
        proxima_revision: proxima || null,
      })
      toast.success('Evaluación guardada')
      onGuardado()
      onCerrar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Evaluar proveedor</DialogTitle>
          <DialogDescription>Nota de 1 a 5 por criterio. El puntaje sobre 100 pondera cada criterio por su peso.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          {proveedor ? (
            <p className="self-center font-semibold">{prov.nombre}</p>
          ) : (
            <BuscadorProveedor valor={prov} onElegir={setProv} />
          )}
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Período desde" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Período hasta" />
        </div>
        <div className="divide-y rounded-md border">
          {CRITERIOS.map((c) => (
            <div key={c.campo} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-[180px] flex-1 text-sm">
                {c.label} <span className="text-xs text-muted-foreground">{c.peso}%</span>
                {c.campo === 'riesgo' && <span className="block text-[11px] text-muted-foreground">5 = bajo riesgo, alta continuidad</span>}
              </span>
              <div className="flex gap-1">
                {NOTAS.map(([n, label]) => (
                  <button
                    key={n}
                    type="button"
                    title={label}
                    onClick={() => setNotas((x) => ({ ...x, [c.campo]: n }))}
                    className={cn(
                      'h-8 w-8 rounded-md border text-sm font-semibold tabular-nums',
                      notas[c.campo] === n ? 'border-brand bg-brand text-white' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                    aria-label={`${c.label}: ${n} ${label}`}
                    aria-pressed={notas[c.campo] === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
          <span className="text-sm text-muted-foreground">Puntaje</span>
          <span className="font-mono-tabular text-2xl font-extrabold">{completas ? puntaje.toLocaleString('es-CL') : '—'}</span>
          {completas && <Badge variant={CLASE[clase].variant}>{CLASE[clase].label}</Badge>}
        </div>
        <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" aria-label="Observaciones" />
        <Textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder={exigePlan ? 'Plan de acción (obligatorio con clase C o D)' : 'Plan de acción (opcional)'}
          className={cn(exigePlan && !plan.trim() && 'border-destructive')}
          aria-label="Plan de acción"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Próxima revisión</span>
          <Input type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} className="w-44" />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={enviando} onClick={guardar}>
            {enviando ? 'Guardando…' : 'Guardar evaluación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ncVacia = (sucursal: string, proveedor: { codigo: string | null; nombre: string } | null): DatosNc => ({
  sucursal,
  proveedor_codigo: proveedor?.codigo ?? null,
  proveedor_nombre: proveedor?.nombre ?? '',
  articulo_codigo: null,
  articulo_nombre: null,
  oc_docnum: null,
  fecha_evento: hoy(),
  tipo: 'calidad',
  impacto: 'medio',
  estado: 'abierta',
  fecha_compromiso: null,
  reincidencia: false,
  problema: '',
  accion_acordada: null,
  responsable_interno: null,
  responsable_proveedor: null,
  costo: null,
})

export function DialogoNc({
  abierto,
  nc,
  proveedor,
  sucursales,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** Para editar una existente */
  nc: Nc | null
  proveedor: { codigo: string | null; nombre: string } | null
  /** Sucursales donde la persona es Compras */
  sucursales: string[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [d, setD] = useState<DatosNc>(() => ncVacia(sucursales[0] ?? 'Santiago', proveedor))
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    if (!abierto) return
    if (nc) {
      const { estado, ...resto } = nc
      setD({ ...ncVacia(nc.sucursal, null), ...resto, estado: estado === 'cerrada' ? 'abierta' : estado })
    } else setD(ncVacia(sucursales[0] ?? 'Santiago', proveedor))
  }, [abierto, nc, proveedor?.codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof DatosNc>(k: K, v: DatosNc[K]) => setD((x) => ({ ...x, [k]: v }))
  const txt = (v: string) => (v.trim() ? v : null)

  async function guardar() {
    if (!d.proveedor_nombre.trim()) return toast.error('Indica el proveedor')
    if (!d.problema.trim()) return toast.error('Describe la no conformidad')
    if (!d.fecha_evento) return toast.error('Indica la fecha del evento')
    setEnviando(true)
    try {
      await guardarNc(d)
      toast.success(nc ? 'No conformidad actualizada' : 'No conformidad registrada')
      onGuardado()
      onCerrar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'
  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nc ? `No conformidad N° ${nc.id}` : 'Registrar no conformidad'}</DialogTitle>
          <DialogDescription>Describe hechos verificables: material o lote, cantidad afectada, evidencia, impacto y lo acordado con el proveedor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Proveedor</span>
            {proveedor ? (
              <p className="font-semibold">{d.proveedor_nombre}</p>
            ) : (
              <BuscadorProveedor
                valor={{ codigo: d.proveedor_codigo, nombre: d.proveedor_nombre }}
                onElegir={(p) => setD((x) => ({ ...x, proveedor_codigo: p.codigo, proveedor_nombre: p.nombre }))}
              />
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Sucursal</span>
            <select value={d.sucursal} onChange={(e) => set('sucursal', e.target.value)} className={selectCls}>
              {SUCURSALES.filter((s) => sucursales.includes(s)).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Fecha del evento</span>
            <Input type="date" value={d.fecha_evento} onChange={(e) => set('fecha_evento', e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Tipo</span>
            <select value={d.tipo} onChange={(e) => set('tipo', e.target.value as DatosNc['tipo'])} className={selectCls}>
              {Object.entries(TIPOS_NC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Impacto</span>
            <select value={d.impacto} onChange={(e) => set('impacto', e.target.value as DatosNc['impacto'])} className={selectCls}>
              {Object.entries(IMPACTOS_NC).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Material (código SAP)</span>
            <Input value={d.articulo_codigo ?? ''} onChange={(e) => set('articulo_codigo', txt(e.target.value))} placeholder="Opcional" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Descripción del material</span>
            <Input value={d.articulo_nombre ?? ''} onChange={(e) => set('articulo_nombre', txt(e.target.value))} placeholder="Opcional" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">N° de OC</span>
            <Input
              inputMode="numeric"
              value={d.oc_docnum ?? ''}
              onChange={(e) => set('oc_docnum', Number(e.target.value.replace(/\D/g, '')) || null)}
              placeholder="Opcional"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Estado</span>
            <select value={d.estado} onChange={(e) => set('estado', e.target.value as DatosNc['estado'])} className={selectCls}>
              {Object.entries(ESTADOS_NC)
                .filter(([k]) => k !== 'cerrada')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Problema</span>
            <Textarea value={d.problema} onChange={(e) => set('problema', e.target.value)} placeholder="Qué ocurrió y su alcance" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Acción acordada</span>
            <Textarea
              value={d.accion_acordada ?? ''}
              onChange={(e) => set('accion_acordada', txt(e.target.value))}
              placeholder="Reposición, visita técnica, nota de crédito, contención…"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Responsable interno</span>
            <Input value={d.responsable_interno ?? ''} onChange={(e) => set('responsable_interno', txt(e.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Responsable del proveedor</span>
            <Input value={d.responsable_proveedor ?? ''} onChange={(e) => set('responsable_proveedor', txt(e.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Fecha compromiso</span>
            <Input type="date" value={d.fecha_compromiso ?? ''} onChange={(e) => set('fecha_compromiso', e.target.value || null)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Costo asociado (CLP)</span>
            <Input inputMode="numeric" value={d.costo ?? ''} onChange={(e) => set('costo', Number(e.target.value.replace(/\D/g, '')) || null)} placeholder="Opcional" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="accent-[hsl(var(--brand))]" checked={d.reincidencia} onChange={(e) => set('reincidencia', e.target.checked)} />
            Es una reincidencia (el problema ya había ocurrido)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={enviando} onClick={guardar}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

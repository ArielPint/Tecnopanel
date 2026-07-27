import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { calcCR, calcDifT, calcDifUnd, calcPct, calcVUnd, getVTI, normCod } from '../lib/calc'
import type { Producto } from '../hooks/useCatalogoGD'
import type { Responsable } from '../hooks/useResponsables'
import type { EdicionSingle, LineaProducto, MetaEntrada, RegistroCompra } from '../hooks/useRegistroCompras'
import ProductoAutocomplete from './ProductoAutocomplete'

const MES_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface Props {
  registro?: RegistroCompra
  registros: RegistroCompra[]
  allProducts: Producto[]
  responsables: Responsable[]
  gdOCMap: Record<string, string>
  onCrear: (meta: MetaEntrada, lineas: LineaProducto[], solicitudNumero: number | null) => Promise<void>
  onActualizar: (id: string, input: EdicionSingle) => Promise<void>
  onEliminar: (id: string) => Promise<void>
}

const hoy = () => new Date().toISOString().slice(0, 10)

function lineaVacia(): LineaProducto {
  return { codigo: '', descripcion: '', unidad: '', tipo_producto: '', ppto: 0, cantidad_sol: 0, devolucion: 0, valor_total_item: 0 }
}

function pptoDeCatalogo(codigo: string, allProducts: Producto[], fallback: number) {
  const p = allProducts.find((x) => normCod(x.codigo) === normCod(codigo))
  return p?.ppto ?? fallback
}

export default function FormularioRegistro({ registro, registros, allProducts, responsables, gdOCMap, onCrear, onActualizar, onEliminar }: Props) {
  const esEdicion = !!registro
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [fechaGuia, setFechaGuia] = useState(registro?.fecha_guia ?? hoy())
  const [fechaSol, setFechaSol] = useState(registro?.fecha_sol ?? hoy())
  const [gd, setGd] = useState(registro?.gd ?? '')
  const [obs, setObs] = useState(registro?.obs_modulo ?? '')
  const [responsable, setResponsable] = useState(registro?.responsable ?? '')

  // Nueva entrada (multi-producto)
  const [lineas, setLineas] = useState<LineaProducto[]>([lineaVacia()])
  const [solNumero, setSolNumero] = useState('')
  const [solMsg, setSolMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [solCargada, setSolCargada] = useState<number | null>(null)
  const [buscandoSol, setBuscandoSol] = useState(false)

  // Editar (producto único)
  const [codigo, setCodigo] = useState(registro?.codigo ?? '')
  const [descripcion, setDescripcion] = useState(registro?.descripcion ?? '')
  const [unidad, setUnidad] = useState(registro?.unidad ?? '')
  const [tipoProducto, setTipoProducto] = useState(registro?.tipo_producto ?? '')
  const [cantidadSol, setCantidadSol] = useState(String(registro?.cantidad_sol ?? 0))
  const [devolucion, setDevolucion] = useState(String(registro?.devolucion ?? 0))
  const [valorTotalItem, setValorTotalItem] = useState(String(registro?.valor_total_item ?? 0))

  function limpiar() {
    setFechaGuia(hoy())
    setFechaSol(hoy())
    setGd('')
    setObs('')
    setResponsable('')
    setLineas([lineaVacia()])
    setSolNumero('')
    setSolMsg(null)
    setSolCargada(null)
  }

  function montoExistenteGD(excluirId?: string) {
    if (!gd) return 0
    return registros.filter((r) => String(r.gd) === gd && r.id !== excluirId).reduce((s, r) => s + getVTI(r), 0)
  }

  // ── Nueva entrada: líneas de producto ──
  function actualizarLinea(idx: number, patch: Partial<LineaProducto>) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function onSelectProducto(idx: number, p: Producto) {
    actualizarLinea(idx, { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, ppto: p.ppto ?? 0 })
  }

  function montoNuevaEntrada() {
    const lineSum = lineas.reduce((s, l) => {
      const cs = l.cantidad_sol || 0
      const dv = l.devolucion || 0
      const vt = l.valor_total_item || 0
      return s + (cs > 0 && dv > 0 ? (vt * (cs - dv)) / cs : vt)
    }, 0)
    return montoExistenteGD() + lineSum
  }

  async function buscarSolicitud() {
    const numero = parseInt(solNumero, 10)
    if (!numero) {
      setSolMsg({ text: 'Ingresa un N° válido.', ok: false })
      return
    }
    setBuscandoSol(true)
    setSolMsg({ text: 'Buscando…', ok: true })
    try {
      const { data, error } = await supabase.from('solicitudes').select('*').eq('numero', numero).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        setSolMsg({ text: 'No se encontró esa solicitud.', ok: false })
        return
      }
      if (data.estado === 'usada' && !confirm(`La solicitud N° ${numero} ya fue usada en un Registro GD anteriormente. ¿Cargarla de todas formas?`)) {
        setSolMsg(null)
        return
      }
      const respNombre = responsables.find((r) => r.id === data.responsable_id)?.nombre ?? ''
      setFechaSol((data.fecha ?? '').slice(0, 10))
      setObs(data.observacion ?? '')
      if (respNombre) setResponsable(respNombre)
      const items = (data.items ?? []) as { codigo: string; descripcion?: string; unidad?: string; cantidad?: number; cantidad_real?: number }[]
      const nuevasLineas: LineaProducto[] = items.map((it) => {
        const prod = allProducts.find((p) => normCod(p.codigo) === normCod(it.codigo))
        const cantReal = it.cantidad_real ?? it.cantidad ?? 0
        return {
          codigo: it.codigo,
          descripcion: prod?.descripcion ?? it.descripcion ?? '',
          unidad: prod?.unidad ?? it.unidad ?? '',
          tipo_producto: '',
          ppto: prod?.ppto ?? 0,
          cantidad_sol: cantReal,
          devolucion: 0,
          valor_total_item: 0,
        }
      })
      setLineas(nuevasLineas.length ? nuevasLineas : [lineaVacia()])
      setSolCargada(numero)
      setSolMsg({ text: `Solicitud N° ${numero} cargada (${items.length} producto(s)).`, ok: true })
    } catch (e) {
      setSolMsg({ text: e instanceof Error ? e.message : 'Error al buscar', ok: false })
    } finally {
      setBuscandoSol(false)
    }
  }

  // ── Editar: cálculos en vivo ──
  const csNum = parseFloat(cantidadSol) || 0
  const dvNum = parseFloat(devolucion) || 0
  const vtNum = parseFloat(valorTotalItem) || 0
  const rowCalc = { cantidad_sol: csNum, devolucion: dvNum, valor_und: null, valor_total_item: vtNum }
  const pptoEdicion = pptoDeCatalogo(codigo, allProducts, registro?.valor_ppto ?? 0)
  const crEdicion = calcCR(rowCalc)
  const vuEdicion = calcVUnd(rowCalc)
  const difUEdicion = calcDifUnd(rowCalc, pptoEdicion)
  const difTEdicion = calcDifT(rowCalc, pptoEdicion)
  const pctEdicion = calcPct(rowCalc, pptoEdicion)
  const mesLabel = fechaGuia ? `${MES_NAMES[new Date(fechaGuia + 'T12:00:00').getMonth()]} ${new Date(fechaGuia + 'T12:00:00').getFullYear()}` : '—'
  const montoGDEdicion = gd ? montoExistenteGD(registro?.id) + vtNum : 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fechaGuia) {
      toast.error('Ingresa Fecha Guía')
      return
    }
    if (!gd) {
      toast.error('Ingresa N° GD')
      return
    }
    setEnviando(true)
    try {
      const meta: MetaEntrada = { fechaGuia, fechaSol, obs, gd, oc: gdOCMap[gd] ?? '', responsable }
      if (esEdicion && registro) {
        await onActualizar(registro.id, {
          fechaGuia, fechaSol, obs, gd, oc: gdOCMap[gd] ?? '', responsable,
          codigo, descripcion, unidad, tipoProducto,
          cantidadSol: csNum, devolucion: dvNum, valorTotalItem: vtNum, ppto: pptoEdicion,
        })
        toast.success('Registro actualizado')
      } else {
        if (!lineas.some((l) => l.codigo)) {
          toast.error('Agrega al menos un producto')
          setEnviando(false)
          return
        }
        await onCrear(meta, lineas, solCargada)
        toast.success('Registro guardado')
        limpiar()
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function onDelete() {
    if (!registro) return
    if (!confirm('¿Eliminar este registro?')) return
    setEnviando(true)
    try {
      await onEliminar(registro.id)
      toast.success('Eliminado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v && !esEdicion) limpiar()
      }}
    >
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : '+ Nueva entrada'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar entrada' : 'Nueva entrada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Fecha Guía</Label>
              <Input type="date" value={fechaGuia} onChange={(e) => setFechaGuia(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fecha Solicitud</Label>
              <Input type="date" value={fechaSol} onChange={(e) => setFechaSol(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>N° GD</Label>
              <Input value={gd} onChange={(e) => setGd(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>OC <span className="text-xs text-muted-foreground">(auto)</span></Label>
              <Input value={gdOCMap[gd] ?? ''} readOnly placeholder="—" className="text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Responsable</Label>
              <Select value={responsable || '__none'} onValueChange={(v) => setResponsable(v === '__none' ? '' : v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Seleccionar —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sin asignar —</SelectItem>
                  {responsables.filter((r) => r.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((r) => (
                    <SelectItem key={r.id} value={r.nombre}>{r.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Obs. Módulo</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>

          {!esEdicion && (
            <div className="rounded-md border p-3">
              <Label className="mb-1.5 block text-xs">Cargar desde Solicitud de Materiales</Label>
              <div className="flex gap-2">
                <Input placeholder="N° de solicitud…" value={solNumero} onChange={(e) => setSolNumero(e.target.value)} />
                <Button type="button" variant="outline" disabled={buscandoSol} onClick={buscarSolicitud}>Buscar</Button>
              </div>
              {solMsg && <p className={`mt-1.5 text-xs ${solMsg.ok ? 'text-success' : 'text-destructive'}`}>{solMsg.text}</p>}
            </div>
          )}

          {esEdicion ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="mb-1.5 block">Producto</Label>
                  <ProductoAutocomplete
                    value={codigo}
                    productos={allProducts}
                    onChange={setCodigo}
                    onSelect={(p) => {
                      setCodigo(p.codigo)
                      setDescripcion(p.descripcion)
                      setUnidad(p.unidad)
                    }}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Descripción</Label>
                  <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Unidad</Label>
                  <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo Producto</Label>
                  <Input value={tipoProducto} onChange={(e) => setTipoProducto(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Cant. Solicitada</Label>
                  <Input type="number" step="any" value={cantidadSol} onChange={(e) => setCantidadSol(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Devolución</Label>
                  <Input type="number" step="any" value={devolucion} onChange={(e) => setDevolucion(e.target.value)} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Valor Total Item ($)</Label>
                  <Input type="number" step="any" value={valorTotalItem} onChange={(e) => setValorTotalItem(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                <CalcVal label="Cant. Recibida" value={crEdicion.toLocaleString('es-CL')} />
                <CalcVal label="Mes" value={mesLabel} />
                <CalcVal label="Valor Unitario" value={vuEdicion ? formatCLP(vuEdicion) : '—'} />
                <CalcVal label="Presupuesto" value={pptoEdicion ? formatCLP(pptoEdicion) : '—'} />
                <CalcVal label="Dif. Unitario" value={difUEdicion ? formatCLP(difUEdicion) : '—'} tone={difUEdicion} />
                <CalcVal label="Dif. Total" value={difTEdicion ? formatCLP(difTEdicion) : '—'} tone={difTEdicion} />
                <CalcVal label="% Dif." value={pctEdicion != null ? pctEdicion.toFixed(2) + '%' : '—'} tone={pctEdicion ?? 0} />
                <CalcVal label="Monto GD" value={gd ? formatCLP(montoGDEdicion) : '—'} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {lineas.map((l, idx) => (
                <div key={idx} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Producto {idx + 1}</span>
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => setLineas((ls) => ls.filter((_, i) => i !== idx))}>
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <ProductoAutocomplete
                        value={l.codigo}
                        productos={allProducts}
                        onChange={(v) => actualizarLinea(idx, { codigo: v })}
                        onSelect={(p) => onSelectProducto(idx, p)}
                      />
                    </div>
                    <Input value={l.unidad} readOnly placeholder="UND" className="text-muted-foreground" />
                  </div>
                  <Input value={l.descripcion} readOnly placeholder="Descripción (auto)" className="text-xs text-muted-foreground" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Cant. Sol.</Label>
                      <Input type="number" step="any" min="0" value={l.cantidad_sol || ''} onChange={(e) => actualizarLinea(idx, { cantidad_sol: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Devol.</Label>
                      <Input type="number" step="any" min="0" value={l.devolucion || ''} onChange={(e) => actualizarLinea(idx, { devolucion: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Valor Total ($)</Label>
                      <Input type="number" step="any" min="0" value={l.valor_total_item || ''} onChange={(e) => actualizarLinea(idx, { valor_total_item: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <LineaCalc linea={l} />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>+ Agregar producto</Button>
                <span className="text-xs text-muted-foreground">
                  Monto GD: <span className="font-semibold text-success">{gd ? formatCLP(montoNuevaEntrada()) : '—'}</span>
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            {esEdicion && (
              <Button type="button" variant="destructive" disabled={enviando} onClick={onDelete}>
                Eliminar
              </Button>
            )}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CalcVal({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone == null ? 'text-muted-foreground' : tone > 0 ? 'text-success' : tone < 0 ? 'text-destructive' : 'text-muted-foreground'
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function LineaCalc({ linea }: { linea: LineaProducto }) {
  const row = { cantidad_sol: linea.cantidad_sol, devolucion: linea.devolucion, valor_und: null, valor_total_item: linea.valor_total_item }
  const cr = calcCR(row)
  const vu = calcVUnd(row)
  const du = calcDifUnd(row, linea.ppto)
  const dt = calcDifT(row, linea.ppto)
  const pct = calcPct(row, linea.ppto)
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t pt-2 text-[.7rem] text-muted-foreground">
      <span>Cant. Rec.: <b className="text-foreground">{cr.toLocaleString('es-CL')}</b></span>
      <span>Val. Unit.: <b className="text-foreground">{vu ? formatCLP(vu) : '—'}</b></span>
      <span>Ppto.: <b className="text-foreground">{linea.ppto ? formatCLP(linea.ppto) : '—'}</b></span>
      <span>Dif. Unit.: <b className="text-foreground">{du ? formatCLP(du) : '—'}</b></span>
      <span>Dif. Total: <b className="text-foreground">{dt ? formatCLP(dt) : '—'}</b></span>
      <span>% Dif.: <b className="text-foreground">{pct != null ? pct.toFixed(1) + '%' : '—'}</b></span>
    </div>
  )
}

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
import { calcCR, calcDifT, calcVUnd, calcPct, getVTI, normCod } from '../lib/calc'
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

// Línea del formulario — cuando trae `id` es una línea que ya existe en la BD
// (se actualiza al guardar); sin `id` es un producto nuevo agregado a la guía
// (se inserta al guardar).
type LineaEditable = LineaProducto & { id?: string }

const hoy = () => new Date().toISOString().slice(0, 10)

function lineaVacia(): LineaEditable {
  return { codigo: '', descripcion: '', unidad: '', tipo_producto: '', ppto: 0, cantidad_sol: 0, devolucion: 0, valor_total_item: 0 }
}

function lineaDesdeRegistro(r: RegistroCompra, allProducts: Producto[]): LineaEditable {
  return {
    id: r.id,
    codigo: r.codigo,
    descripcion: r.descripcion ?? '',
    unidad: r.unidad ?? '',
    tipo_producto: r.tipo_producto ?? '',
    ppto: pptoDeCatalogo(r.codigo, allProducts, r.valor_ppto ?? 0),
    cantidad_sol: r.cantidad_sol ?? 0,
    devolucion: r.devolucion ?? 0,
    valor_total_item: r.valor_total_item ?? 0,
  }
}

function pptoDeCatalogo(codigo: string, allProducts: Producto[], fallback: number) {
  const p = allProducts.find((x) => normCod(x.codigo) === normCod(codigo))
  return p?.ppto ?? fallback
}

function montoLinea(l: LineaEditable) {
  const cs = l.cantidad_sol || 0
  const dv = l.devolucion || 0
  const vt = l.valor_total_item || 0
  return cs > 0 && dv > 0 ? (vt * (cs - dv)) / cs : vt
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

  const [lineas, setLineas] = useState<LineaEditable[]>([lineaVacia()])
  const [idsEliminados, setIdsEliminados] = useState<string[]>([])

  // Solo aplica a "+ Nueva entrada" (crear una guía desde cero)
  const [solNumero, setSolNumero] = useState('')
  const [solMsg, setSolMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [solCargada, setSolCargada] = useState<number | null>(null)
  const [buscandoSol, setBuscandoSol] = useState(false)

  function limpiar() {
    setFechaGuia(hoy())
    setFechaSol(hoy())
    setGd('')
    setObs('')
    setResponsable('')
    setLineas([lineaVacia()])
    setIdsEliminados([])
    setSolNumero('')
    setSolMsg(null)
    setSolCargada(null)
  }

  // Trae todas las líneas de la guía del registro clickeado — editar una línea
  // edita la guía completa, no solo esa línea.
  function cargarGuiaCompleta() {
    if (!registro) return
    const lineasGuia = registros.filter((r) => r.gd === registro.gd).map((r) => lineaDesdeRegistro(r, allProducts))
    setFechaGuia(registro.fecha_guia ?? hoy())
    setFechaSol(registro.fecha_sol ?? hoy())
    setGd(registro.gd)
    setObs(registro.obs_modulo ?? '')
    setResponsable(registro.responsable ?? '')
    setLineas(lineasGuia.length ? lineasGuia : [lineaVacia()])
    setIdsEliminados([])
  }

  function montoExistenteGD(excluirGd?: string) {
    if (!gd || gd === excluirGd) return 0
    return registros.filter((r) => String(r.gd) === gd).reduce((s, r) => s + getVTI(r), 0)
  }

  function actualizarLinea(idx: number, patch: Partial<LineaEditable>) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function eliminarLinea(idx: number) {
    setLineas((ls) => {
      const linea = ls[idx]
      if (linea.id) setIdsEliminados((ids) => [...ids, linea.id!])
      return ls.filter((_, i) => i !== idx)
    })
  }

  function onSelectProducto(idx: number, p: Producto) {
    actualizarLinea(idx, { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, ppto: p.ppto ?? 0 })
  }

  function montoTotal() {
    const lineSum = lineas.reduce((s, l) => s + montoLinea(l), 0)
    // En modo creación las líneas del diálogo son todas nuevas — se suma lo que ya
    // existiera bajo ese N° GD. En modo edición `lineas` ya representa la guía
    // completa, así que no hay nada más que sumar.
    return esEdicion ? lineSum : montoExistenteGD() + lineSum
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
      const nuevasLineas: LineaEditable[] = items.map((it) => {
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

  const mesLabel = fechaGuia ? `${MES_NAMES[new Date(fechaGuia + 'T12:00:00').getMonth()]} ${new Date(fechaGuia + 'T12:00:00').getFullYear()}` : '—'

  async function eliminarGuiaCompleta() {
    if (!registro) return
    if (!confirm(`¿Eliminar la guía ${registro.gd} completa? Se borrarán sus ${registros.filter((r) => r.gd === registro.gd).length} línea(s). Esta acción no se puede deshacer.`)) return
    setEnviando(true)
    try {
      const idsGuia = registros.filter((r) => r.gd === registro.gd).map((r) => r.id)
      const resultados = await Promise.allSettled(idsGuia.map((id) => onEliminar(id)))
      const fallidas = resultados.filter((r) => r.status === 'rejected').length
      if (fallidas) {
        toast.error(`Guía eliminada parcialmente: ${fallidas} de ${idsGuia.length} línea(s) no se pudieron borrar. Reintenta antes de continuar.`)
      } else {
        toast.success('Guía eliminada')
        setOpen(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setEnviando(false)
    }
  }

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
    if (!lineas.some((l) => l.codigo)) {
      toast.error('Agrega al menos un producto')
      return
    }
    setEnviando(true)
    try {
      const meta: MetaEntrada = { fechaGuia, fechaSol, obs, gd, oc: gdOCMap[gd] ?? '', responsable }
      if (esEdicion) {
        const delResultados = await Promise.allSettled(idsEliminados.map((id) => onEliminar(id)))
        const existentes = lineas.filter((l): l is LineaEditable & { id: string } => !!l.id && !!l.codigo)
        const updResultados = await Promise.allSettled(
          existentes.map((l) =>
            onActualizar(l.id, {
              fechaGuia, fechaSol, obs, gd, oc: gdOCMap[gd] ?? '', responsable,
              codigo: l.codigo, descripcion: l.descripcion, unidad: l.unidad, tipoProducto: l.tipo_producto,
              cantidadSol: l.cantidad_sol, devolucion: l.devolucion, valorTotalItem: l.valor_total_item, ppto: l.ppto,
            }),
          ),
        )
        const nuevas = lineas.filter((l) => !l.id && l.codigo)
        if (nuevas.length) await onCrear(meta, nuevas, null)
        const fallidas = [...delResultados, ...updResultados].filter((r) => r.status === 'rejected').length
        if (fallidas) {
          throw new Error(`Guía actualizada parcialmente: ${fallidas} línea(s) no se guardaron. Revisa y reintenta.`)
        }
        toast.success('Guía actualizada')
      } else {
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          if (esEdicion) cargarGuiaCompleta()
          else limpiar()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : '+ Nueva entrada'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{esEdicion ? `Editar guía ${registro?.gd ?? ''}` : 'Nueva entrada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Productos de la guía</Label>
              <span className="text-xs text-muted-foreground">Mes: {mesLabel}</span>
            </div>
            {lineas.map((l, idx) => (
              <div key={l.id ?? `nueva-${idx}`} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {l.id ? `Producto ${idx + 1}` : `Producto ${idx + 1} (nuevo)`}
                  </span>
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => eliminarLinea(idx)}>
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Cant. Sol.</Label>
                    <Input type="number" step="any" min="0" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={l.cantidad_sol || ''} onChange={(e) => actualizarLinea(idx, { cantidad_sol: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Devol.</Label>
                    <Input type="number" step="any" min="0" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={l.devolucion || ''} onChange={(e) => actualizarLinea(idx, { devolucion: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Valor Total ($)</Label>
                    <Input type="number" step="any" min="0" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={l.valor_total_item || ''} onChange={(e) => actualizarLinea(idx, { valor_total_item: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <LineaCalc linea={l} />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>+ Agregar producto</Button>
              <span className="text-xs text-muted-foreground">
                Monto GD: <span className="font-semibold text-success">{gd ? formatCLP(montoTotal()) : '—'}</span>
              </span>
            </div>
          </div>

          <DialogFooter className={esEdicion ? 'sm:justify-between' : undefined}>
            {esEdicion && (
              <Button type="button" variant="destructive" disabled={enviando} onClick={eliminarGuiaCompleta}>
                Eliminar guía
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

function LineaCalc({ linea }: { linea: LineaEditable }) {
  const row = { cantidad_sol: linea.cantidad_sol, devolucion: linea.devolucion, valor_und: null, valor_total_item: linea.valor_total_item }
  const cr = calcCR(row)
  const vu = calcVUnd(row)
  const dt = calcDifT(row, linea.ppto)
  const pct = calcPct(row, linea.ppto)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 border-t pt-2 text-[.7rem] text-muted-foreground">
      <span>Cant. Rec.: <b className="text-foreground">{cr.toLocaleString('es-CL')}</b></span>
      <span>Val. Unit.: <b className="text-foreground">{vu ? formatCLP(vu) : '—'}</b></span>
      <span>Ppto.: <b className="text-foreground">{linea.ppto ? formatCLP(linea.ppto) : '—'}</b></span>
      <span>Dif. Total: <b className="text-foreground">{dt ? formatCLP(dt) : '—'}</b></span>
      <span>% Dif.: <b className="text-foreground">{pct != null ? pct.toFixed(1) + '%' : '—'}</b></span>
    </div>
  )
}

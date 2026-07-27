import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Package } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { useAuth } from '../hooks/useAuth'
import { useCatalogoGD, type Producto } from '../hooks/useCatalogoGD'
import { useProveedores } from '../hooks/useProveedores'
import { usePedidos, type EstadoPedido, type ItemPedido, type UrgenciaPedido } from '../hooks/usePedidos'
import ProductoAutocomplete from '../components/ProductoAutocomplete'
import FormularioProveedor from '../components/FormularioProveedor'
import FormularioEstadoPedido from '../components/FormularioEstadoPedido'

interface FilaItem {
  id: number
  producto: Producto | null
  busqueda: string
  cantidad: string
  precioUnitario: string
}

let rowSeq = 0
const filaVacia = (): FilaItem => ({ id: ++rowSeq, producto: null, busqueda: '', cantidad: '', precioUnitario: '' })

const URGENCIAS: { value: UrgenciaPedido; label: string }[] = [
  { value: 'normal', label: '📦 Normal' },
  { value: 'urgente', label: '⚡ Urgente' },
  { value: 'critico', label: '🔴 Crítico' },
]

const URGENCIA_BADGE: Record<UrgenciaPedido, 'default' | 'warning' | 'destructive'> = {
  normal: 'default',
  urgente: 'warning',
  critico: 'destructive',
}

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aprobado: 'Aprobado',
  en_camino: 'En camino',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
}

const ESTADO_BADGE: Record<EstadoPedido, 'secondary' | 'default' | 'outline' | 'warning' | 'success' | 'destructive'> = {
  borrador: 'secondary',
  enviado: 'default',
  aprobado: 'outline',
  en_camino: 'warning',
  recibido: 'success',
  cancelado: 'destructive',
}

function generarNumeroPedido() {
  const now = new Date()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `PED-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${rand}`
}

function fechaMasDias(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default function Pedidos() {
  const { perfil, isAdmin } = useAuth()
  const { allProducts } = useCatalogoGD()
  const { proveedores, crear: crearProveedor } = useProveedores()
  const { pedidos, crear: crearPedido, actualizarEstado } = usePedidos()

  const [tab, setTab] = useState('nuevo')
  const [proveedorId, setProveedorId] = useState('')
  const [urgencia, setUrgencia] = useState<UrgenciaPedido>('normal')
  const [fechaRequerida, setFechaRequerida] = useState(fechaMasDias(7))
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaItem[]>([filaVacia()])
  const [enviando, setEnviando] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [histBusqueda, setHistBusqueda] = useState('')
  const [histEstado, setHistEstado] = useState('')

  function actualizarFila(id: number, patch: Partial<FilaItem>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function quitarFila(id: number) {
    setFilas((prev) => {
      const resto = prev.filter((f) => f.id !== id)
      return resto.length ? resto : [filaVacia()]
    })
  }

  const itemsValidos = useMemo<ItemPedido[]>(
    () =>
      filas
        .filter((f) => f.producto && parseFloat(f.cantidad) > 0)
        .map((f) => {
          const cantidad = parseFloat(f.cantidad) || 0
          const precio = parseFloat(f.precioUnitario) || 0
          return {
            codigo: f.producto!.codigo,
            descripcion: f.producto!.descripcion,
            unidad: f.producto!.unidad || 'UND',
            cantidad,
            precio_unitario: precio,
            subtotal: cantidad * precio,
          }
        }),
    [filas],
  )

  const total = itemsValidos.reduce((s, it) => s + it.subtotal, 0)
  const hasPrecios = itemsValidos.some((it) => it.precio_unitario > 0)

  function limpiarForm() {
    setProveedorId('')
    setUrgencia('normal')
    setFechaRequerida(fechaMasDias(7))
    setObservacion('')
    setFilas([filaVacia()])
  }

  async function submit(estado: EstadoPedido) {
    if (!itemsValidos.length) {
      toast.error('Agrega al menos un producto con cantidad')
      return
    }
    if (!proveedorId) {
      toast.error('Selecciona un proveedor')
      return
    }
    setEnviando(true)
    try {
      const prov = proveedores.find((p) => p.id === proveedorId)
      await crearPedido({
        numero_pedido: generarNumeroPedido(),
        usuario_id: perfil?.id ?? null,
        username: perfil?.username ?? null,
        nombre: perfil?.name ?? null,
        proveedor_id: proveedorId,
        proveedor_nombre: prov?.nombre ?? null,
        items: itemsValidos,
        urgencia,
        fecha_requerida: fechaRequerida || null,
        observacion: observacion.trim() || null,
        total_estimado: total > 0 ? total : null,
        estado,
      })
      toast.success(estado === 'enviado' ? 'Pedido enviado' : 'Borrador guardado')
      limpiarForm()
      setTab('historial')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  function irAVistaPrevia() {
    if (!itemsValidos.length) {
      toast.error('Agrega al menos un producto con cantidad')
      return
    }
    if (!proveedorId) {
      toast.error('Selecciona un proveedor')
      return
    }
    setTab('preview')
  }

  const proveedorSel = proveedores.find((p) => p.id === proveedorId)

  const historialFiltrado = useMemo(() => {
    let data = pedidos
    if (!isAdmin) data = data.filter((p) => p.usuario_id === perfil?.id)
    const q = histBusqueda.toLowerCase()
    if (q) {
      data = data.filter(
        (p) =>
          (p.proveedor_nombre || '').toLowerCase().includes(q) ||
          (p.numero_pedido || '').toLowerCase().includes(q) ||
          (p.nombre || '').toLowerCase().includes(q) ||
          p.items.some((it) => it.descripcion.toLowerCase().includes(q) || it.codigo.toLowerCase().includes(q)),
      )
    }
    if (histEstado) data = data.filter((p) => p.estado === histEstado)
    return data
  }, [pedidos, isAdmin, perfil, histBusqueda, histEstado])

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="line" className="mb-4 flex-wrap border-b">
        <TabsTrigger value="nuevo">🛒 Nuevo Pedido</TabsTrigger>
        <TabsTrigger value="preview">👁 Vista Previa</TabsTrigger>
        <TabsTrigger value="historial">📂 Historial</TabsTrigger>
        {isAdmin && <TabsTrigger value="proveedores">🏭 Proveedores</TabsTrigger>}
      </TabsList>

      {/* ── Nuevo Pedido ── */}
      <TabsContent value="nuevo" className="space-y-4">
        <div className="rounded-md border p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos del pedido</div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 basis-full sm:basis-[320px]">
              <Label>Proveedor *</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Select value={proveedorId} onValueChange={setProveedorId}>
                  <SelectTrigger className="min-w-[180px] flex-1">
                    <SelectValue placeholder="— Selecciona proveedor —" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                        {p.rut ? ` · ${p.rut}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormularioProveedor onGuardar={(input) => crearProveedor(input, perfil?.username ?? 'admin')} onCreado={(p) => setProveedorId(p.id)} />
              </div>
            </div>
            <div>
              <Label>Urgencia</Label>
              <div className="mt-1.5 flex gap-2">
                {URGENCIAS.map((u) => (
                  <Button key={u.value} type="button" size="sm" variant={urgencia === u.value ? 'default' : 'outline'} onClick={() => setUrgencia(u.value)}>
                    {u.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="min-w-[160px]">
              <Label htmlFor="fecha-requerida">Fecha requerida</Label>
              <Input id="fecha-requerida" type="date" className="mt-1.5" value={fechaRequerida} onChange={(e) => setFechaRequerida(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos a pedir</div>
          <div className="space-y-2">
            {filas.map((f) => {
              const cantidad = parseFloat(f.cantidad) || 0
              const precio = parseFloat(f.precioUnitario) || 0
              const sub = cantidad * precio
              return (
                <div key={f.id} className="grid grid-cols-[1fr_80px_70px_110px_110px_36px] items-center gap-2">
                  <ProductoAutocomplete
                    value={f.busqueda}
                    productos={allProducts}
                    placeholder="Buscar producto…"
                    onChange={(v) => actualizarFila(f.id, { busqueda: v, producto: null })}
                    onSelect={(p) => actualizarFila(f.id, { producto: p, busqueda: p.descripcion })}
                  />
                  <Input type="number" min="0" step="any" placeholder="0" value={f.cantidad} onChange={(e) => actualizarFila(f.id, { cantidad: e.target.value })} />
                  <div className="text-center text-xs text-muted-foreground">{f.producto?.unidad || '—'}</div>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={f.precioUnitario}
                    onChange={(e) => actualizarFila(f.id, { precioUnitario: e.target.value })}
                  />
                  <div className="text-right text-sm font-semibold text-success">{sub > 0 ? formatCLP(sub) : '—'}</div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => quitarFila(f.id)} title="Eliminar">
                    ✕
                  </Button>
                </div>
              )
            })}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full border-dashed" onClick={() => setFilas((prev) => [...prev, filaVacia()])}>
            + Agregar producto
          </Button>
          {hasPrecios && (
            <div className="mt-3 flex items-center justify-end gap-3 rounded-md border bg-card px-4 py-2">
              <span className="text-xs uppercase text-muted-foreground">Total estimado:</span>
              <span className="text-lg font-bold text-success">{formatCLP(total)}</span>
            </div>
          )}
        </div>

        <div className="rounded-md border p-4">
          <Label htmlFor="observacion">Observaciones (opcional)</Label>
          <Textarea
            id="observacion"
            className="mt-1.5"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Condiciones de entrega, referencia de cotización, contacto proveedor, etc."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={limpiarForm}>
            🗑 Limpiar
          </Button>
          <Button type="button" variant="outline" disabled={enviando} onClick={() => submit('borrador')}>
            💾 Guardar borrador
          </Button>
          <Button type="button" onClick={irAVistaPrevia}>
            Ver resumen →
          </Button>
        </div>
      </TabsContent>

      {/* ── Vista Previa ── */}
      <TabsContent value="preview" className="space-y-4">
        <div className="rounded-md border p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen del pedido</div>
          <div className="mb-4 flex flex-wrap gap-4 rounded-md border bg-card px-4 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Proveedor: </span>
              <strong>{proveedorSel?.nombre ?? '(desconocido)'}</strong>
            </div>
            {fechaRequerida && (
              <div>
                <span className="text-muted-foreground">Fecha requerida: </span>
                {new Date(fechaRequerida + 'T00:00:00').toLocaleDateString('es-CL')}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Urgencia: </span>
              <Badge variant={URGENCIA_BADGE[urgencia]}>{urgencia}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">N° items: </span>
              {itemsValidos.length}
            </div>
            {hasPrecios && (
              <div>
                <span className="text-muted-foreground">Total estimado: </span>
                <strong className="text-success">{formatCLP(total)}</strong>
              </div>
            )}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Precio unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsValidos.map((it, i) => (
                  <TableRow key={it.codigo + i}>
                    <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                    <TableCell className="text-sm">{it.descripcion}</TableCell>
                    <TableCell className="text-center">{it.cantidad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                    <TableCell className="text-right">{it.precio_unitario > 0 ? formatCLP(it.precio_unitario) : '—'}</TableCell>
                    <TableCell className="text-right font-semibold text-success">{it.subtotal > 0 ? formatCLP(it.subtotal) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {observacion.trim() && (
            <div className="mt-4">
              <Label>Observaciones</Label>
              <div className="mt-1.5 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">{observacion}</div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setTab('nuevo')}>
            ← Volver a editar
          </Button>
          <Button type="button" variant="outline" disabled={enviando} onClick={() => submit('borrador')}>
            💾 Guardar borrador
          </Button>
          <Button type="button" disabled={enviando} onClick={() => submit('enviado')}>
            ✔ Enviar pedido
          </Button>
        </div>
      </TabsContent>

      {/* ── Historial ── */}
      <TabsContent value="historial" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="🔍 Buscar por proveedor, producto o N° pedido…"
            value={histBusqueda}
            onChange={(e) => setHistBusqueda(e.target.value)}
            className="h-9 max-w-xs flex-1"
          />
          <Select value={histEstado || '__all'} onValueChange={(v) => setHistEstado(v === '__all' ? '' : v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos los estados</SelectItem>
              {(Object.keys(ESTADO_LABEL) as EstadoPedido[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {historialFiltrado.length === 0 ? (
          <EmptyState icon={Package} title="No hay pedidos que coincidan" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  {isAdmin && <TableHead>Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {historialFiltrado.map((p) => (
                  <Fragment key={p.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandido((cur) => (cur === p.id ? null : p.id))}>
                      <TableCell className="text-center text-muted-foreground">{expandido === p.id ? '▼' : '▶'}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{p.numero_pedido}</TableCell>
                      <TableCell className="text-sm font-semibold">{p.proveedor_nombre || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={URGENCIA_BADGE[p.urgencia]}>{p.urgencia}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{p.total_estimado ? formatCLP(p.total_estimado) : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('es-CL')}</TableCell>
                      <TableCell>
                        <Badge variant={ESTADO_BADGE[p.estado]}>{ESTADO_LABEL[p.estado]}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <FormularioEstadoPedido estadoActual={p.estado} onGuardar={(estado, nota) => actualizarEstado(p.id, estado, nota)} />
                        </TableCell>
                      )}
                    </TableRow>
                    {expandido === p.id && (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 8 : 7} className="bg-muted/30 p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-center">#</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-center">Cant.</TableHead>
                                <TableHead>Unidad</TableHead>
                                <TableHead className="text-right">Precio unit.</TableHead>
                                <TableHead className="text-right">Subtotal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {p.items.map((it, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                                  <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                                  <TableCell className="text-sm">{it.descripcion}</TableCell>
                                  <TableCell className="text-center">{it.cantidad}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                                  <TableCell className="text-right">{it.precio_unitario > 0 ? formatCLP(it.precio_unitario) : '—'}</TableCell>
                                  <TableCell className="text-right font-semibold text-success">{it.subtotal > 0 ? formatCLP(it.subtotal) : '—'}</TableCell>
                                </TableRow>
                              ))}
                              {p.observacion && (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-xs text-muted-foreground">
                                    📝 {p.observacion}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      {/* ── Proveedores (admin) ── */}
      {isAdmin && (
        <TabsContent value="proveedores" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedores registrados</div>
            <FormularioProveedor onGuardar={(input) => crearProveedor(input, perfil?.username ?? 'admin')} />
          </div>
          {proveedores.length === 0 ? (
            <EmptyState icon={Package} title="No hay proveedores. Agrega el primero." />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {proveedores.map((p) => (
                <div key={p.id} className="rounded-md border bg-card p-4">
                  <div className="font-semibold">{p.nombre}</div>
                  {p.rut && <div className="font-mono text-xs text-primary">{p.rut}</div>}
                  {p.giro && <div className="text-xs text-muted-foreground">{p.giro}</div>}
                  {p.telefono && <div className="text-xs text-muted-foreground">📞 {p.telefono}</div>}
                  {p.email && <div className="text-xs text-muted-foreground">✉ {p.email}</div>}
                  {p.notas && <div className="mt-1.5 text-xs italic text-muted-foreground">{p.notas}</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      )}
    </Tabs>
  )
}

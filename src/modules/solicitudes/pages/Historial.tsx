import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Button } from '@/modules/financiero/components/ui/button'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { useCatalogoGD, type Producto } from '@/modules/logistica/hooks/useCatalogoGD'
import ProductoAutocomplete from '@/modules/logistica/components/ProductoAutocomplete'
import { useAuth } from '../hooks/useAuth'
import { useGruposResponsables } from '../hooks/useGruposResponsables'
import { useSolicitudes, type EstadoSolicitud, type ItemSolicitud } from '../hooks/useSolicitudes'

const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: 'No usada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  usada: 'Usada',
}

const ESTADO_BADGE: Record<EstadoSolicitud, 'warning' | 'success' | 'destructive' | 'default'> = {
  pendiente: 'warning',
  aprobada: 'success',
  rechazada: 'destructive',
  usada: 'default',
}

export default function Historial() {
  const { perfil, isAdmin } = useAuth()
  const { grupos } = useGruposResponsables()
  const { solicitudes, eliminar, actualizarItems } = useSolicitudes()
  const { allProducts } = useCatalogoGD()

  const [busqueda, setBusqueda] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [itemsEdit, setItemsEdit] = useState<ItemSolicitud[]>([])
  const [nuevaBusqueda, setNuevaBusqueda] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  function iniciarEdicion(id: string, items: ItemSolicitud[]) {
    setEditandoId(id)
    setItemsEdit(items.map((it) => ({ ...it })))
    setNuevaBusqueda('')
    setExpandido(id)
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setItemsEdit([])
  }

  function cambiarCantidad(i: number, campo: 'cantidad' | 'cantidad_real', val: string) {
    const n = parseFloat(val) || 0
    setItemsEdit((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: n } : it)))
  }

  function quitarItemEdit(i: number) {
    setItemsEdit((prev) => prev.filter((_, idx) => idx !== i))
  }

  function agregarProductoEdit(p: Producto) {
    setItemsEdit((prev) => [
      ...prev,
      { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad || 'UND', cantidad: 1, cantidad_real: 1, grupo: p.grupo || '', cantidad_por_modulo: p.cantidad_por_modulo },
    ])
    setNuevaBusqueda('')
  }

  async function guardarEdicion(id: string) {
    const items = itemsEdit.filter((it) => it.cantidad > 0)
    if (!items.length) {
      toast.error('Sin productos válidos')
      return
    }
    setGuardandoEdit(true)
    try {
      await actualizarItems(id, items)
      toast.success('Solicitud actualizada')
      setEditandoId(null)
      setItemsEdit([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardandoEdit(false)
    }
  }

  const grupoNombre = (id: number | null) => grupos.find((g) => g.id === id)?.nombre ?? '—'

  const filtradas = useMemo(() => {
    let data = solicitudes
    if (!isAdmin) data = data.filter((s) => s.usuario_id === perfil?.id)
    if (grupoFiltro) data = data.filter((s) => String(s.grupo_id) === grupoFiltro)
    const q = busqueda.toLowerCase()
    if (q) {
      data = data.filter(
        (s) =>
          s.nombre.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          s.items.some((it) => it.descripcion.toLowerCase().includes(q) || it.codigo.toLowerCase().includes(q)),
      )
    }
    if (fechaFiltro) data = data.filter((s) => s.created_at?.startsWith(fechaFiltro))
    if (estadoFiltro) data = data.filter((s) => s.estado === estadoFiltro)
    return data
  }, [solicitudes, isAdmin, perfil, grupoFiltro, busqueda, fechaFiltro, estadoFiltro])

  async function onEliminar(id: string) {
    if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return
    try {
      await eliminar(id)
      toast.success('Solicitud eliminada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍 Buscar por usuario o producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-xs flex-1" />
        <Select value={grupoFiltro || '__all'} onValueChange={(v) => setGrupoFiltro(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Todos los grupos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los grupos</SelectItem>
            {grupos.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} className="h-9 w-40" />
        <Select value={estadoFiltro || '__all'} onValueChange={(v) => setEstadoFiltro(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los estados</SelectItem>
            {(Object.keys(ESTADO_LABEL) as EstadoSolicitud[]).map((e) => (
              <SelectItem key={e} value={e}>
                {ESTADO_LABEL[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState icon={FileText} title="No hay solicitudes que coincidan" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead className="w-14">N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((s) => {
                const isOwn = s.usuario_id === perfil?.id
                const puedeEliminar = isAdmin || (isOwn && s.estado !== 'usada')
                const puedeRetomar = s.estado === 'pendiente' && (isAdmin || isOwn)
                const editando = editandoId === s.id
                return (
                  <Fragment key={s.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandido((cur) => (cur === s.id ? null : s.id))}>
                      <TableCell className="text-center text-muted-foreground">{expandido === s.id ? '▼' : '▶'}</TableCell>
                      <TableCell className="text-center text-xs">{s.numero}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('es-CL')}</TableCell>
                      <TableCell className="text-sm">{s.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{grupoNombre(s.grupo_id)}</TableCell>
                      <TableCell className="text-center">{s.items.length}</TableCell>
                      <TableCell>
                        <Badge variant={ESTADO_BADGE[s.estado]}>{ESTADO_LABEL[s.estado]}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="space-x-2">
                        {puedeRetomar && !editando && (
                          <Button variant="outline" size="sm" onClick={() => iniciarEdicion(s.id, s.items)}>
                            ✎ Retomar
                          </Button>
                        )}
                        {puedeEliminar && (
                          <Button variant="outline" size="sm" onClick={() => onEliminar(s.id)}>
                            🗑 Eliminar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandido === s.id && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          {editando ? (
                            <div className="space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-center">#</TableHead>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Descripción</TableHead>
                                    <TableHead className="text-center">Cant. Sol.</TableHead>
                                    <TableHead className="text-center">Cant. Real</TableHead>
                                    <TableHead>Unidad</TableHead>
                                    <TableHead className="w-10" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {itemsEdit.map((it, i) => (
                                    <TableRow key={it.codigo + i}>
                                      <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                                      <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                                      <TableCell className="text-sm">{it.descripcion}</TableCell>
                                      <TableCell className="text-center">
                                        <Input type="number" min="0" step="1" className="h-8 w-20" value={it.cantidad} onChange={(e) => cambiarCantidad(i, 'cantidad', e.target.value)} />
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Input
                                          type="number"
                                          min="0"
                                          step="1"
                                          className="h-8 w-20"
                                          value={it.cantidad_real}
                                          onChange={(e) => cambiarCantidad(i, 'cantidad_real', e.target.value)}
                                        />
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                                      <TableCell>
                                        <Button variant="ghost" size="icon" onClick={() => quitarItemEdit(i)} title="Quitar">
                                          ✕
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <div className="max-w-sm">
                                <ProductoAutocomplete
                                  value={nuevaBusqueda}
                                  productos={allProducts}
                                  placeholder="Agregar producto…"
                                  onChange={setNuevaBusqueda}
                                  onSelect={agregarProductoEdit}
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button type="button" variant="outline" size="sm" onClick={cancelarEdicion}>
                                  Cancelar
                                </Button>
                                <Button type="button" size="sm" onClick={() => guardarEdicion(s.id)} disabled={guardandoEdit}>
                                  {guardandoEdit ? 'Guardando…' : '💾 Guardar cambios'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-center">#</TableHead>
                                  <TableHead>Código</TableHead>
                                  <TableHead>Descripción</TableHead>
                                  <TableHead className="text-center">Cant. Sol.</TableHead>
                                  <TableHead className="text-center">Cant. Real</TableHead>
                                  <TableHead>Unidad</TableHead>
                                  <TableHead className="text-center">Módulos</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {s.items.map((it, i) => {
                                  const modulos = it.cantidad_por_modulo != null && it.cantidad_por_modulo > 0 ? it.cantidad_real / it.cantidad_por_modulo : null
                                  return (
                                    <TableRow key={i}>
                                      <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                                      <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                                      <TableCell className="text-sm">{it.descripcion}</TableCell>
                                      <TableCell className="text-center">{it.cantidad}</TableCell>
                                      <TableCell className="text-center">{it.cantidad_real}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                                      <TableCell className="text-center font-semibold text-primary">{modulos != null ? modulos.toFixed(2) : '—'}</TableCell>
                                    </TableRow>
                                  )
                                })}
                                {s.observacion && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-xs text-muted-foreground">
                                      📝 {s.observacion}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

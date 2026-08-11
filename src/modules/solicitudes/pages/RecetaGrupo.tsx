import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ListChecks } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { useCatalogoGD, type Producto } from '@/modules/logistica/hooks/useCatalogoGD'
import ProductoAutocomplete from '@/modules/logistica/components/ProductoAutocomplete'
import { useAuth } from '../hooks/useAuth'
import { useGruposResponsables } from '../hooks/useGruposResponsables'

const normCod = (c: string) => String(c || '').trim().toUpperCase()

export default function RecetaGrupo() {
  const { puedeEditar } = useAuth()
  const { allProducts } = useCatalogoGD()
  const { grupos, responsables, recetasItems, cargarRecetaItems, agregarReceta, quitarReceta, actualizarResponsableDefault } = useGruposResponsables()

  const [grupoId, setGrupoId] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [productoNuevo, setProductoNuevo] = useState<Producto | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardandoResponsable, setGuardandoResponsable] = useState(false)

  const grupoActual = grupos.find((g) => String(g.id) === grupoId)
  const responsablesGrupo = responsables.filter((r) => String(r.grupo_id) === grupoId)

  async function onCambiarResponsableDefault(value: string) {
    setGuardandoResponsable(true)
    try {
      await actualizarResponsableDefault(Number(grupoId), value === '__ninguno' ? null : Number(value))
      toast.success('Responsable por defecto actualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setGuardandoResponsable(false)
    }
  }

  useEffect(() => {
    if (!grupoId) return
    setLoadingItems(true)
    cargarRecetaItems(Number(grupoId)).finally(() => setLoadingItems(false))
  }, [grupoId, cargarRecetaItems])

  const items = recetasItems[Number(grupoId)] ?? []

  const productosPorCodigo = useMemo(() => {
    const map = new Map<string, Producto>()
    for (const p of allProducts) map.set(normCod(p.codigo), p)
    return map
  }, [allProducts])

  async function onAgregar() {
    if (!productoNuevo) return
    if (items.some((it) => normCod(it.codigo) === normCod(productoNuevo.codigo))) {
      toast.error('Ese producto ya está en la receta del grupo')
      return
    }
    setGuardando(true)
    try {
      await agregarReceta(Number(grupoId), productoNuevo.codigo)
      setProductoNuevo(null)
      setBusqueda('')
      toast.success('Producto agregado a la receta')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar')
    } finally {
      setGuardando(false)
    }
  }

  async function onQuitar(id: string) {
    if (!confirm('¿Quitar este producto de la receta del grupo?')) return
    try {
      await quitarReceta(Number(grupoId), id)
      toast.success('Producto quitado de la receta')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al quitar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={grupoId} onValueChange={setGrupoId}>
          <SelectTrigger className="h-9 w-64">
            <SelectValue placeholder="Selecciona un grupo…" />
          </SelectTrigger>
          <SelectContent>
            {grupos.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!puedeEditar && grupoId && (
          <span className="text-xs text-muted-foreground">Solo lectura: no tienes permiso para editar la receta</span>
        )}
      </div>

      {!grupoId ? (
        <EmptyState icon={ListChecks} title="Selecciona un grupo para ver su receta" />
      ) : (
        <>
          {puedeEditar && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground">
                Responsable por defecto (usuarios de acceso restringido de este grupo no lo eligen, se asigna solo al guardar)
              </span>
              <Select
                value={grupoActual?.responsable_default_id != null ? String(grupoActual.responsable_default_id) : '__ninguno'}
                onValueChange={onCambiarResponsableDefault}
                disabled={guardandoResponsable}
              >
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="Sin responsable por defecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguno">Sin responsable por defecto</SelectItem>
                  {responsablesGrupo.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {puedeEditar && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Agregar producto a la receta</span>
                <ProductoAutocomplete
                  value={busqueda}
                  productos={allProducts}
                  onChange={setBusqueda}
                  onSelect={(p) => {
                    setProductoNuevo(p)
                    setBusqueda(p.codigo)
                  }}
                  placeholder="Código o descripción…"
                />
              </div>
              <Button type="button" onClick={onAgregar} disabled={!productoNuevo || guardando}>
                {guardando ? 'Agregando…' : 'Agregar'}
              </Button>
            </div>
          )}

          {!loadingItems && items.length === 0 ? (
            <EmptyState icon={ListChecks} title="Este grupo aún no tiene receta cargada" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Unidad</TableHead>
                    {puedeEditar && <TableHead />}
                  </TableRow>
                </TableHeader>
                {loadingItems ? (
                  <TableSkeleton columns={3 + (puedeEditar ? 1 : 0)} />
                ) : (
                  <TableBody>
                    {items.map((it) => {
                      const prod = productosPorCodigo.get(normCod(it.codigo))
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                          <TableCell className="max-w-md truncate text-sm">{prod?.descripcion ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{prod?.unidad ?? '—'}</TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => onQuitar(it.id)}>✕</Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                )}
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

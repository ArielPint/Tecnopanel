import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Vacio } from '../components/comunes'
import { eliminarMaterial, guardarMaterial, type Material } from '../lib/api'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

type Edicion = Omit<Material, 'id'> & { id?: string }
const VACIO: Edicion = { codigo: '', descripcion: '', unidad: 'UNIDAD', activo: true }

export default function Materiales() {
  const { puede } = usePermisosSip('recetas')
  const { materiales, recetas, loading, recargar } = useCatalogo()
  const [texto, setTexto] = useState('')
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [guardando, setGuardando] = useState(false)

  const usos = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of recetas) m.set(r.material_id, (m.get(r.material_id) ?? 0) + 1)
    return m
  }, [recetas])

  const q = texto.trim().toLowerCase()
  const visibles = materiales.filter((m) => !q || `${m.codigo} ${m.descripcion}`.toLowerCase().includes(q))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!edicion) return
    setGuardando(true)
    try {
      await guardarMaterial(edicion)
      toast.success('Material guardado')
      setEdicion(null)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(m: Material) {
    if (!window.confirm(`¿Eliminar el material ${m.codigo}?`)) return
    try {
      await eliminarMaterial(m.id)
      toast.success('Material eliminado')
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar código o descripción" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        {puede('editar') && (
          <Button onClick={() => setEdicion({ ...VACIO })}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo material
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : visibles.length === 0 ? (
            <Vacio>{materiales.length === 0 ? 'Aún no hay materiales: se crean solos al importar el Excel de recetas.' : 'Ningún material coincide con la búsqueda.'}</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">En recetas</TableHead>
                    {puede('editar') && <TableHead className="w-24" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono-tabular font-semibold">{m.codigo}</TableCell>
                      <TableCell>
                        {m.descripcion}
                        {!m.activo && (
                          <Badge variant="secondary" className="ml-2">
                            Desactivado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{m.unidad}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{usos.get(m.id) ?? 0}</TableCell>
                      {puede('editar') && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setEdicion({ ...m })} aria-label={`Editar ${m.codigo}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => eliminar(m)} aria-label={`Eliminar ${m.codigo}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edicion} onOpenChange={(o) => !o && setEdicion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edicion?.id ? `Material ${edicion.codigo}` : 'Nuevo material'}</DialogTitle>
          </DialogHeader>
          {edicion && (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="m-codigo">Código SAP</Label>
                  <Input id="m-codigo" value={edicion.codigo} onChange={(e) => setEdicion({ ...edicion, codigo: e.target.value })} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="m-unidad">Unidad</Label>
                  <Input id="m-unidad" value={edicion.unidad} onChange={(e) => setEdicion({ ...edicion, unidad: e.target.value })} required list="sip-unidades" />
                  <datalist id="sip-unidades">
                    {['UNIDAD', 'KG', 'M3', 'M2', 'ML', 'PZA', 'PLAN'].map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="m-desc">Descripción</Label>
                <Input id="m-desc" value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={edicion.activo} onCheckedChange={(v) => setEdicion({ ...edicion, activo: !!v })} />
                Activo (se puede agregar a recetas)
              </label>
              <DialogFooter>
                <Button type="submit" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

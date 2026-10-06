import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { eliminarProyectoPropio, guardarProyectoPropio, type ProyectoPropio } from '../lib/api'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

type Edicion = Omit<ProyectoPropio, 'id'> & { id?: string }

/** Listado de proyectos que se pueden elegir al registrar producción, además de las obras del hub. */
export default function Proyectos() {
  const { puede } = usePermisosSip('recetas')
  const editable = puede('editar')
  const { proyectos, proyectosPropios, loading, recargar } = useCatalogo()
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!edicion) return
    setGuardando(true)
    try {
      await guardarProyectoPropio(edicion)
      toast.success('Proyecto guardado')
      setEdicion(null)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(p: ProyectoPropio) {
    if (!window.confirm(`¿Eliminar el proyecto "${p.nombre}"? Si ya tiene producción registrada no se puede: desactívelo.`)) return
    try {
      await eliminarProyectoPropio(p.id)
      toast.success('Proyecto eliminado')
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  if (loading) return <Cargando />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Proyectos o clientes que se pueden elegir al registrar producción.</p>
        {editable && (
          <Button onClick={() => setEdicion({ nombre: '', activo: true })}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo proyecto
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {proyectosPropios.length === 0 && proyectos.length === 0 ? (
            <Vacio>Aún no hay proyectos.</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Origen</TableHead>
                  {editable && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {proyectosPropios.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">
                      {p.nombre}
                      {!p.activo && (
                        <Badge variant="secondary" className="ml-2">
                          Desactivado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">Este portal</TableCell>
                    {editable && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEdicion({ ...p })} aria-label={`Editar ${p.nombre}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => eliminar(p)} aria-label={`Eliminar ${p.nombre}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {proyectos.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold">{o.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Obra del hub (se administra en Proyectos del hub)</TableCell>
                    {editable && <TableCell />}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edicion} onOpenChange={(o) => !o && setEdicion(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edicion?.id ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          </DialogHeader>
          {edicion && (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pp-nombre">Nombre</Label>
                <Input id="pp-nombre" value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} required maxLength={120} autoFocus />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={edicion.activo} onCheckedChange={(v) => setEdicion({ ...edicion, activo: !!v })} />
                Activo (se puede elegir al registrar producción)
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

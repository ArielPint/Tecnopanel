import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAccesos, type Acceso } from './useAccesos'
import FormularioAcceso from './FormularioAcceso'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatUltimoIngreso(iso: string | null): { relativo: string; absoluto: string } | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  let relativo: string
  if (min < 1) relativo = 'recién'
  else if (min < 60) relativo = `hace ${min} min`
  else if (min < 60 * 24) relativo = `hace ${Math.floor(min / 60)} h`
  else {
    const dias = Math.floor(min / (60 * 24))
    relativo = `hace ${dias} día${dias === 1 ? '' : 's'}`
  }
  const absoluto = new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
  return { relativo, absoluto }
}

export default function UsuariosPage() {
  const { accesos, proyectosObra, loading, error, crear, actualizar, eliminar } = useAccesos()

  async function onEliminar(a: Acceso) {
    if (!confirm(`¿Eliminar a ${a.nombre} ${a.apellido ?? ''}? Esta acción no se puede deshacer.`)) return
    try {
      await eliminar(a.id)
      toast.success('Usuario eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar usuarios: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            {accesos.length > 0 ? `${accesos.length} cuentas con acceso al hub.` : 'Cuentas con acceso al hub.'}
          </p>
        </div>
        <FormularioAcceso
          proyectosObra={proyectosObra}
          onGuardar={crear}
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus size={16} /> Nuevo usuario
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Accesos</TableHead>
                  <TableHead>Último ingreso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accesos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-bold">
                        {a.nombre} {a.apellido}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">{a.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={a.activo ? 'success' : 'secondary'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                        {a.isSuperAdmin && <Badge variant="warning">Super admin</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {proyectosObra.map((proy) => {
                          const n = a.proyectos[proy.id]?.modulos.length ?? 0
                          return n > 0 ? (
                            <Badge key={proy.id} variant="outline">
                              {proy.nombre} ({n})
                            </Badge>
                          ) : null
                        })}
                        {a.crmModulos.length > 0 && <Badge variant="outline">CRM ({a.crmModulos.length})</Badge>}
                        {proyectosObra.every((proy) => (a.proyectos[proy.id]?.modulos.length ?? 0) === 0) &&
                          a.crmModulos.length === 0 && <span className="text-sm text-muted-foreground">Sin accesos</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const ui = formatUltimoIngreso(a.ultimoIngreso)
                        return ui ? (
                          <div>
                            <div className="text-sm">{ui.relativo}</div>
                            <div className="text-[12.5px] text-muted-foreground">{ui.absoluto}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nunca</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <FormularioAcceso
                          acceso={a}
                          proyectosObra={proyectosObra}
                          onGuardar={(input) => actualizar(a.id, input)}
                          trigger={
                            <Button size="icon" variant="ghost">
                              <Pencil size={14} />
                            </Button>
                          }
                        />
                        <Button size="icon" variant="ghost" onClick={() => onEliminar(a)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

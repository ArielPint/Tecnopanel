import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { useUsuarios, type Usuario } from '../hooks/useUsuarios'
import { PAGE_MAP } from '../lib/pageMap'
import FormularioUsuario from '../components/FormularioUsuario'

const ROLE_BADGE: Record<string, 'default' | 'secondary' | 'outline' | 'warning' | 'destructive'> = {
  admin: 'default',
  editor: 'secondary',
  operador: 'outline',
  compras: 'outline',
  viewer: 'secondary',
  readonly: 'destructive',
}

function fmtFecha(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Admin() {
  const { perfil } = useAuth()
  const { usuarios, loginStats, loading, crear, actualizar, eliminar } = useUsuarios()

  async function onEliminar(u: Usuario) {
    if (u.id === perfil?.id) {
      toast.error('No puedes eliminar tu propio usuario')
      return
    }
    if (!confirm(`¿Eliminar a "${u.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await eliminar(u.id)
      toast.success('Usuario eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Usuarios</h2>
          <p className="text-xs text-muted-foreground">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''}</p>
        </div>
        <FormularioUsuario onGuardar={crear} trigger={<Button size="sm">+ Nuevo usuario</Button>} />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : usuarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin usuarios" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Páginas con acceso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ingresos</TableHead>
                <TableHead>Últ. modificación</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => {
                const pages = (u.permissions?.pages as Record<string, { access?: boolean }>) || {}
                const stats = loginStats[u.id]
                const isSelf = u.id === perfil?.id
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.name}
                        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
                      </div>
                      {u.email && <div className="text-xs text-muted-foreground">{u.email}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[u.role] ?? 'secondary'}>{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(PAGE_MAP)
                          .filter(([pid]) => pages[pid]?.access)
                          .map(([pid, def]) => (
                            <Badge key={pid} variant="outline" className="text-[10px]">
                              {def.label}
                            </Badge>
                          ))}
                        {u.role === 'admin' && <span className="text-xs text-muted-foreground">Todas (admin)</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? 'success' : 'destructive'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs">{stats?.count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtFecha(u.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <FormularioUsuario
                          usuario={u}
                          onGuardar={(input) => actualizar(u.id, input)}
                          trigger={
                            <Button variant="outline" size="sm">
                              Editar
                            </Button>
                          }
                        />
                        {!isSelf && (
                          <Button variant="outline" size="sm" onClick={() => onEliminar(u)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

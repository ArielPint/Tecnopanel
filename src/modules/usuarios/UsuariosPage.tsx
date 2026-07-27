import { useUsuarios } from './useUsuarios'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const accesoTone: Record<string, 'success' | 'warning' | 'secondary'> = {
  full_access: 'success',
}

export default function UsuariosPage() {
  const { usuarios, loading, error } = useUsuarios()

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar usuarios: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          {usuarios.length > 0 ? `${usuarios.length} cuentas con acceso al hub.` : 'Cuentas con acceso al hub.'} La
          gestión de permisos por rol (Fase 4) todavía no está implementada — por ahora todos los accesos son
          full_access.
        </p>
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
                  <TableHead>Rol</TableHead>
                  <TableHead>Accesos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-bold">
                        {u.nombre} {u.apellido}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{u.rol}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {u.accesos.length === 0 ? (
                          <span className="text-sm text-muted-foreground">Sin accesos</span>
                        ) : (
                          u.accesos.map((a) => (
                            <Badge key={a.slug} variant={accesoTone[a.rol] ?? 'secondary'}>
                              {a.proyecto}
                            </Badge>
                          ))
                        )}
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

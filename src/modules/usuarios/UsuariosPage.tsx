import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAccesos, type Acceso } from './useAccesos'
import FormularioAcceso from './FormularioAcceso'

/** Módulos de Producción SIP con acceso: claves '<modulo>:ver' marcadas */
const nSip = (a: Acceso) => Object.entries(a.sipAcciones).filter(([k, v]) => v && k.endsWith(':ver')).length
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/financiero/components/ui/table'

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            {accesos.length > 0 ? `${accesos.length} cuentas con acceso al portal.` : 'Cuentas con acceso al portal.'}
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
                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Accesos</TableHead>
                  <TableHead className="hidden lg:table-cell">Último ingreso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accesos.map((a) => {
                  const estado = (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={a.activo ? 'success' : 'secondary'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                      {a.isSuperAdmin && <Badge variant="warning">Super admin</Badge>}
                    </div>
                  )
                  // módulos de Prevención: claves '<modulo>:ver' marcadas
                  const nSso = Object.entries(a.ssoAcciones).filter(([k, v]) => v && k.endsWith(':ver')).length
                  const accesosBadges = (
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
                      {nSip(a) > 0 && <Badge variant="outline">Producción SIP ({nSip(a)})</Badge>}
                      {nSso > 0 && <Badge variant="outline">Prevención ({nSso})</Badge>}
                      {proyectosObra.every((proy) => (a.proyectos[proy.id]?.modulos.length ?? 0) === 0) &&
                        a.crmModulos.length === 0 &&
                        nSip(a) === 0 &&
                        nSso === 0 && <span className="text-sm text-muted-foreground">Sin accesos</span>}
                    </div>
                  )
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-bold">
                          {a.nombre} {a.apellido}
                        </div>
                        <div className="break-all text-[12.5px] text-muted-foreground">{a.email}</div>
                        {/* en pantallas angostas las columnas se ocultan: su contenido va aquí */}
                        <div className="mt-1.5 flex flex-col gap-1.5 md:hidden">
                          <div className="sm:hidden">{estado}</div>
                          {accesosBadges}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{estado}</TableCell>
                      <TableCell className="hidden md:table-cell">{accesosBadges}</TableCell>
                      <TableCell className="hidden lg:table-cell">
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

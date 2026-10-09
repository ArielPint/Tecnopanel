import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { guardarArea } from '../lib/api'
import type { Area } from '../lib/tipos'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { RUTA } from '../lib/rutas'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export default function AreasConfig() {
  const { puede, loading: permisosLoading } = usePermisosSso('configuracion')
  const { areas, responsables, recargar, loading } = useDatosSso()
  const [nombre, setNombre] = useState('')
  const [encargado, setEncargado] = useState('')
  const [guardando, setGuardando] = useState(false)

  if (!permisosLoading && !puede('ver')) return <Navigate to={RUTA.inicio} replace />
  // con solo 'ver' la lista queda en lectura (la RLS de sso_areas exige 'editar' para escribir)
  const editable = puede('editar')

  async function guardar(area: Parameters<typeof guardarArea>[0], ok: string) {
    setGuardando(true)
    try {
      await guardarArea(area)
      toast.success(ok)
      await recargar()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar el área'
      toast.error(msg.includes('duplicate') ? 'Ya existe un área con ese nombre' : msg)
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (await guardar({ nombre: nombre.trim(), encargado_user_id: encargado || null }, 'Área creada')) {
      setNombre('')
      setEncargado('')
    }
  }

  const actualizar = (a: Area, cambios: Partial<Area>) =>
    guardar({ id: a.id, nombre: a.nombre, encargado_user_id: a.encargado_user_id, activa: a.activa, ...cambios }, 'Área actualizada')

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cada hallazgo de un área se asigna por defecto a su encargado. Solo pueden ser encargados las personas que pueden
        responder hallazgos (acción "Encargado de área" en Hallazgos) o los admin.
      </p>
      {editable && (
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={onCrear} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Nombre del área (ej: Planta Santiago - Corte)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <select value={encargado} onChange={(e) => setEncargado(e.target.value)} className={selectClase}>
              <option value="">Sin encargado</option>
              {responsables.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.email}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={guardando || !nombre.trim()}>
              Agregar área
            </Button>
          </form>
        </CardContent>
      </Card>
      )}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : areas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay áreas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead>Encargado</TableHead>
                  <TableHead className="w-24">Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((a) => (
                  <TableRow key={a.id} className={a.activa ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">{a.nombre}</TableCell>
                    <TableCell>
                      <select
                        value={a.encargado_user_id ?? ''}
                        onChange={(e) => actualizar(a, { encargado_user_id: e.target.value || null })}
                        className={selectClase}
                        disabled={guardando || !editable}
                      >
                        <option value="">Sin encargado</option>
                        {responsables.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre || u.email}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Checkbox checked={a.activa} disabled={guardando || !editable} onCheckedChange={(v) => actualizar(a, { activa: !!v })} />
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

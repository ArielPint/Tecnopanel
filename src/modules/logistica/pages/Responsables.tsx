import { useState } from 'react'
import { toast } from 'sonner'
import { Play, Pause, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Card, CardContent, CardHeader } from '@/modules/financiero/components/ui/card'
import { useAuth } from '../hooks/useAuth'
import { useResponsables, type Grupo, type Responsable } from '../hooks/useResponsables'
import FormularioGrupo from '../components/FormularioGrupo'

export default function Responsables() {
  const { isAdmin } = useAuth()
  const {
    grupos, responsables, loading, error,
    crearGrupo, editarGrupo, eliminarGrupo, agregarResponsable, toggleResponsable, eliminarResponsable,
  } = useResponsables()

  async function onEliminarGrupo(g: Grupo) {
    const members = responsables.filter((r) => r.grupo_id === g.id)
    const msg = members.length
      ? `El grupo "${g.nombre}" tiene ${members.length} persona(s). ¿Eliminar igual? Las personas quedarán sin grupo.`
      : `¿Eliminar el grupo "${g.nombre}"?`
    if (!confirm(msg)) return
    try {
      await eliminarGrupo(g.id)
      toast.success('Grupo eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function onEliminarResp(r: Responsable) {
    if (!confirm(`¿Eliminar a "${r.nombre}"?`)) return
    try {
      await eliminarResponsable(r.id)
      toast.success('Persona eliminada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function onToggleResp(r: Responsable) {
    try {
      await toggleResponsable(r.id, r.activo)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>

  const sinGrupo = responsables.filter((r) => !r.grupo_id)

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <FormularioGrupo onGuardar={crearGrupo} />
        </div>
      )}

      {grupos.length === 0 && sinGrupo.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay grupos. Creá uno con "+ Nuevo grupo".</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map((g) => {
            const members = responsables.filter((r) => r.grupo_id === g.id)
            return (
              <GrupoCard
                key={g.id}
                grupo={g}
                members={members}
                isAdmin={isAdmin}
                onEditar={(nombre) => editarGrupo(g.id, nombre)}
                onEliminar={() => onEliminarGrupo(g)}
                onAgregar={(nombre) => agregarResponsable(g.id, nombre)}
                onToggleResp={onToggleResp}
                onEliminarResp={onEliminarResp}
              />
            )
          })}
          {sinGrupo.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between px-4 pb-0">
                <span className="text-sm font-semibold text-muted-foreground">Sin grupo</span>
                <span className="text-xs text-muted-foreground">{sinGrupo.length}</span>
              </CardHeader>
              <CardContent className="px-4 pt-3">
                <div className="space-y-1.5">
                  {sinGrupo.map((r) => (
                    <MemberRow key={r.id} r={r} isAdmin={isAdmin} onToggle={() => onToggleResp(r)} onEliminar={() => onEliminarResp(r)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function GrupoCard({
  grupo, members, isAdmin, onEditar, onEliminar, onAgregar, onToggleResp, onEliminarResp,
}: {
  grupo: Grupo
  members: Responsable[]
  isAdmin: boolean
  onEditar: (nombre: string) => Promise<void>
  onEliminar: () => void
  onAgregar: (nombre: string) => Promise<void>
  onToggleResp: (r: Responsable) => void
  onEliminarResp: (r: Responsable) => void
}) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const activos = members.filter((r) => r.activo).length

  async function onAdd() {
    if (!nuevoNombre.trim()) return
    try {
      await onAgregar(nuevoNombre.trim())
      setNuevoNombre('')
      toast.success('Persona agregada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar')
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 pb-0">
        <span className="text-sm font-semibold">
          {grupo.nombre}
          {!grupo.activo && <span className="ml-1 text-xs text-muted-foreground">(inactivo)</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{activos}/{members.length}</span>
          {isAdmin && (
            <>
              <FormularioGrupo
                grupo={grupo}
                onGuardar={onEditar}
                trigger={<button title="Editar grupo"><Pencil className="size-3.5 text-muted-foreground hover:text-foreground" /></button>}
              />
              <button title="Eliminar grupo" onClick={onEliminar}>
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-3">
        <div className="space-y-1.5">
          {members.length ? (
            members.map((r) => (
              <MemberRow key={r.id} r={r} isAdmin={isAdmin} onToggle={() => onToggleResp(r)} onEliminar={() => onEliminarResp(r)} />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Sin personas aún.</span>
          )}
        </div>
        {isAdmin && (
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Nombre persona…"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={onAdd}>+ Agregar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MemberRow({ r, isAdmin, onToggle, onEliminar }: { r: Responsable; isAdmin: boolean; onToggle: () => void; onEliminar: () => void }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={r.activo ? '' : 'text-muted-foreground'}>
        {r.nombre}
        {!r.activo && <span className="ml-1 text-xs">(inactivo)</span>}
      </span>
      {isAdmin && (
        <div className="flex gap-1.5">
          <button title={r.activo ? 'Desactivar' : 'Activar'} onClick={onToggle}>
            {r.activo ? <Pause className="size-3.5 text-muted-foreground hover:text-foreground" /> : <Play className="size-3.5 text-muted-foreground hover:text-foreground" />}
          </button>
          <button title="Eliminar" onClick={onEliminar}>
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </div>
  )
}

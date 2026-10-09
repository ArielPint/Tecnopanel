import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { ESTADO_ACUERDO, guardarAcuerdo, informarAvance, type Acuerdo, type EstadoAcuerdo } from '../lib/apiComite'
import { hoyChile } from '../lib/estados'
import type { UsuarioSso } from '../lib/tipos'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * Alta y edición de un acuerdo. modo 'avance': lo que puede informar el responsable (estado, avance y
 * fecha de cumplimiento); la base no le deja cambiar nada más.
 */
export function DialogAcuerdo({
  open,
  onOpenChange,
  comiteId,
  reunionId,
  acuerdo,
  modo,
  responsables,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  comiteId: string
  reunionId: string | null
  acuerdo: Acuerdo | null
  modo: 'completo' | 'avance'
  responsables: UsuarioSso[]
  onGuardado: () => void
}) {
  const [descripcion, setDescripcion] = useState('')
  const [respUser, setRespUser] = useState('')
  const [respNombre, setRespNombre] = useState('')
  const [plazo, setPlazo] = useState('')
  const [estado, setEstado] = useState<EstadoAcuerdo>('pendiente')
  const [avance, setAvance] = useState('')
  const [cumplido, setCumplido] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    setDescripcion(acuerdo?.descripcion ?? '')
    setRespUser(acuerdo?.responsable_user_id ?? '')
    setRespNombre(acuerdo?.responsable_nombre ?? '')
    setPlazo(acuerdo?.fecha_compromiso ?? '')
    setEstado(acuerdo?.estado ?? 'pendiente')
    setAvance(acuerdo?.avance ?? '')
    setCumplido(acuerdo?.fecha_cumplimiento ?? '')
  }, [open, acuerdo])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (modo === 'completo' && !descripcion.trim()) {
      toast.error('Describe el acuerdo')
      return
    }
    if (modo === 'completo' && !respUser && !respNombre.trim()) {
      toast.error('Indica el responsable: una persona del portal o un nombre')
      return
    }
    setEnviando(true)
    try {
      const fecha = estado === 'cumplido' ? cumplido || hoyChile() : null
      if (modo === 'avance' && acuerdo) {
        await informarAvance(acuerdo.id, estado, avance.trim() || null, fecha)
      } else {
        await guardarAcuerdo(acuerdo?.id ?? null, {
          comite_id: comiteId,
          reunion_id: acuerdo ? acuerdo.reunion_id : reunionId,
          descripcion: descripcion.trim(),
          responsable_user_id: respUser || null,
          responsable_nombre: respUser ? null : respNombre.trim() || null,
          fecha_compromiso: plazo || null,
          estado,
          avance: avance.trim() || null,
          fecha_cumplimiento: fecha,
        })
      }
      toast.success(acuerdo ? 'Acuerdo actualizado' : 'Acuerdo registrado')
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  const estados = (Object.keys(ESTADO_ACUERDO) as EstadoAcuerdo[]).filter((s) => modo === 'completo' || s !== 'anulado')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === 'avance' ? 'Informar avance' : acuerdo ? 'Editar acuerdo' : 'Nuevo acuerdo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {modo === 'completo' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ac-desc">Acuerdo *</Label>
                <Textarea id="ac-desc" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ac-resp">Responsable</Label>
                  <select id="ac-resp" value={respUser} onChange={(e) => setRespUser(e.target.value)} className={selectClase}>
                    <option value="">Otra persona (escribir nombre)</option>
                    {responsables.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ac-plazo">Plazo</Label>
                  <Input id="ac-plazo" type="date" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
                </div>
              </div>
              {!respUser && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ac-nombre">Nombre del responsable</Label>
                  <Input id="ac-nombre" value={respNombre} onChange={(e) => setRespNombre(e.target.value)} placeholder="Ej. Gerencia de Operaciones" />
                  <p className="text-[11px] text-muted-foreground">Las personas del portal reciben un aviso y pueden informar el avance ellas mismas.</p>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm">{acuerdo?.descripcion}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ac-estado">Estado</Label>
              <select id="ac-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoAcuerdo)} className={selectClase}>
                {estados.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_ACUERDO[s].label}
                  </option>
                ))}
              </select>
            </div>
            {estado === 'cumplido' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ac-cumplido">Cumplido el</Label>
                <Input id="ac-cumplido" type="date" value={cumplido || hoyChile()} max={hoyChile()} onChange={(e) => setCumplido(e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ac-avance">Avance / observaciones</Label>
            <Textarea id="ac-avance" rows={2} value={avance} onChange={(e) => setAvance(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

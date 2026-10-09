import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { actualizarTrabajador, crearTrabajador } from '../lib/apiTrabajadores'
import { formatearRut, normalizarRut, rutValido } from '../lib/rut'
import type { Area } from '../lib/tipos'
import type { Empresa, FichaTrabajador, Trabajador } from '../lib/tiposTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function fichaVacia(empresaPropia: string): FichaTrabajador {
  return {
    rut: '', nombres: '', apellidos: '', empresa_id: empresaPropia, cargo: null, area_id: null,
    fecha_ingreso: null, telefono: null, email: null, contacto_emergencia: null, observaciones: null,
  }
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  trabajador?: Trabajador | null
  empresas: Empresa[]
  areas: Area[]
  /** cargos ya usados, para sugerirlos */
  cargos: string[]
  onGuardado: (id: string) => void
}

export function FormTrabajador({ open, onOpenChange, trabajador, empresas, areas, cargos, onGuardado }: Props) {
  const propia = empresas.find((e) => e.propia)?.id ?? empresas[0]?.id ?? ''
  const [f, setF] = useState<FichaTrabajador>(fichaVacia(propia))
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!trabajador) {
      setF(fichaVacia(propia))
      return
    }
    // solo los campos editables: lo que viene de sso_trabajadores_v trae además columnas calculadas
    const t = trabajador
    setF({
      rut: formatearRut(t.rut), nombres: t.nombres, apellidos: t.apellidos, empresa_id: t.empresa_id, cargo: t.cargo,
      area_id: t.area_id, fecha_ingreso: t.fecha_ingreso, telefono: t.telefono, email: t.email,
      contacto_emergencia: t.contacto_emergencia, observaciones: t.observaciones,
    })
  }, [open, trabajador, propia])

  const set = <K extends keyof FichaTrabajador>(k: K, v: FichaTrabajador[K]) => setF((x) => ({ ...x, [k]: v }))
  const nul = (s: string) => s.trim() || null
  const rutOk = rutValido(f.rut)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rutOk) {
      toast.error('El RUT no es válido (revisa el dígito verificador)')
      return
    }
    if (!f.nombres.trim() || !f.apellidos.trim()) {
      toast.error('Nombres y apellidos son obligatorios')
      return
    }
    setEnviando(true)
    try {
      const ficha = { ...f, rut: normalizarRut(f.rut)! }
      if (trabajador) {
        await actualizarTrabajador(trabajador.id, ficha)
        toast.success('Ficha actualizada')
        onGuardado(trabajador.id)
      } else {
        const id = await crearTrabajador(ficha)
        toast.success('Trabajador agregado')
        onGuardado(id)
      }
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.error(msg.includes('duplicate') ? 'Ya existe un trabajador con ese RUT' : msg)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trabajador ? 'Editar ficha' : 'Nuevo trabajador'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-rut">RUT *</Label>
              <Input
                id="t-rut"
                value={f.rut}
                onChange={(e) => set('rut', e.target.value)}
                onBlur={() => rutOk && set('rut', formatearRut(f.rut))}
                placeholder="12.345.678-5"
                aria-invalid={!!f.rut && !rutOk}
                required
              />
              {f.rut && !rutOk && <p className="text-[11px] text-destructive">RUT inválido</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-nom">Nombres *</Label>
              <Input id="t-nom" value={f.nombres} onChange={(e) => set('nombres', e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-ape">Apellidos *</Label>
              <Input id="t-ape" value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-emp">Empresa</Label>
              <select id="t-emp" value={f.empresa_id} onChange={(e) => set('empresa_id', e.target.value)} className={selectClase}>
                {empresas
                  .filter((e) => e.activa || e.id === f.empresa_id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                      {e.propia ? '' : ' (contratista)'}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-cargo">Cargo</Label>
              <Input id="t-cargo" list="t-cargos" value={f.cargo ?? ''} onChange={(e) => set('cargo', nul(e.target.value))} />
              <datalist id="t-cargos">
                {cargos.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-area">Área</Label>
              <select id="t-area" value={f.area_id ?? ''} onChange={(e) => set('area_id', e.target.value || null)} className={selectClase}>
                <option value="">Sin área</option>
                {areas
                  .filter((a) => a.activa || a.id === f.area_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-ing">Fecha de ingreso</Label>
              <Input id="t-ing" type="date" value={f.fecha_ingreso ?? ''} onChange={(e) => set('fecha_ingreso', e.target.value || null)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-tel">Teléfono</Label>
              <Input id="t-tel" value={f.telefono ?? ''} onChange={(e) => set('telefono', nul(e.target.value))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-mail">Email</Label>
              <Input id="t-mail" type="email" value={f.email ?? ''} onChange={(e) => set('email', nul(e.target.value))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-emer">Contacto de emergencia</Label>
            <Input
              id="t-emer"
              value={f.contacto_emergencia ?? ''}
              onChange={(e) => set('contacto_emergencia', nul(e.target.value))}
              placeholder="Nombre, parentesco y teléfono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-obs">Observaciones</Label>
            <Textarea id="t-obs" rows={2} value={f.observaciones ?? ''} onChange={(e) => set('observaciones', nul(e.target.value))} />
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

import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { PAGE_MAP, FINANCIERO_EDIT_GROUPS, ESTADOS_PAGO_ACCION_GROUPS, ROLES } from '@/modules/settings/lib/pageMap'
import { ROL_META, MODULOS as CRM_MODULOS } from '@/modules/crm/lib/roles'
import type { Acceso, AccesoInput } from './useAccesos'

const LA_CHACRA_MODULOS = Object.keys(PAGE_MAP)

interface Props {
  acceso?: Acceso | null
  trigger: React.ReactNode
  onGuardar: (input: AccesoInput) => Promise<void>
}

function inputFromAcceso(acceso?: Acceso | null): AccesoInput {
  return {
    nombre: acceso?.nombre ?? '',
    apellido: acceso?.apellido ?? '',
    email: acceso?.email ?? '',
    password: '',
    activo: acceso?.activo ?? true,
    isSuperAdmin: acceso?.isSuperAdmin ?? false,
    rol: acceso?.rol ?? 'vendedor',
    laChacraRolNegocio: acceso?.laChacraRolNegocio ?? '',
    laChacraModulos: acceso?.laChacraModulos ?? [],
    laChacraFinancieroEdit: acceso?.laChacraFinancieroEdit ?? {},
    laChacraEstadosPagoAcciones: acceso?.laChacraEstadosPagoAcciones ?? {},
    laChacraLogisticaEdit: acceso?.laChacraLogisticaEdit ?? false,
    crmRolNegocio: acceso?.crmRolNegocio ?? '',
    crmModulos: acceso?.crmModulos ?? [],
  }
}

export default function FormularioAcceso({ acceso, trigger, onGuardar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState<AccesoInput>(inputFromAcceso(acceso))

  useEffect(() => {
    if (open) setForm(inputFromAcceso(acceso))
  }, [open, acceso])

  function toggleModulo(lista: 'laChacraModulos' | 'crmModulos', modulo: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      [lista]: checked ? [...f[lista], modulo] : f[lista].filter((m) => m !== modulo),
    }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y email son requeridos')
      return
    }
    if (!acceso && (!form.password || form.password.length < 6)) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setEnviando(true)
    try {
      await onGuardar(form)
      toast.success(acceso ? 'Usuario actualizado' : 'Usuario creado')
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{acceso ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Tabs defaultValue="cuenta">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
              <TabsTrigger value="proyecto">Accesos Proyecto</TabsTrigger>
              <TabsTrigger value="crm">Accesos CRM</TabsTrigger>
            </TabsList>

            <TabsContent value="cuenta" className="flex flex-col gap-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="a-nombre">Nombre</Label>
                  <Input id="a-nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} autoFocus required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="a-apellido">Apellido</Label>
                  <Input id="a-apellido" value={form.apellido} onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-email">Correo electrónico</Label>
                <Input id="a-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-pass">
                  Contraseña {acceso && <span className="text-xs font-normal text-muted-foreground">(dejar vacío para no cambiar)</span>}
                </Label>
                <Input
                  id="a-pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.activo} onCheckedChange={(v) => setForm((f) => ({ ...f, activo: !!v }))} />
                Usuario activo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isSuperAdmin} onCheckedChange={(v) => setForm((f) => ({ ...f, isSuperAdmin: !!v }))} />
                Super admin (puede administrar usuarios y accesos)
              </label>
            </TabsContent>

            <TabsContent value="proyecto" className="flex flex-col gap-3 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Rol en La Chacra</Label>
                <Select value={form.laChacraRolNegocio || undefined} onValueChange={(v) => setForm((f) => ({ ...f, laChacraRolNegocio: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin rol asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Módulos con acceso</Label>
                {LA_CHACRA_MODULOS.map((pid) => (
                  <label key={pid} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.laChacraModulos.includes(pid)} onCheckedChange={(v) => toggleModulo('laChacraModulos', pid, !!v)} />
                    {PAGE_MAP[pid as keyof typeof PAGE_MAP].label}
                  </label>
                ))}
              </div>
              {form.laChacraModulos.includes('financiero') && (
                <div className="flex flex-col gap-1.5 rounded-md border p-3">
                  <Label className="text-xs text-muted-foreground">Edición en Financiero</Label>
                  {FINANCIERO_EDIT_GROUPS.map((g) => (
                    <label key={g.key} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={form.laChacraFinancieroEdit[g.key] ?? false}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, laChacraFinancieroEdit: { ...f.laChacraFinancieroEdit, [g.key]: !!v } }))
                        }
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
              )}
              {form.laChacraModulos.includes('logistica') && (
                <div className="flex flex-col gap-1.5 rounded-md border p-3">
                  <Label className="text-xs text-muted-foreground">Edición en Logística</Label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={form.laChacraLogisticaEdit}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, laChacraLogisticaEdit: !!v }))}
                    />
                    Puede crear y editar despachos, registros y órdenes de compra
                  </label>
                </div>
              )}
              {form.laChacraModulos.includes('estados_pago') && (
                <div className="flex flex-col gap-1.5 rounded-md border p-3">
                  <Label className="text-xs text-muted-foreground">Acciones en Estados de Pago</Label>
                  {ESTADOS_PAGO_ACCION_GROUPS.map((g) => (
                    <label key={g.key} className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={form.laChacraEstadosPagoAcciones[g.key] ?? false}
                        onCheckedChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            laChacraEstadosPagoAcciones: { ...f.laChacraEstadosPagoAcciones, [g.key]: !!v },
                          }))
                        }
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="crm" className="flex flex-col gap-3 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Rol en CRM</Label>
                <Select
                  value={form.rol}
                  onValueChange={(v) => setForm((f) => ({ ...f, rol: v, crmRolNegocio: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROL_META).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  &quot;Admin&quot; otorga acceso total a todo el sistema, no solo a CRM.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Módulos con acceso</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CRM_MODULOS.map((m) => {
                    const on = form.crmModulos.includes(m)
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => toggleModulo('crmModulos', m, !on)}
                        className={
                          'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                          (on ? 'border-primary bg-primary/10 text-primary' : 'border-muted bg-muted/40 text-muted-foreground hover:bg-muted')
                        }
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

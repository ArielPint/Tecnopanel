import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { PAGE_MAP, FINANCIERO_EDIT_GROUPS, ESTADOS_PAGO_ACCION_GROUPS, ESTADOS_PAGO_INGRESOS_ACCION_GROUPS, ROLES } from '@/modules/settings/lib/pageMap'
import { ROL_META, MODULOS as CRM_MODULOS, CRM_ACCION_GROUPS } from '@/modules/crm/lib/roles'
import { proyectoAccesoVacio, type Acceso, type AccesoInput, type ProyectoAcceso, type ProyectoObra } from './useAccesos'

const OBRA_MODULOS = Object.keys(PAGE_MAP)

interface Props {
  acceso?: Acceso | null
  proyectosObra: ProyectoObra[]
  trigger: React.ReactNode
  onGuardar: (input: AccesoInput) => Promise<void>
}

function inputFromAcceso(acceso: Acceso | null | undefined, proyectosObra: ProyectoObra[]): AccesoInput {
  const proyectos: Record<string, ProyectoAcceso> = {}
  for (const p of proyectosObra) {
    proyectos[p.id] = acceso?.proyectos[p.id] ?? proyectoAccesoVacio()
  }
  return {
    nombre: acceso?.nombre ?? '',
    apellido: acceso?.apellido ?? '',
    email: acceso?.email ?? '',
    password: '',
    activo: acceso?.activo ?? true,
    isSuperAdmin: acceso?.isSuperAdmin ?? false,
    rol: acceso?.rol ?? 'vendedor',
    proyectos,
    crmRolNegocio: acceso?.crmRolNegocio ?? '',
    crmModulos: acceso?.crmModulos ?? [],
    crmAcciones: acceso?.crmAcciones ?? {},
    gestionVer: acceso?.gestionVer ?? false,
    grupoId: acceso?.grupoId ?? null,
    subcontratistaId: acceso?.subcontratistaId ?? null,
  }
}

export default function FormularioAcceso({ acceso, proyectosObra, trigger, onGuardar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState<AccesoInput>(inputFromAcceso(acceso, proyectosObra))
  const [gruposPorProyecto, setGruposPorProyecto] = useState<Record<string, { id: number; nombre: string }[]>>({})
  const [subcontratistas, setSubcontratistas] = useState<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    if (open) setForm(inputFromAcceso(acceso, proyectosObra))
  }, [open, acceso, proyectosObra])

  useEffect(() => {
    if (!open || proyectosObra.length === 0) return
    Promise.all(
      proyectosObra.map((p) =>
        supabase
          .from('grupos')
          .select('id, nombre')
          .eq('proyecto_id', p.id)
          .eq('activo', true)
          .order('nombre')
          .then((r) => [p.id, r.data ?? []] as const),
      ),
    ).then((entries) => setGruposPorProyecto(Object.fromEntries(entries)))
  }, [open, proyectosObra])

  useEffect(() => {
    if (!open) return
    supabase
      .from('subcontratistas')
      .select('id, nombre, user_id')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) =>
        setSubcontratistas((data ?? []).filter((s) => !s.user_id || s.id === acceso?.subcontratistaId)),
      )
  }, [open, acceso])

  function toggleCrmModulo(modulo: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      crmModulos: checked ? [...f.crmModulos, modulo] : f.crmModulos.filter((m) => m !== modulo),
    }))
  }

  function setProyectoAcceso(proyectoId: string, patch: Partial<ProyectoAcceso>) {
    setForm((f) => ({
      ...f,
      proyectos: { ...f.proyectos, [proyectoId]: { ...(f.proyectos[proyectoId] ?? proyectoAccesoVacio()), ...patch } },
    }))
  }

  function toggleModuloProyecto(proyectoId: string, modulo: string, checked: boolean) {
    const actual = form.proyectos[proyectoId] ?? proyectoAccesoVacio()
    const patch: Partial<ProyectoAcceso> = {
      modulos: checked ? [...actual.modulos, modulo] : actual.modulos.filter((m) => m !== modulo),
    }
    // Al marcar el módulo por primera vez, todas sus pestañas parten habilitadas
    // (si ya tenía pestañas guardadas de antes, se respetan).
    if (checked && !actual.tabs[modulo] && modulo in PAGE_MAP) {
      patch.tabs = { ...actual.tabs, [modulo]: Object.keys(PAGE_MAP[modulo as keyof typeof PAGE_MAP].tabs) }
    }
    setProyectoAcceso(proyectoId, patch)
  }

  function toggleTabProyecto(proyectoId: string, modulo: string, tab: string, checked: boolean) {
    const actual = form.proyectos[proyectoId] ?? proyectoAccesoVacio()
    const actuales = actual.tabs[modulo] ?? []
    setProyectoAcceso(proyectoId, {
      tabs: { ...actual.tabs, [modulo]: checked ? [...actuales, tab] : actuales.filter((t) => t !== tab) },
    })
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
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
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
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.gestionVer} onCheckedChange={(v) => setForm((f) => ({ ...f, gestionVer: !!v }))} />
                Acceso a Gestión (Reportes, Documentos, Alertas — módulo global del hub)
              </label>
              <div className="flex flex-col gap-1.5">
                <Label>Portal de subcontratista (opcional)</Label>
                <Select
                  value={form.subcontratistaId ?? '__ninguno'}
                  onValueChange={(v) => setForm((f) => ({ ...f, subcontratistaId: v === '__ninguno' ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No es un subcontratista" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguno">No es un subcontratista</SelectItem>
                    {subcontratistas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Si se vincula, dale también acceso al proyecto con el módulo &quot;Estados de Pago&quot; (pestaña
                  Listado, acción Crear) para que aparezca en su menú — la base de datos lo limita a ver y cargar
                  solo lo suyo aunque tenga ese permiso.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="proyecto" className="flex flex-col gap-4 pt-2">
              {proyectosObra.length === 0 && (
                <p className="text-sm text-muted-foreground">Aún no hay proyectos creados en el portal.</p>
              )}
              {proyectosObra.map((proy) => {
                const pa = form.proyectos[proy.id] ?? proyectoAccesoVacio()
                return (
                  <div key={proy.id} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-bold">{proy.nombre}</p>
                    <div className="flex flex-col gap-1.5">
                      <Label>Rol en el proyecto</Label>
                      <Select value={pa.rolNegocio || undefined} onValueChange={(v) => setProyectoAcceso(proy.id, { rolNegocio: v })}>
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
                      {OBRA_MODULOS.map((pid) => {
                        const def = PAGE_MAP[pid as keyof typeof PAGE_MAP]
                        const marcado = pa.modulos.includes(pid)
                        return (
                          <div key={pid} className="flex flex-col gap-1.5">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox checked={marcado} onCheckedChange={(v) => toggleModuloProyecto(proy.id, pid, !!v)} />
                              {def.label}
                            </label>
                            {marcado && pid !== 'financiero' && (
                              <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1 rounded-md border p-2">
                                {Object.entries(def.tabs).map(([tabKey, tabLabel]) => (
                                  <label key={tabKey} className="flex items-center gap-1.5 text-xs">
                                    <Checkbox
                                      checked={(pa.tabs[pid] ?? []).includes(tabKey)}
                                      onCheckedChange={(v) => toggleTabProyecto(proy.id, pid, tabKey, !!v)}
                                    />
                                    {tabLabel}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {pa.modulos.includes('financiero') && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Edición en Financiero</Label>
                        {FINANCIERO_EDIT_GROUPS.map((g) => (
                          <label key={g.key} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={pa.financieroEdit[g.key] ?? false}
                              onCheckedChange={(v) =>
                                setProyectoAcceso(proy.id, { financieroEdit: { ...pa.financieroEdit, [g.key]: !!v } })
                              }
                            />
                            {g.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {(pa.modulos.includes('produccion') || pa.modulos.includes('obra')) && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Subcontrato asociado (Producción / Avance Obra)</Label>
                        <Select
                          value={pa.subcontrato || '__ninguno'}
                          onValueChange={(v) => setProyectoAcceso(proy.id, { subcontrato: v === '__ninguno' ? '' : (v as 'WEDO' | 'CONBES') })}
                        >
                          <SelectTrigger className="h-8 w-56">
                            <SelectValue placeholder="Ver todos los módulos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ninguno">Ver todos los módulos</SelectItem>
                            <SelectItem value="WEDO">We Do</SelectItem>
                            <SelectItem value="CONBES">Conbes</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Si se asigna, en Producción y Avance Obra este usuario solo ve los módulos asociados a ese subcontrato.
                        </p>
                      </div>
                    )}
                    {pa.modulos.includes('logistica') && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Edición en Logística</Label>
                        <label className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={pa.logisticaEdit}
                            onCheckedChange={(v) => setProyectoAcceso(proy.id, { logisticaEdit: !!v })}
                          />
                          Puede crear y editar despachos, registros, órdenes de compra y productos del catálogo
                        </label>
                      </div>
                    )}
                    {pa.modulos.includes('solicitudes') && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Edición en Solicitudes de Materiales</Label>
                        <label className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={pa.solicitudesEdit}
                            onCheckedChange={(v) => setProyectoAcceso(proy.id, { solicitudesEdit: !!v })}
                          />
                          Puede ver todas las solicitudes (no solo las propias), editarlas, enviarlas y editar la receta por grupo
                        </label>
                        {pa.tabs.solicitudes?.includes('catalogo') && (
                          <>
                            <label className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={pa.solicitudesCatalogoCrearEditar}
                                onCheckedChange={(v) => setProyectoAcceso(proy.id, { solicitudesCatalogoCrearEditar: !!v })}
                              />
                              Puede agregar y editar productos del catálogo (sin necesitar acceso a Logística)
                            </label>
                            <label className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={pa.solicitudesCatalogoEliminar}
                                onCheckedChange={(v) => setProyectoAcceso(proy.id, { solicitudesCatalogoEliminar: !!v })}
                              />
                              Puede eliminar (ocultar) productos del catálogo (sin necesitar acceso a Logística)
                            </label>
                          </>
                        )}
                        {!pa.solicitudesEdit && (
                          <div className="flex flex-col gap-1.5 pt-1">
                            <Label className="text-xs text-muted-foreground">
                              Acceso restringido — grupo fijo (solo crea solicitudes de ese grupo, sin ver para quién ni poder enviarlas)
                            </Label>
                            <Select
                              value={form.grupoId != null ? String(form.grupoId) : '__ninguno'}
                              onValueChange={(v) => setForm((f) => ({ ...f, grupoId: v === '__ninguno' ? null : Number(v) }))}
                            >
                              <SelectTrigger className="h-8 w-64">
                                <SelectValue placeholder="Sin grupo asignado" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__ninguno">Sin grupo asignado</SelectItem>
                                {(gruposPorProyecto[proy.id] ?? []).map((g) => (
                                  <SelectItem key={g.id} value={String(g.id)}>
                                    {g.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}
                    {pa.modulos.includes('estados_pago') && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Acciones en Estados de Pago</Label>
                        {ESTADOS_PAGO_ACCION_GROUPS.map((g) => (
                          <label key={g.key} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={pa.estadosPagoAcciones[g.key] ?? false}
                              onCheckedChange={(v) =>
                                setProyectoAcceso(proy.id, { estadosPagoAcciones: { ...pa.estadosPagoAcciones, [g.key]: !!v } })
                              }
                            />
                            {g.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {pa.modulos.includes('estados_pago_ingresos') && (
                      <div className="flex flex-col gap-1.5 rounded-md border p-3">
                        <Label className="text-xs text-muted-foreground">Acciones en Estados de Pago (Ingresos)</Label>
                        {ESTADOS_PAGO_INGRESOS_ACCION_GROUPS.map((g) => (
                          <label key={g.key} className="flex items-center gap-1.5 text-xs">
                            <Checkbox
                              checked={pa.estadosPagoIngresosAcciones[g.key] ?? false}
                              onCheckedChange={(v) =>
                                setProyectoAcceso(proy.id, { estadosPagoIngresosAcciones: { ...pa.estadosPagoIngresosAcciones, [g.key]: !!v } })
                              }
                            />
                            {g.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
                {CRM_MODULOS.map((m) => (
                  <div key={m} className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.crmModulos.includes(m)} onCheckedChange={(v) => toggleCrmModulo(m, !!v)} />
                      {m}
                    </label>
                    {form.crmModulos.includes(m) && CRM_ACCION_GROUPS[m] && (
                      <div className="ml-6 flex flex-col gap-1 rounded-md border p-2">
                        {CRM_ACCION_GROUPS[m].map((g) => {
                          const key = `${m}:${g.key}`
                          return (
                            <label key={g.key} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={form.crmAcciones[key] ?? false}
                                onCheckedChange={(v) =>
                                  setForm((f) => ({ ...f, crmAcciones: { ...f.crmAcciones, [key]: !!v } }))
                                }
                              />
                              {g.label}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
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

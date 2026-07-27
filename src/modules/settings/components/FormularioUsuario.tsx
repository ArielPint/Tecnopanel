import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { PAGE_MAP, FINANCIERO_EDIT_GROUPS, ROLES, defaultPagePerms, type PagePerms } from '../lib/pageMap'
import type { Usuario, UsuarioInput } from '../hooks/useUsuarios'

interface Props {
  usuario?: Usuario | null
  trigger: React.ReactNode
  onGuardar: (input: UsuarioInput) => Promise<void>
}

function permsFromUsuario(usuario?: Usuario | null): PagePerms {
  const pages = (usuario?.permissions?.pages as PagePerms) || null
  if (!pages) return defaultPagePerms()
  const merged = defaultPagePerms()
  for (const pid of Object.keys(merged)) {
    if (pages[pid]) merged[pid] = { access: !!pages[pid].access, tabs: pages[pid].tabs || [] }
  }
  return merged
}

function financieroEditFromUsuario(usuario?: Usuario | null): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const g of FINANCIERO_EDIT_GROUPS) result[g.key] = !!(usuario?.permissions?.[`permiso_financiero_${g.key}`])
  return result
}

export default function FormularioUsuario({ usuario, trigger, onGuardar }: Props) {
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')
  const [active, setActive] = useState(true)
  const [pages, setPages] = useState<PagePerms>(defaultPagePerms())
  const [financieroEdit, setFinancieroEdit] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    setName(usuario?.name ?? '')
    setUsername(usuario?.username ?? '')
    setEmail(usuario?.email ?? '')
    setPassword('')
    setRole(usuario?.role ?? 'viewer')
    setActive(usuario?.active ?? true)
    setPages(permsFromUsuario(usuario))
    setFinancieroEdit(financieroEditFromUsuario(usuario))
  }, [open, usuario])

  function toggleAcceso(pid: string, access: boolean) {
    setPages((p) => ({ ...p, [pid]: { access, tabs: access ? Object.keys(PAGE_MAP[pid as keyof typeof PAGE_MAP].tabs) : [] } }))
  }

  function toggleTab(pid: string, tab: string, checked: boolean) {
    setPages((p) => {
      const tabs = checked ? [...p[pid].tabs, tab] : p[pid].tabs.filter((t) => t !== tab)
      return { ...p, [pid]: { ...p[pid], tabs } }
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !username.trim()) {
      toast.error('Nombre y usuario son requeridos')
      return
    }
    if (!usuario && password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    const hasAnyAccess = Object.values(pages).some((p) => p.access && p.tabs.length > 0)
    if (!hasAnyAccess) {
      toast.error('El usuario debe tener acceso a al menos una página')
      return
    }
    setEnviando(true)
    try {
      await onGuardar({
        username: username.trim(),
        password: password || undefined,
        name: name.trim(),
        email: email.trim(),
        role,
        active,
        pages,
        financieroEdit,
      })
      toast.success(usuario ? 'Usuario actualizado' : 'Usuario creado')
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
          <DialogTitle>{usuario ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-name">Nombre completo</Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-username">Usuario (login)</Label>
              <Input id="u-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-email">Correo electrónico</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="u-pass">Contraseña {usuario && <span className="text-xs font-normal text-muted-foreground">(dejar vacío para no cambiar)</span>}</Label>
              <Input id="u-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
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
          </div>

          <div className="flex flex-col gap-2">
            <Label>Acceso por página y pestaña</Label>
            {Object.entries(PAGE_MAP).map(([pid, def]) => (
              <div key={pid} className="rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Checkbox checked={pages[pid]?.access ?? false} onCheckedChange={(v) => toggleAcceso(pid, !!v)} />
                  {def.label}
                </label>
                {pages[pid]?.access && (
                  <div className="mt-2 flex flex-wrap gap-3 pl-6">
                    {Object.entries(def.tabs).map(([tabId, tabLabel]) => (
                      <label key={tabId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={pages[pid].tabs.includes(tabId)}
                          onCheckedChange={(v) => toggleTab(pid, tabId, !!v)}
                        />
                        {tabLabel}
                      </label>
                    ))}
                  </div>
                )}
                {pid === 'financiero' && pages.financiero?.access && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t pt-2 pl-6">
                    {FINANCIERO_EDIT_GROUPS.map((g) => (
                      <label key={g.key} className="flex items-center gap-1.5 text-xs text-primary">
                        <Checkbox
                          checked={financieroEdit[g.key] ?? false}
                          onCheckedChange={(v) => setFinancieroEdit((f) => ({ ...f, [g.key]: !!v }))}
                        />
                        ✏️ {g.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} />
            Usuario activo
          </label>

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

import { useEffect, useState } from 'react'
import { Plus, Pencil, Check, X, UserCheck, UserX, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { syncPermisosCrm } from '@/lib/syncPermisos'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// Roles definidos en el sistema con sus etiquetas y colores
const ROL_META: Record<string, { label: string; badge: string; descripcion: string }> = {
  admin:           { label:'Admin',            badge:'bg-red-100 text-red-700',     descripcion:'Acceso total al sistema' },
  gerente_general: { label:'Gerente General',  badge:'bg-purple-100 text-purple-700', descripcion:'Supervisión general y reportes' },
  gerente_ventas:  { label:'Gerente Ventas',   badge:'bg-indigo-100 text-indigo-700', descripcion:'Gestión del equipo de ventas' },
  vendedor:        { label:'Vendedor',          badge:'bg-blue-100 text-blue-700',   descripcion:'Gestión de oportunidades y clientes' },
  jefe_ingenieria: { label:'Jefe Ingeniería',  badge:'bg-cyan-100 text-cyan-700',   descripcion:'Coordinación del equipo técnico' },
  ingeniero:       { label:'Ingeniero',         badge:'bg-teal-100 text-teal-700',   descripcion:'Tareas de ingeniería y cubicación' },
  cubicador:       { label:'Cubicador',         badge:'bg-green-100 text-green-700', descripcion:'Cubicación de proyectos' },
  presupuestista:  { label:'Presupuestista',    badge:'bg-lime-100 text-lime-700',   descripcion:'Elaboración de presupuestos' },
  finanzas:        { label:'Finanzas',          badge:'bg-amber-100 text-amber-700', descripcion:'Evaluación crediticia y finanzas' },
  desarrollador:   { label:'Desarrollador',      badge:'bg-fuchsia-100 text-fuchsia-700', descripcion:'Entrega de planos y fichas en etapa Desarrollo' },
}

const MODULOS = ['Dashboard','Oportunidades','Ingeniería','Ganadas y Perdidas','Desarrollo','Costos y Presupuestos','Negociación','Revisión Vendedor','Clientes','Usuarios']

// Permisos de página que trae un rol por defecto al crearlo (el admin luego puede ajustar por usuario)
const DEFAULT_MODULOS: Record<string, string[]> = {
  admin:           MODULOS,
  gerente_general: ['Dashboard','Oportunidades','Ingeniería','Ganadas y Perdidas','Desarrollo','Costos y Presupuestos','Negociación','Revisión Vendedor','Clientes'],
  gerente_ventas:  ['Dashboard','Oportunidades','Clientes','Revisión Vendedor'],
  vendedor:        ['Dashboard','Oportunidades','Clientes','Revisión Vendedor'],
  jefe_ingenieria: ['Dashboard','Ingeniería','Ganadas y Perdidas','Desarrollo'],
  ingeniero:       ['Dashboard','Ingeniería','Ganadas y Perdidas'],
  cubicador:       ['Dashboard','Costos y Presupuestos'],
  presupuestista:  ['Dashboard','Costos y Presupuestos','Negociación'],
  finanzas:        ['Dashboard','Negociación'],
  desarrollador:   ['Dashboard','Desarrollo'],
}

type Rol = keyof typeof ROL_META
interface Profile { id:string; nombre:string; apellido:string; email:string; rol:string; activo:boolean; modulos:string[]; created_at:string }
interface ModalCreate { nombre:string; apellido:string; email:string; password:string; rol:string; modulos:string[] }
interface ModalEdit { id:string; nombre:string; apellido:string; rol:string; modulos:string[]; nuevaPassword:string }

function ModulosCheckboxGrid({ value, onChange }: { value: string[]; onChange: (modulos: string[]) => void }) {
  function toggle(m: string) {
    onChange(value.includes(m) ? value.filter(x => x !== m) : [...value, m])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {MODULOS.map(m => {
        const on = value.includes(m)
        return (
          <button
            type="button"
            key={m}
            onClick={() => toggle(m)}
            className={'text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ' +
              (on ? 'bg-crm-red/10 border-crm-red text-crm-red' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100')}
          >
            {m}
          </button>
        )
      })}
    </div>
  )
}

export default function Usuarios() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showRoles, setShowRoles] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ModalEdit | null>(null)
  const [form, setForm] = useState<ModalCreate>({ nombre:'', apellido:'', email:'', password:'', rol:'vendedor', modulos: DEFAULT_MODULOS.vendedor })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>({})
  const [editingRol, setEditingRol] = useState<string | null>(null)
  const [rolLabelDraft, setRolLabelDraft] = useState('')

  function labelFor(rol: string) { return roleLabels[rol] ?? ROL_META[rol as Rol]?.label ?? rol }

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers((data as Profile[]) || [])
    setLoading(false)
  }

  async function loadRoleLabels() {
    const { data } = await supabase.from('role_labels').select('rol,label')
    if (data) setRoleLabels(Object.fromEntries(data.map(r => [r.rol, r.label])))
  }

  async function saveRolLabel(rol: string) {
    const label = rolLabelDraft.trim()
    if (label) {
      await supabase.from('role_labels').update({ label }).eq('rol', rol)
      setRoleLabels(prev => ({ ...prev, [rol]: label }))
    }
    setEditingRol(null)
  }

  useEffect(() => { load(); loadRoleLabels() }, [])

  async function handleCreate() {
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.refreshSession()
      if (!session) { await supabase.auth.signOut(); throw new Error('Tu sesión expiró, iniciá sesión de nuevo') }
      const res = await fetch(SUPABASE_URL + '/functions/v1/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al crear usuario')
      if (json.id) await syncPermisosCrm(json.id, form.modulos)
      setCreating(false); setForm({ nombre:'', apellido:'', email:'', password:'', rol:'vendedor', modulos: DEFAULT_MODULOS.vendedor }); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error desconocido') }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editing) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('profiles')
      .update({ nombre: editing.nombre, apellido: editing.apellido, rol: editing.rol, modulos: editing.modulos })
      .eq('id', editing.id)
    if (err) { setError(err.message); setSaving(false); return }
    await syncPermisosCrm(editing.id, editing.modulos)
    if (editing.nuevaPassword) {
      try {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (!session) { await supabase.auth.signOut(); throw new Error('Tu sesión expiró, iniciá sesión de nuevo') }
        const res = await fetch(SUPABASE_URL + '/functions/v1/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
          body: JSON.stringify({ user_id: editing.id, password: editing.nuevaPassword }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error al cambiar la contraseña')
      } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error desconocido'); setSaving(false); return }
    }
    setEditing(null); await load()
    setSaving(false)
  }

  async function toggleActivo(u: Profile) {
    await supabase.from('profiles').update({ activo: !u.activo }).eq('id', u.id); await load()
  }

  // Conteo de usuarios por rol
  const countPorRol = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.rol] = (acc[u.rol] || 0) + 1
    return acc
  }, {})

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-gray-800">Usuarios</h1><p className="text-xs text-gray-500">{users.length} usuarios registrados</p></div>
        <button onClick={() => { setCreating(true); setError(null) }} className="flex items-center gap-2 px-3 py-2 bg-crm-red text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex-shrink-0"><Plus size={16}/><span className="hidden sm:inline">Nuevo usuario</span><span className="sm:hidden">Nuevo</span></button>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Usuarios — tabla en desktop, cards en móvil */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Páginas con acceso</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => {
                  const meta = ROL_META[u.rol as Rol]
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{u.nombre} {u.apellido}</td>
                      <td className="px-4 py-3 text-gray-500">{u.email}</td>
                      <td className="px-4 py-3"><span className={'text-xs px-2 py-1 rounded-full font-medium ' + (meta?.badge ?? 'bg-gray-100 text-gray-600')}>{labelFor(u.rol)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(u.modulos ?? []).length
                            ? u.modulos.map(m => <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{m}</span>)
                            : <span className="text-xs text-gray-400">Sin acceso</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{u.activo ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><UserCheck size={13}/>Activo</span> : <span className="flex items-center gap-1 text-gray-400 text-xs font-medium"><UserX size={13}/>Inactivo</span>}</td>
                      <td className="px-4 py-3"><div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditing({ id:u.id, nombre:u.nombre, apellido:u.apellido, rol:u.rol, modulos: u.modulos ?? [], nuevaPassword:'' }); setError(null) }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Editar"><Pencil size={14}/></button>
                        <button onClick={() => toggleActivo(u)} className={'p-1.5 rounded ' + (u.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600')} title={u.activo ? 'Desactivar' : 'Activar'}>{u.activo ? <UserX size={14}/> : <UserCheck size={14}/>}</button>
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {users.map(u => {
              const meta = ROL_META[u.rol as Rol]
              return (
                <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-crm-red flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.nombre[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{u.nombre} {u.apellido}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={'text-[11px] px-2 py-0.5 rounded-full font-medium ' + (meta?.badge ?? 'bg-gray-100 text-gray-600')}>{labelFor(u.rol)}</span>
                      {u.activo
                        ? <span className="flex items-center gap-0.5 text-green-600 text-[11px]"><UserCheck size={11}/>Activo</span>
                        : <span className="flex items-center gap-0.5 text-gray-400 text-[11px]"><UserX size={11}/>Inactivo</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditing({ id:u.id, nombre:u.nombre, apellido:u.apellido, rol:u.rol, modulos: u.modulos ?? [], nuevaPassword:'' }); setError(null) }} className="p-2 rounded hover:bg-gray-100 text-gray-500"><Pencil size={14}/></button>
                    <button onClick={() => toggleActivo(u)} className={'p-2 rounded ' + (u.activo ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600')}>{u.activo ? <UserX size={14}/> : <UserCheck size={14}/>}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabla de Roles del sistema */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <button onClick={() => setShowRoles(p => !p)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-gray-400"/>
              <span className="text-sm font-semibold text-gray-700">Roles del sistema</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{Object.keys(ROL_META).length} roles</span>
            </div>
            {showRoles ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
          </button>
          {showRoles && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">El rol es solo una etiqueta descriptiva. El acceso real a cada página se define por usuario en el botón Editar.</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Usuarios</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Object.entries(ROL_META).map(([rol, meta]) => {
                    const count = countPorRol[rol] || 0
                    return (
                      <tr key={rol} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          {editingRol === rol ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={rolLabelDraft}
                                onChange={e => setRolLabelDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveRolLabel(rol); if (e.key === 'Escape') setEditingRol(null) }}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-36 focus:outline-none focus:ring-2 focus:ring-crm-red"
                              />
                              <button onClick={() => saveRolLabel(rol)} className="p-1 rounded hover:bg-green-50 text-green-600"><Check size={14}/></button>
                              <button onClick={() => setEditingRol(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={14}/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group">
                              <span className={'text-xs px-2 py-1 rounded-full font-medium ' + meta.badge}>{labelFor(rol)}</span>
                              <button onClick={() => { setEditingRol(rol); setRolLabelDraft(labelFor(rol)) }} className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100"><Pencil size={12}/></button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{meta.descripcion}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-sm font-bold text-gray-700">{count}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal crear usuario */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-800">Nuevo usuario</h2></div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Apellido</label><input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Contraseña temporal</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, modulos: DEFAULT_MODULOS[e.target.value] ?? [] }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red">
                  {Object.keys(ROL_META).map(r => <option key={r} value={r}>{labelFor(r)}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Aplica el acceso por defecto del rol; podés ajustarlo abajo.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Páginas con acceso</label>
                <ModulosCheckboxGrid value={form.modulos} onChange={modulos => setForm(f => ({ ...f, modulos }))} />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !form.nombre || !form.email || !form.password} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Creando...' : 'Crear usuario'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar usuario */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-800">Editar usuario</h2></div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label><input value={editing.nombre} onChange={e => setEditing(ed => ed ? { ...ed, nombre: e.target.value } : null)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Apellido</label><input value={editing.apellido} onChange={e => setEditing(ed => ed ? { ...ed, apellido: e.target.value } : null)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
                <select value={editing.rol} onChange={e => setEditing(ed => ed ? { ...ed, rol: e.target.value } : null)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red">
                  {Object.keys(ROL_META).map(r => <option key={r} value={r}>{labelFor(r)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Páginas con acceso</label>
                <ModulosCheckboxGrid value={editing.modulos} onChange={modulos => setEditing(ed => ed ? { ...ed, modulos } : null)} />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">Restablecer contraseña</label>
                <input type="password" value={editing.nuevaPassword} onChange={e => setEditing(ed => ed ? { ...ed, nuevaPassword: e.target.value } : null)} placeholder="Dejar vacío para no cambiarla" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleEdit} disabled={saving} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

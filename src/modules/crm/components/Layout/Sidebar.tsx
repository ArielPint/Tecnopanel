import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Target, Compass, Hammer, Ruler, Landmark, Users, Building2, LogOut, ChevronRight, X, ClipboardCheck, KeyRound, Trophy, Home } from 'lucide-react'
import { useAuth } from '@/modules/crm/contexts/AuthContext'
import { usePermisos } from '@/modules/crm/contexts/PermisosContext'
import { supabase } from '@/lib/supabaseClient'
import { TecnopanelMark, TecnopanelWordmark } from '@/components/TecnopanelLogo'

// Nota: se mantiene la ruta '/crm/cubicacion' para el modulo renombrado a "Costos y Presupuestos"
// (antes "Cubicación") para no romper enlaces/bookmarks existentes; solo cambia el label visible.
const MODULO_RUTA: Record<string, string> = {
  Dashboard: '/crm/dashboard',
  Oportunidades: '/crm/oportunidades',
  'Ingeniería': '/crm/ingenieria',
  'Ganadas y Perdidas': '/crm/ganadas-perdidas',
  'Desarrollo': '/crm/desarrollo',
  'Costos y Presupuestos': '/crm/cubicacion',
  'Negociación': '/crm/negociacion',
  'Revisión Vendedor': '/crm/revision-vendedor',
  Clientes: '/crm/clientes',
  Usuarios: '/crm/usuarios',
}

const MODULO_ICON: Record<string, React.ReactNode> = {
  Dashboard:    <LayoutDashboard size={16} />,
  Oportunidades:<Target size={16} />,
  'Ingeniería': <Compass size={16} />,
  'Ganadas y Perdidas': <Trophy size={16} />,
  'Desarrollo': <Hammer size={16} />,
  'Costos y Presupuestos': <Ruler size={16} />,
  'Negociación': <Landmark size={16} />,
  'Revisión Vendedor': <ClipboardCheck size={16} />,
  Clientes:     <Building2 size={16} />,
  Usuarios:     <Users size={16} />,
}

const GRUPOS = [
  { label: 'Principal', modulos: ['Dashboard', 'Ganadas y Perdidas', 'Oportunidades'] },
  { label: 'Módulos',   modulos: ['Ingeniería', 'Desarrollo', 'Costos y Presupuestos', 'Revisión Vendedor', 'Negociación'] },
  { label: 'Sistema',   modulos: ['Clientes', 'Usuarios'] },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const { canAccess, loading } = usePermisos()
  const rol = profile?.rol ?? ''
  const [changingPass, setChangingPass] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [passSaving, setPassSaving] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)
  const [passOk, setPassOk] = useState(false)

  async function handleChangePassword() {
    if (newPass.length < 6) { setPassError('Mínimo 6 caracteres'); return }
    setPassSaving(true); setPassError(null)
    const { data: { session } } = await supabase.auth.refreshSession()
    if (!session) { await supabase.auth.signOut(); setPassSaving(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) setPassError(error.message)
    else { setPassOk(true); setNewPass(''); setTimeout(() => { setChangingPass(false); setPassOk(false) }, 1200) }
    setPassSaving(false)
  }

  const inner = (
    <aside className="w-64 flex-shrink-0 bg-[#1a1a1b] flex flex-col h-full">
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2.5 justify-between">
        <div className="flex items-center gap-2.5">
          <TecnopanelMark size={28} className="shrink-0" />
          <TecnopanelWordmark variant="dark" className="text-base" />
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-3 p-1.5 rounded text-white/40 hover:text-white hover:bg-white/10 md:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {GRUPOS.map(grupo => {
          const visibles = grupo.modulos.filter(m => canAccess(m))
          if (!visibles.length) return null
          return (
            <div key={grupo.label}>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-2 mb-1.5">
                {grupo.label}
              </p>
              <div className="space-y-0.5">
                {visibles.map(m => (
                  <NavLink
                    key={m}
                    to={MODULO_RUTA[m]}
                    onClick={onClose}
                    className={({ isActive }) =>
                      'group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ' +
                      (isActive
                        ? 'bg-crm-red text-white'
                        : 'text-white/60 hover:bg-white/10 hover:text-white')
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      {MODULO_ICON[m]}
                      {m}
                    </span>
                    <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                  </NavLink>
                ))}
                {grupo.label === 'Sistema' && rol === 'admin' && (
                  <NavLink
                    to="/"
                    className="group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <span className="flex items-center gap-2.5">
                      <Home size={16} />
                      TecnoPanel Portal
                    </span>
                    <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                  </NavLink>
                )}
              </div>
            </div>
          )
        })}
        {loading && <div className="px-3 py-2 text-xs text-white/30">Cargando...</div>}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-crm-red flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {profile?.nombre?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{profile?.nombre} {profile?.apellido}</p>
            <p className="text-[10px] text-white/40">{rol}</p>
          </div>
        </div>
        <button
          onClick={() => { setChangingPass(true); setPassError(null); setPassOk(false); setNewPass('') }}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors w-full mb-2"
        >
          <KeyRound size={13} /> Cambiar contraseña
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors w-full"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>

      {changingPass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-800">Cambiar contraseña</h2></div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nueva contraseña</label>
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/>
              </div>
              {passError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{passError}</p>}
              {passOk && <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">Contraseña actualizada ✓</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setChangingPass(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleChangePassword} disabled={passSaving || !newPass} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{passSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        {inner}
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <div className="relative flex h-full">
            {inner}
          </div>
        </div>
      )}
    </>
  )
}

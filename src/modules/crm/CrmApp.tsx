import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PermisosProvider, usePermisos } from './contexts/PermisosContext'
import { GlobalModalsProvider } from './contexts/GlobalModalsContext'
import { AppLayout } from './components/Layout/AppLayout'
import { supabase } from '@/lib/supabaseClient'
import Dashboard from './pages/Dashboard'
import Oportunidades from './pages/Oportunidades'
import Clientes from './pages/Clientes'
import Ingenieria from './pages/Ingenieria'
import GanadasPerdidas from './pages/GanadasPerdidas'
import Desarrollo from './pages/Desarrollo'
import Cubicacion from './pages/Cubicacion'
import Negociacion from './pages/Negociacion'
import RevisionVendedor from './pages/RevisionVendedor'

function ProtectedModule({ modulo, children }: { modulo: string; children: React.ReactNode }) {
  const { profile } = useAuth()
  const { canAccess, loading } = usePermisos()
  if (loading) return null
  if (!profile || !canAccess(modulo)) return <Navigate to="/crm/dashboard" replace />
  return <>{children}</>
}

function ForcePasswordChange({ userId }: { userId: string }) {
  const [newPass, setNewPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (newPass.length < 6) { setError('Mínimo 6 caracteres'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: newPass })
    if (err) { setError(err.message); setSaving(false); return }
    const { error: profileErr } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', userId)
    if (profileErr) { setError(profileErr.message); setSaving(false); return }
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-800">Cambia tu contraseña</h2><p className="text-xs text-gray-500 mt-1">Es tu primer ingreso, debes establecer una contraseña nueva.</p></div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nueva contraseña</label>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={handleSubmit} disabled={saving || !newPass} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar y continuar'}</button>
        </div>
      </div>
    </div>
  )
}

function CrmRoutes() {
  const { profile, loading } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (profile?.must_change_password) return <ForcePasswordChange userId={profile.id} />
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="oportunidades" element={<ProtectedModule modulo="Oportunidades"><Oportunidades /></ProtectedModule>} />
        <Route path="ingenieria" element={<ProtectedModule modulo="Ingeniería"><Ingenieria /></ProtectedModule>} />
        <Route path="ganadas-perdidas" element={<ProtectedModule modulo="Ganadas y Perdidas"><GanadasPerdidas /></ProtectedModule>} />
        <Route path="desarrollo" element={<ProtectedModule modulo="Desarrollo"><Desarrollo /></ProtectedModule>} />
        <Route path="cubicacion" element={<ProtectedModule modulo="Costos y Presupuestos"><Cubicacion /></ProtectedModule>} />
        <Route path="negociacion" element={<ProtectedModule modulo="Negociación"><Negociacion /></ProtectedModule>} />
        <Route path="revision-vendedor" element={<ProtectedModule modulo="Revisión Vendedor"><RevisionVendedor /></ProtectedModule>} />
        <Route path="clientes" element={<ProtectedModule modulo="Clientes"><Clientes /></ProtectedModule>} />
        <Route path="usuarios" element={<Navigate to="/usuarios" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  )
}

export default function CrmApp() {
  return (
    <AuthProvider>
      <PermisosProvider>
        <GlobalModalsProvider>
          <CrmRoutes />
        </GlobalModalsProvider>
      </PermisosProvider>
    </AuthProvider>
  )
}

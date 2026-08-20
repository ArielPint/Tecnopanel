import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'

// Alias de login para la cuenta root — mismo criterio que usuarios/LoginPage.tsx.
const USERNAME_ALIASES: Record<string, string> = {
  admin: 'ariel.pinto.a@gmail.com',
  root: 'ariel.pinto.a@gmail.com',
}

function resolveEmail(input: string): string {
  const v = input.trim()
  return v.includes('@') ? v : (USERNAME_ALIASES[v.toLowerCase()] ?? v)
}

export default function Login() {
  const { session } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) {
    return <Navigate to="/crm" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: resolveEmail(email), password })
    if (error) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at center, #3a0a08 0%, #1a0404 60%, #0d0101 100%)' }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <svg width="80" height="48" viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="20" width="12" height="52" fill="#ed3224" />
            <rect x="16" y="8" width="12" height="64" fill="#ed3224" />
            <rect x="32" y="0" width="12" height="72" fill="#ed3224" />
            <text x="50" y="32" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="#424243">TECNO</text>
            <text x="50" y="52" fontFamily="Arial" fontWeight="bold" fontSize="18" fill="#ed3224">PANEL</text>
          </svg>
        </div>

        <h1 className="mb-6 text-center text-xl font-bold text-gray-800">CRM Comercial</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo electrónico</label>
            <input
              type="text"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@tecnopanel.cl"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-crm-red py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

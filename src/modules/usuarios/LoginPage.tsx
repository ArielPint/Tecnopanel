import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/authStore'
import logo from '../../assets/tecnopanel-logo-color.png'

// Alias de login para la cuenta root — permite entrar como "admin"/"root" en vez
// del email real de esa cuenta.
const USERNAME_ALIASES: Record<string, string> = {
  admin: 'ariel.pinto.a@gmail.com',
  root: 'ariel.pinto.a@gmail.com',
}

function resolveEmail(input: string): string {
  const v = input.trim()
  return v.includes('@') ? v : (USERNAME_ALIASES[v.toLowerCase()] ?? v)
}

export default function LoginPage() {
  const { session } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: resolveEmail(email), password })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Ingresa tu email arriba para poder enviarte la clave de recuperación.')
      return
    }
    setError(null)
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resolveEmail(email), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
      <div className="w-full max-w-sm bg-white shadow-sm rounded-lg border p-8 dark:bg-neutral-800 dark:border-white/10">
        <img src={logo} alt="Tecnopanel" className="h-12 w-auto mb-6" />
        <p className="text-sm text-gray-500 dark:text-white/50 mb-6">Ingresa con tu cuenta @tecnopanel.cl</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">Email</label>
            <input
              type="text"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light dark:bg-neutral-900 dark:border-white/10 dark:text-white"
              placeholder="nombre@tecnopanel.cl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light dark:bg-neutral-900 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {resetSent && (
            <p className="text-sm text-green-700 dark:text-green-400">
              Te enviamos un correo con instrucciones para restablecer tu contraseña.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-tecnopanel py-2 text-sm font-medium text-white hover:bg-tecnopanel-light disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className="w-full text-center text-sm text-tecnopanel hover:underline disabled:opacity-60 dark:text-tecnopanel-light"
          >
            {resetLoading ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
          </button>
        </form>
      </div>
    </div>
  )
}

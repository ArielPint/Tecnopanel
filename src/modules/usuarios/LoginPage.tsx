import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/authStore'
import logo from '../../assets/tecnopanel-logo-color.png'

export default function LoginPage() {
  const { session } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
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
              type="email"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-tecnopanel py-2 text-sm font-medium text-white hover:bg-tecnopanel-light disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

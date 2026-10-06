import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Factory } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { TecnopanelMark } from '@/components/TecnopanelLogo'
import { RUTA } from '../lib/rutas'

// Login propio del portal, como /crm/login: misma cuenta y contraseña del hub. Al entrar, va al
// portal; si la cuenta no tiene Producción SIP, ProtectedRoute la manda al hub.

// Alias de login para la cuenta root — mismo criterio que usuarios/LoginPage.tsx y crm/pages/Login.tsx.
const USERNAME_ALIASES: Record<string, string> = {
  admin: 'ariel.pinto.a@gmail.com',
  root: 'ariel.pinto.a@gmail.com',
}

function resolveEmail(input: string): string {
  const v = input.trim()
  return v.includes('@') ? v : (USERNAME_ALIASES[v.toLowerCase()] ?? v)
}

const inputClase =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export default function Login() {
  const { session } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to={RUTA.inicio} replace />

  async function onSubmit(e: FormEvent) {
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
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at center, #1f2a3a 0%, #121a26 60%, #070b11 100%)' }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-card-foreground shadow-2xl">
        <div className="mb-5 flex items-center justify-center gap-3">
          <TecnopanelMark size={40} />
          <Factory className="h-9 w-9 text-sky-500" />
        </div>
        <h1 className="text-center text-xl font-bold">Producción Paneles SIP</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Registro de producción y consumo · Tecnopanel</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="s-email" className="mb-1 block text-sm font-medium">Correo electrónico</label>
            <input
              id="s-email"
              type="text"
              autoCapitalize="none"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@tecnopanel.cl"
              required
              className={inputClase}
            />
          </div>
          <div>
            <label htmlFor="s-pass" className="mb-1 block text-sm font-medium">Contraseña</label>
            <input
              id="s-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={inputClase}
            />
          </div>
          {error && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

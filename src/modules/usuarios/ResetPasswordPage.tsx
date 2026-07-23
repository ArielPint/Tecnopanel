import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import logo from '../../assets/tecnopanel-logo-color.png'

// Página que recibe el link del correo de "restablecer contraseña" (Supabase Auth).
// Al hacer click en el link, Supabase entrega una sesión temporal de tipo "recovery"
// (evento PASSWORD_RECOVERY) — acá solo dejamos que la persona defina su nueva clave.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    // Por si el evento ya se disparó antes de montar este componente.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  if (!ready && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
        <p className="text-sm text-gray-500 dark:text-white/50">
          Abre esta página directamente desde el link del correo de restablecimiento de clave.
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
        <p className="text-sm text-green-700 dark:text-green-400">Contraseña actualizada. Redirigiendo…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900">
      <div className="w-full max-w-sm bg-white shadow-sm rounded-lg border p-8 dark:bg-neutral-800 dark:border-white/10">
        <img src={logo} alt="Tecnopanel" className="h-10 w-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Elige tu nueva contraseña</h1>
        <p className="text-sm text-gray-500 dark:text-white/50 mb-6">Tecnopanel Hub</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">Nueva contraseña</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light dark:bg-neutral-900 dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light dark:bg-neutral-900 dark:border-white/10 dark:text-white"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-tecnopanel py-2 text-sm font-medium text-white hover:bg-tecnopanel-light disabled:opacity-60"
          >
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

// "¿Olvidaste tu contraseña?" de los logins de cada portal (/produccion/login, /crm/login, …).
// Usa el correo escrito en el formulario y manda el enlace de recuperación; al guardar la clave
// nueva, /reset-password devuelve a la persona al portal desde donde lo pidió.
export default function OlvideContrasena({
  email,
  resolveEmail,
  className = 'text-primary',
}: {
  email: string
  resolveEmail: (input: string) => string
  className?: string
}) {
  const { pathname } = useLocation()
  const [estado, setEstado] = useState<'inicial' | 'enviando' | 'enviado'>('inicial')
  const [error, setError] = useState('')

  async function enviar() {
    if (!email.trim()) {
      setError('Escribe tu correo arriba para enviarte el enlace de recuperación.')
      return
    }
    setError('')
    setEstado('enviando')
    const volver = pathname.replace(/\/login\/?$/, '') || '/'
    const { error } = await supabase.auth.resetPasswordForEmail(resolveEmail(email), {
      redirectTo: `${window.location.origin}/reset-password?volver=${encodeURIComponent(volver)}`,
    })
    if (error) {
      setError('No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.')
      setEstado('inicial')
      return
    }
    setEstado('enviado')
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
      {estado === 'enviado' && (
        <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700">
          Si el correo está registrado, te llegará un enlace para restablecer tu contraseña.
        </p>
      )}
      <button
        type="button"
        onClick={enviar}
        disabled={estado === 'enviando'}
        className={`w-full text-center text-sm hover:underline disabled:opacity-60 ${className}`}
      >
        {estado === 'enviando' ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
      </button>
    </div>
  )
}

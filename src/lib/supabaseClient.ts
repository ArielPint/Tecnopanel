import { createClient, type Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisa el archivo .env (ver .env.example).',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Logout diario por seguridad: una sesión vale solo el día (hora local) en que se inició.
// No sirve mirar el evento: supabase-js emite SIGNED_IN también al abrir la página y al volver
// a la pestaña, así que una sesión de ayer pasaba por login nuevo y no se cerraba.
const fechaLocal = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Hora del login real. Sale del claim `amr` del access token: GoTrue lo fija al autenticarse y no
 *  lo toca al renovar el token. user.last_sign_in_at queda solo de respaldo, porque el GoTrue
 *  del servidor propio lo actualiza en cada renovación y una sesión de ayer parecería de hoy. */
function horaDeLogin(session: Session): Date | null {
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const ts = Math.max(...((payload.amr ?? []) as { timestamp: number }[]).map((a) => a.timestamp))
    if (Number.isFinite(ts)) return new Date(ts * 1000)
  } catch {
    // token ilegible: se usa el respaldo
  }
  return session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at) : null
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) return
  const login = horaDeLogin(session)
  if (!login || fechaLocal(login) === fechaLocal(new Date())) return
  // scope 'local': cierra solo este navegador. El default (global) revocaba también la sesión
  // que el usuario ya había abierto hoy en otro equipo.
  // Fuera del callback: supabase-js se cuelga si se espera una operación de auth dentro de él.
  setTimeout(() => void supabase.auth.signOut({ scope: 'local' }), 0)
})

// Query resultó falló silenciosamente en ~15+ call sites (solo se destructuraba `data`).
// Tira en error para que llegue al error state de useCachedQuery / catch del caller.
export async function unwrap<Q extends PromiseLike<{ data: unknown; error: { message: string } | null }>>(
  query: Q,
): Promise<Awaited<Q>['data']> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

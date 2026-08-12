import { createClient } from '@supabase/supabase-js'

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

// Logout diario por seguridad: sesión persistida se invalida si cambió el día local
// desde la última validación.
const LAST_SESSION_DATE_KEY = 'tp_last_session_date'
const todayStr = () => new Date().toISOString().slice(0, 10)

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) return
  const today = todayStr()
  const lastDate = localStorage.getItem(LAST_SESSION_DATE_KEY)
  if (lastDate && lastDate !== today) {
    localStorage.removeItem(LAST_SESSION_DATE_KEY)
    void supabase.auth.signOut()
    return
  }
  localStorage.setItem(LAST_SESSION_DATE_KEY, today)
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

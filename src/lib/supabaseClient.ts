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

// Query resultó falló silenciosamente en ~15+ call sites (solo se destructuraba `data`).
// Tira en error para que llegue al error state de useCachedQuery / catch del caller.
export async function unwrap<Q extends PromiseLike<{ data: unknown; error: { message: string } | null }>>(
  query: Q,
): Promise<Awaited<Q>['data']> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

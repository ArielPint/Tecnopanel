import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** profiles.must_change_password — ProtectedRoute bloquea todo el hub hasta que se cambie. */
  mustChangePassword: boolean
  init: () => void
  signOut: () => Promise<void>
  clearMustChangePassword: () => void
}

async function fetchMustChange(userId: string | undefined) {
  if (!userId) return false
  const { data } = await supabase.from('profiles').select('must_change_password').eq('id', userId).maybeSingle()
  return data?.must_change_password === true
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  mustChangePassword: false,
  init: () => {
    // Cada apply espera una query; si otro evento (ej. SIGNED_OUT justo tras SIGNED_IN) llega
    // mientras tanto, el apply viejo no debe pisar al nuevo — dejaba el store "logueado" con el
    // cliente ya deslogueado, todas las queries salían como anon y el hub mostraba "Sin acceso".
    let seq = 0
    const apply = async (session: Session | null) => {
      const mine = ++seq
      const mustChangePassword = await fetchMustChange(session?.user.id)
      if (mine !== seq) return
      set({ session, user: session?.user ?? null, loading: false, mustChangePassword })
    }
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => set({ loading: false }))
    // Último usuario pedido (no el del store, que se actualiza tarde tras el await): con
    // get().user un SIGNED_OUT pegado a un SIGNED_IN se descartaba por "mismo usuario" (ambos undefined).
    let lastUserId: string | undefined | null = null // null = ningún evento aún
    supabase.auth.onAuthStateChange((_event, session) => {
      const prev = lastUserId === null ? get().user?.id : lastUserId
      lastUserId = session?.user.id
      if (session?.user.id === prev) return
      // ponytail: fuera del callback — supabase-js se cuelga si se hace await de queries dentro de onAuthStateChange
      setTimeout(() => apply(session), 0)
    })
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ session: null, user: null, mustChangePassword: false })
  },
  clearMustChangePassword: () => set({ mustChangePassword: false }),
}))

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
    const apply = async (session: Session | null) => {
      const mustChangePassword = await fetchMustChange(session?.user.id)
      set({ session, user: session?.user ?? null, loading: false, mustChangePassword })
    }
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => set({ loading: false }))
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === get().user?.id) return
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

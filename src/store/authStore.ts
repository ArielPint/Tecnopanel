import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  init: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  init: () => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        set({ session: data.session, user: data.session?.user ?? null, loading: false })
      })
      .catch(() => set({ loading: false }))
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === get().user?.id) return
      set({ session, user: session?.user ?? null, loading: false })
    })
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ session: null, user: null })
  },
}))

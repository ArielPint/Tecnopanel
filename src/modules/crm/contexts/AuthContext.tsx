import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/modules/crm/types/database'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

interface AuthContextType {
  session:  Session | null
  user:     User | null
  profile:  Profile | null
  loading:  boolean
  signIn:   (email: string, password: string) => Promise<{ error: Error | null }>
  signOut:  () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        if (session?.user) loadProfile(session.user.id)
        else setLoading(false)
      })
      .catch((err) => {
        console.error('AuthContext: fallo al obtener sesión', err)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (handleSupabaseError(error, 'AuthContext.loadProfile')) {
      setProfile(null)
      setLoading(false)
      return
    }
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    handleSupabaseError(error, 'AuthContext.signOut')
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null,
      profile, loading, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'

interface Perfil {
  id: string
  username: string
  name: string
  role: string
  active: boolean
  permissions: Record<string, unknown>
}

export type LogisticaTab = 'despacho-gd' | 'registro-gd' | 'stock-ingreso' | 'pedidos'

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  puedeVer: (tab: LogisticaTab) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  useEffect(() => {
    let cancelado = false

    async function cargarPerfil() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (!cancelado) {
          setPerfil(null)
          setLoading(false)
        }
        return
      }
      const { data } = await supabase
        .from('user_profiles')
        .select('id, username, name, role, active, permissions')
        .eq('id', userId)
        .single()
      if (!cancelado) {
        setPerfil((data as Perfil) ?? null)
        setLoading(false)
      }
    }

    cargarPerfil()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoading(true)
      cargarPerfil()
    })
    return () => {
      cancelado = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const acceso = usePermisosProyecto('la-chacra')
  const isAdmin = acceso.isAdmin

  // ponytail: puedeVer ya no distingue por tab — nadie tiene hoy un subconjunto
  // parcial de tabs (todo-o-nada por módulo), y permisos(modulo_key,accion) no
  // modela tabs. El parámetro se mantiene para no tocar los call sites.
  const puedeVer = (_tab: LogisticaTab): boolean => acceso.tieneAccion('logistica')

  return (
    <AuthContext.Provider
      value={{
        perfil,
        loading: loading || acceso.loading,
        isAuthenticated: !!perfil,
        isAdmin,
        puedeVer,
        signOut: async () => {
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

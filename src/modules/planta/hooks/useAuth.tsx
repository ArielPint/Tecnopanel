import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Perfil {
  id: string
  username: string
  name: string
  role: string
  active: boolean
  permissions: Record<string, unknown>
}

// Los 10 tabs del dashboard.html original — hoy solo 'resumen' tiene página implementada,
// el resto queda reservado para las fases 3c-1-modulos/3c-2/3c-3/3c-4.
export type DashboardTab =
  | 'resumen'
  | 'curva'
  | 'modulos'
  | 'compras'
  | 'productos'
  | 'stock'
  | 'despachos'
  | 'proyeccion'
  | 'prod-diaria'
  | 'ejecutivo'

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  puedeVer: (tab: DashboardTab) => boolean
  puedeSubirExcel: boolean
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

  const isAdmin = perfil?.role === 'admin'

  const puedeVer = (tab: DashboardTab): boolean => {
    if (isAdmin) return true
    const pages = perfil?.permissions?.pages as Record<string, { access?: boolean; tabs?: string[] }> | undefined
    const dashboard = pages?.dashboard
    return dashboard?.access === true && Array.isArray(dashboard.tabs) && dashboard.tabs.includes(tab)
  }

  return (
    <AuthContext.Provider
      value={{
        perfil,
        loading,
        isAuthenticated: !!perfil,
        isAdmin,
        puedeVer,
        // Misma condición usada en la policy de storage dashboard_docs_insert/update
        puedeSubirExcel: isAdmin || puedeVer('resumen'),
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

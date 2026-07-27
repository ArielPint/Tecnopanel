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

export type FinancieroTab =
  | 'dashboard'
  | 'ordenes-compra'
  | 'facturas'
  | 'presupuestos'
  | 'forecast'
  | 'remuneraciones'
  | 'ingresos'
  | 'gastos-directos'
  | 'auditoria'

export type FinancieroSeccionEditable = 'oc' | 'presupuestos' | 'remuneraciones' | 'ingresos' | 'gastos-directos'

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  canEditOC: boolean
  puedeVer: (tab: FinancieroTab) => boolean
  puedeEditar: (seccion: FinancieroSeccionEditable) => boolean
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

  const puedeVer = (tab: FinancieroTab): boolean => {
    if (isAdmin) return true
    const pages = perfil?.permissions?.pages as Record<string, { access?: boolean; tabs?: string[] }> | undefined
    const financiero = pages?.financiero
    return financiero?.access === true && Array.isArray(financiero.tabs) && financiero.tabs.includes(tab)
  }

  const puedeEditar = (seccion: FinancieroSeccionEditable): boolean => {
    if (isAdmin) return true
    return perfil?.permissions?.[`permiso_financiero_${seccion}`] === true
  }

  const canEditOC = puedeEditar('oc')

  return (
    <AuthContext.Provider
      value={{
        perfil,
        loading,
        isAuthenticated: !!perfil,
        isAdmin,
        canEditOC,
        puedeVer,
        puedeEditar,
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

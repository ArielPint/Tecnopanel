import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
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

export type LogisticaTab = 'despacho-gd' | 'registro-gd' | 'stock-ingreso'

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  puedeVer: (tab: LogisticaTab) => boolean
  puedeEditar: boolean
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, nombre, apellido, activo, permissions')
        .eq('id', userId)
        .single()
      if (error) console.error('useAuth: fallo al cargar perfil', error)
      if (!cancelado) {
        setPerfil(
          data
            ? {
                id: data.id,
                username: data.username ?? '',
                name: [data.nombre, data.apellido].filter(Boolean).join(' '),
                role: '',
                active: data.activo,
                permissions: data.permissions,
              }
            : null,
        )
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

  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug!)
  const isAdmin = acceso.isAdmin

  const puedeVer = (tab: LogisticaTab): boolean => acceso.tieneAccion('logistica') && acceso.tieneAccion(`logistica:${tab}`)
  const puedeEditar = acceso.tieneAccion('logistica', 'editar')
  const perfilConRol = perfil ? { ...perfil, role: acceso.rolNegocio ?? '' } : null

  return (
    <AuthContext.Provider
      value={{
        perfil: perfilConRol,
        loading: loading || acceso.loading,
        isAuthenticated: !!perfil,
        isAdmin,
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

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
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

  const userIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelado = false

    async function cargarPerfil() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user.id
        userIdRef.current = userId
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
        if (error) throw error
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
        }
      } catch (err) {
        console.error('useAuth: error cargando perfil', err)
        if (!cancelado) setPerfil(null)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    cargarPerfil()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user.id
      if (newUserId === userIdRef.current) return
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

  const puedeVer = (tab: DashboardTab): boolean => acceso.tieneAccion('dashboard') && acceso.tieneAccion(`dashboard:${tab}`)
  const perfilConRol = perfil ? { ...perfil, role: acceso.rolNegocio ?? '' } : null

  return (
    <AuthContext.Provider
      value={{
        perfil: perfilConRol,
        loading: loading || acceso.loading,
        isAuthenticated: !!perfil,
        isAdmin,
        puedeVer,
        puedeSubirExcel: isAdmin,
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

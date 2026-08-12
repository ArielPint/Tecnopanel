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

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAdmin: boolean
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
      const { data } = await supabase
        .from('profiles')
        .select('id, username, nombre, apellido, activo, permissions')
        .eq('id', userId)
        .single()
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
  const perfilConRol = perfil ? { ...perfil, role: acceso.rolNegocio ?? '' } : null

  return (
    <AuthContext.Provider
      value={{
        perfil: perfilConRol,
        loading: loading || acceso.loading,
        isAdmin: acceso.isAdmin,
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

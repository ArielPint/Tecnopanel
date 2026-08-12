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
  authError: string | null
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
  const [authError, setAuthError] = useState<string | null>(null)

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
          setAuthError(null)
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
        console.error('Error al cargar perfil:', err)
        if (!cancelado) {
          setAuthError(err instanceof Error ? err.message : 'Error al cargar perfil')
          setPerfil(null)
        }
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

  // ponytail: puedeVer ya no distingue por tab (ver nota en logistica/hooks/useAuth.tsx).
  const puedeVer = (_tab: FinancieroTab): boolean => acceso.tieneAccion('financiero')

  // Cada sección editable es su propio modulo_key ("financiero:<seccion>") para no
  // perder la granularidad que ya existía en permiso_financiero_<seccion>.
  const puedeEditar = (seccion: FinancieroSeccionEditable): boolean =>
    acceso.tieneAccion(`financiero:${seccion}`, 'editar')

  const canEditOC = puedeEditar('oc')
  const perfilConRol = perfil ? { ...perfil, role: acceso.rolNegocio ?? '' } : null

  return (
    <AuthContext.Provider
      value={{
        perfil: perfilConRol,
        loading: loading || acceso.loading,
        authError,
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

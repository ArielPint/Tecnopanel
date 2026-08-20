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
  grupoId: number | null
}

export type SolicitudesTab = 'nueva' | 'historial' | 'catalogo' | 'receta' | 'stock'

interface AuthValue {
  perfil: Perfil | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  puedeVer: (tab: SolicitudesTab) => boolean
  puedeEditar: boolean
  /** Puede agregar y editar productos del catálogo (independiente de logistica:editar). */
  puedeCrearEditarCatalogo: boolean
  /** Puede ocultar/eliminar productos del catálogo (independiente de logistica:editar). */
  puedeEliminarCatalogo: boolean
  /** Usuario con grupo fijo asignado y sin permiso de edición — solo crea solicitudes de su grupo, sin ver para quién ni poder enviarlas. */
  esRestringido: boolean
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
          .select('id, username, nombre, apellido, activo, permissions, grupo_id')
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
                  grupoId: data.grupo_id,
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

  const puedeVer = (tab: SolicitudesTab): boolean =>
    acceso.tieneAccion('solicitudes') && acceso.tieneAccion(`solicitudes:${tab}`)
  // Ver la pestaña de recetas es un permiso de tab normal (otorgable); editarlas requiere
  // además el permiso extra "solicitudes:editar" (checkbox aparte en FormularioAcceso).
  const puedeEditar = acceso.tieneAccion('solicitudes', 'editar')
  const puedeCrearEditarCatalogo = puedeEditar || acceso.tieneAccion('solicitudes:catalogo', 'editar')
  const puedeEliminarCatalogo = puedeEditar || acceso.tieneAccion('solicitudes:catalogo', 'eliminar')
  const perfilConRol = perfil ? { ...perfil, role: acceso.rolNegocio ?? '' } : null
  // Grupo fijo + sin permiso de edición => solo crea, sin elegir grupo/responsable ni enviar.
  const esRestringido = !!perfil?.grupoId && !puedeEditar

  return (
    <AuthContext.Provider
      value={{
        perfil: perfilConRol,
        loading: loading || acceso.loading,
        isAuthenticated: !!perfil,
        isAdmin,
        puedeVer,
        puedeEditar,
        puedeCrearEditarCatalogo,
        puedeEliminarCatalogo,
        esRestringido,
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

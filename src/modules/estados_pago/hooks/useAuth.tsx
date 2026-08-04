import { createContext, useContext, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'

export type EstadosPagoTab = 'listado' | 'subcontratos'

interface AuthValue {
  loading: boolean
  isAdmin: boolean
  rolNegocio: string | null
  puedeVer: boolean
  puedeVerTab: (tab: EstadosPagoTab) => boolean
  puedeCrear: boolean
  puedeEditar: boolean
  puedeAprobar: boolean
  puedeAdministrar: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug!)

  return (
    <AuthContext.Provider
      value={{
        loading: acceso.loading,
        isAdmin: acceso.isAdmin,
        rolNegocio: acceso.rolNegocio,
        puedeVer: acceso.tieneAccion('estados_pago'),
        puedeVerTab: (tab) => acceso.tieneAccion('estados_pago') && acceso.tieneAccion(`estados_pago:${tab}`),
        puedeCrear: acceso.tieneAccion('estados_pago', 'crear'),
        puedeEditar: acceso.tieneAccion('estados_pago', 'editar'),
        puedeAprobar: acceso.tieneAccion('estados_pago', 'aprobar'),
        // 'administra' del spec (eliminar/exportar) mapea a la acción 'eliminar'.
        puedeAdministrar: acceso.tieneAccion('estados_pago', 'eliminar'),
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

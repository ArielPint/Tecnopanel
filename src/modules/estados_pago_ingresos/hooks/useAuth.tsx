import { createContext, useContext, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'

export type EstadosPagoIngresosTab = 'listado' | 'configuracion'

interface AuthValue {
  loading: boolean
  isAdmin: boolean
  rolNegocio: string | null
  puedeVer: boolean
  puedeVerTab: (tab: EstadosPagoIngresosTab) => boolean
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
        puedeVer: acceso.tieneAccion('estados_pago_ingresos'),
        puedeVerTab: (tab) => acceso.tieneAccion('estados_pago_ingresos') && acceso.tieneAccion(`estados_pago_ingresos:${tab}`),
        puedeCrear: acceso.tieneAccion('estados_pago_ingresos', 'crear'),
        puedeEditar: acceso.tieneAccion('estados_pago_ingresos', 'editar'),
        puedeAprobar: acceso.tieneAccion('estados_pago_ingresos', 'aprobar'),
        puedeAdministrar: acceso.tieneAccion('estados_pago_ingresos', 'eliminar'),
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

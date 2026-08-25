import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useAuthStore } from '@/store/authStore'

export type EstadosPagoTab = 'listado' | 'subcontratos'

// Una cuenta de subcontratista (subcontratistas.user_id) no pasa por el sistema de
// permisos por proyecto — su acceso lo resuelve directo el RLS basado en su propia
// ficha (`subcontratista_actual()` en la base). Acá solo hace falta saber si el
// usuario logueado es una de esas cuentas, para habilitarle ver/crear su Listado
// sin necesitar (ni querer) el permiso 'estados_pago' de staff, que abre visibilidad
// a TODOS los subcontratos del proyecto.
function useEsSubcontratista() {
  const userId = useAuthStore((s) => s.user?.id)
  const [esSubcontratista, setEsSubcontratista] = useState(false)

  useEffect(() => {
    if (!userId) {
      setEsSubcontratista(false)
      return
    }
    let cancelado = false
    supabase
      .from('subcontratistas')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) setEsSubcontratista(!!data)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  return esSubcontratista
}

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
  esSubcontratista: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug!)
  const esSubcontratista = useEsSubcontratista()

  return (
    <AuthContext.Provider
      value={{
        loading: acceso.loading,
        isAdmin: acceso.isAdmin,
        rolNegocio: acceso.rolNegocio,
        puedeVer: acceso.tieneAccion('estados_pago') || esSubcontratista,
        // Un subcontratista solo entra a "listado" — la pestaña "subcontratos" (gestión
        // de fichas/contratos) sigue exigiendo el permiso de staff.
        puedeVerTab: (tab) =>
          (tab === 'listado' && esSubcontratista) || (acceso.tieneAccion('estados_pago') && acceso.tieneAccion(`estados_pago:${tab}`)),
        puedeCrear: acceso.tieneAccion('estados_pago', 'crear') || esSubcontratista,
        puedeEditar: acceso.tieneAccion('estados_pago', 'editar'),
        puedeAprobar: acceso.tieneAccion('estados_pago', 'aprobar'),
        // 'administra' del spec (eliminar/exportar) mapea a la acción 'eliminar'.
        puedeAdministrar: acceso.tieneAccion('estados_pago', 'eliminar'),
        esSubcontratista,
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

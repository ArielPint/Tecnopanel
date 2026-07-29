import { createContext, useContext } from 'react'
import { useAuth } from './AuthContext'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'

interface PermisosContextValue {
  loading: boolean
  canAccess: (modulo: string) => boolean
}

const PermisosContext = createContext<PermisosContextValue>({
  loading: true,
  canAccess: () => false,
})

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: loadingProfile } = useAuth()
  const acceso = usePermisosProyecto('crm')

  function canAccess(modulo: string): boolean {
    if (!profile) return false
    return acceso.tieneAccion(modulo)
  }

  return (
    <PermisosContext.Provider value={{ loading: loadingProfile || acceso.loading, canAccess }}>
      {children}
    </PermisosContext.Provider>
  )
}

export function usePermisos() { return useContext(PermisosContext) }

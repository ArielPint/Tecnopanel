import { createContext, useContext } from 'react'
import { useAuth } from './AuthContext'

interface PermisosContextValue {
  loading: boolean
  canAccess: (modulo: string) => boolean
}

const PermisosContext = createContext<PermisosContextValue>({
  loading: true,
  canAccess: () => false,
})

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()

  function canAccess(modulo: string): boolean {
    if (!profile) return false
    if (profile.rol === 'admin') return true
    return profile.modulos?.includes(modulo) ?? false
  }

  return (
    <PermisosContext.Provider value={{ loading, canAccess }}>
      {children}
    </PermisosContext.Provider>
  )
}

export function usePermisos() { return useContext(PermisosContext) }

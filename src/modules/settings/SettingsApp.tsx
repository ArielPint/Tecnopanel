import { AuthProvider, useAuth } from './hooks/useAuth'
import SettingsLayout from './pages/SettingsLayout'

function SettingsGate() {
  const { loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Configuración.
      </div>
    )
  }

  return <SettingsLayout />
}

export default function SettingsApp() {
  return (
    <AuthProvider>
      <SettingsGate />
    </AuthProvider>
  )
}

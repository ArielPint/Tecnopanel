import { AuthProvider, useAuth } from './hooks/useAuth'
import SolicitudesLayout from './pages/SolicitudesLayout'

function SolicitudesGate() {
  const { loading, puedeVer } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!puedeVer('nueva')) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Solicitudes de Materiales.
      </div>
    )
  }

  return <SolicitudesLayout />
}

export default function SolicitudesApp() {
  return (
    <AuthProvider>
      <SolicitudesGate />
    </AuthProvider>
  )
}

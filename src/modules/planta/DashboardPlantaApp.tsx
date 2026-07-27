import { AuthProvider, useAuth } from './hooks/useAuth'
import DashboardLayout from './pages/DashboardLayout'

function DashboardPlantaGate() {
  const { loading, puedeVer } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!puedeVer('resumen')) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso al Dashboard de planta.
      </div>
    )
  }

  return <DashboardLayout />
}

export default function DashboardPlantaApp() {
  return (
    <AuthProvider>
      <DashboardPlantaGate />
    </AuthProvider>
  )
}

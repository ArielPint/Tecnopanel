import { AuthProvider, useAuth } from './hooks/useAuth'
import LogisticaLayout from './pages/LogisticaLayout'

function LogisticaGate() {
  const { loading, puedeVer } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!puedeVer('despacho-gd')) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Logística.
      </div>
    )
  }

  return <LogisticaLayout />
}

export default function LogisticaApp() {
  return (
    <AuthProvider>
      <LogisticaGate />
    </AuthProvider>
  )
}

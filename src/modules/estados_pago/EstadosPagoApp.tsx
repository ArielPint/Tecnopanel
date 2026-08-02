import { AuthProvider, useAuth } from './hooks/useAuth'
import EstadosPagoLayout from './pages/EstadosPagoLayout'

function EstadosPagoGate() {
  const { loading, puedeVer } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!puedeVer) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Estados de Pago.
      </div>
    )
  }

  return <EstadosPagoLayout />
}

export default function EstadosPagoApp() {
  return (
    <AuthProvider>
      <EstadosPagoGate />
    </AuthProvider>
  )
}

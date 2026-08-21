import { AuthProvider as AuthProviderProveedores, useAuth as useAuthProveedores } from './hooks/useAuth'
import { AuthProvider as AuthProviderIngresos, useAuth as useAuthIngresos } from '@/modules/estados_pago_ingresos/hooks/useAuth'
import EstadosPagoLayout from './pages/EstadosPagoLayout'

function EstadosPagoGate() {
  const proveedores = useAuthProveedores()
  const ingresos = useAuthIngresos()

  if (proveedores.loading || ingresos.loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!proveedores.puedeVer && !ingresos.puedeVer) {
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
    <AuthProviderProveedores>
      <AuthProviderIngresos>
        <EstadosPagoGate />
      </AuthProviderIngresos>
    </AuthProviderProveedores>
  )
}

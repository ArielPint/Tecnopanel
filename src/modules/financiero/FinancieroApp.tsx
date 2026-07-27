import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/modules/financiero/components/ui/sonner'
import { AuthProvider, useAuth, type FinancieroTab } from '@/modules/financiero/hooks/useAuth'
import FinancieroLayout from '@/modules/financiero/pages/FinancieroLayout'
import Dashboard from '@/modules/financiero/pages/Dashboard'
import OrdenesCompra from '@/modules/financiero/pages/OrdenesCompra'
import Facturas from '@/modules/financiero/pages/Facturas'
import Presupuestos from '@/modules/financiero/pages/Presupuestos'
import Forecast from '@/modules/financiero/pages/Forecast'
import Remuneraciones from '@/modules/financiero/pages/Remuneraciones'
import Ingresos from '@/modules/financiero/pages/Ingresos'
import GastosDirectos from '@/modules/financiero/pages/GastosDirectos'
import Auditoria from '@/modules/financiero/pages/Auditoria'
import SinAcceso from '@/modules/financiero/pages/SinAcceso'

const ORDEN_TABS: FinancieroTab[] = [
  'dashboard',
  'ordenes-compra',
  'facturas',
  'presupuestos',
  'forecast',
  'remuneraciones',
  'ingresos',
  'gastos-directos',
  'auditoria',
]

function RequiereTab({ tab, children }: { tab: FinancieroTab; children: React.ReactNode }) {
  const { puedeVer } = useAuth()
  return puedeVer(tab) ? <>{children}</> : <Navigate to="sin-acceso" replace />
}

function IndexRoute() {
  const { puedeVer } = useAuth()
  const primerTabDisponible = ORDEN_TABS.find((tab) => puedeVer(tab))
  if (!primerTabDisponible) return <Navigate to="sin-acceso" replace />
  return primerTabDisponible === 'dashboard' ? <Dashboard /> : <Navigate to={primerTabDisponible} replace />
}

function FinancieroRoutes() {
  const { loading } = useAuth()

  // Sesión ya viene garantizada por el ProtectedRoute del hub — acá solo se
  // espera a que cargue el perfil de user_profiles (permisos por tab).
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route element={<FinancieroLayout />}>
          <Route index element={<IndexRoute />} />
          <Route
            path="ordenes-compra"
            element={
              <RequiereTab tab="ordenes-compra">
                <OrdenesCompra />
              </RequiereTab>
            }
          />
          <Route
            path="facturas"
            element={
              <RequiereTab tab="facturas">
                <Facturas />
              </RequiereTab>
            }
          />
          <Route
            path="presupuestos"
            element={
              <RequiereTab tab="presupuestos">
                <Presupuestos />
              </RequiereTab>
            }
          />
          <Route
            path="forecast"
            element={
              <RequiereTab tab="forecast">
                <Forecast />
              </RequiereTab>
            }
          />
          <Route
            path="remuneraciones"
            element={
              <RequiereTab tab="remuneraciones">
                <Remuneraciones />
              </RequiereTab>
            }
          />
          <Route
            path="ingresos"
            element={
              <RequiereTab tab="ingresos">
                <Ingresos />
              </RequiereTab>
            }
          />
          <Route
            path="gastos-directos"
            element={
              <RequiereTab tab="gastos-directos">
                <GastosDirectos />
              </RequiereTab>
            }
          />
          <Route
            path="auditoria"
            element={
              <RequiereTab tab="auditoria">
                <Auditoria />
              </RequiereTab>
            }
          />
          <Route path="sin-acceso" element={<SinAcceso />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default function FinancieroApp() {
  return (
    <AuthProvider>
      <FinancieroRoutes />
    </AuthProvider>
  )
}

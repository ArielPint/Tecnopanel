import { Navigate, Route, Routes } from 'react-router-dom'
import PortalLayout from './components/PortalLayout'
import { usePermisosIngreso } from './hooks/usePermisosIngreso'
import { RUTA } from './lib/rutas'
import Ingresos from './pages/Ingresos'
import NuevaSolicitud from './pages/NuevaSolicitud'
import Ingreso from './pages/Ingreso'

// Portal Ingreso de Personal: web propia como Prevención, en /personal. Transversal a la empresa,
// con un rol por fila de permisos sobre el ancla ING_ANCLA_ID. La sesión y el acceso al portal los
// controla ProtectedRoute en App.tsx.

function SoloSolicitantes({ children }: { children: React.ReactNode }) {
  const { puedeSolicitar, loading } = usePermisosIngreso()
  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (!puedeSolicitar) return <Navigate to={RUTA.inicio} replace />
  return <>{children}</>
}

export default function PersonalApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Ingresos />} />
        <Route path="nueva" element={<SoloSolicitantes><NuevaSolicitud /></SoloSolicitantes>} />
        <Route path=":id" element={<Ingreso />} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}

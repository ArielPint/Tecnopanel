import { Navigate, Route, Routes } from 'react-router-dom'
import PortalLayout from './components/PortalLayout'
import { usePermisosAdq } from './hooks/usePermisosAdq'
import { RUTA } from './lib/rutas'
import Solicitudes from './pages/Solicitudes'
import NuevaSolicitud from './pages/NuevaSolicitud'
import Solicitud from './pages/Solicitud'
import OrdenesSap from './pages/OrdenesSap'
import Configuracion from './pages/Configuracion'
import Dashboard from './pages/Dashboard'
import Presupuestos from './pages/Presupuestos'
import Reposicion from './pages/Reposicion'
import Bodega from './pages/Bodega'
import Planificacion from './pages/Planificacion'
import Planes from './pages/Planes'
import Plan from './pages/Plan'
import Proveedores from './pages/Proveedores'
import Proveedor from './pages/Proveedor'
import NoConformidades from './pages/NoConformidades'

// Portal Adquisiciones: web propia como Ingreso de Personal, en /adquisiciones. Transversal a la
// empresa, con un rol por fila de permisos sobre el ancla ADQ_ANCLA_ID. La sesión y el acceso al
// portal los controla ProtectedRoute en App.tsx.

function Solo({ si, children }: { si: (p: ReturnType<typeof usePermisosAdq>) => boolean; children: React.ReactNode }) {
  const permisos = usePermisosAdq()
  if (permisos.loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (!si(permisos)) return <Navigate to={RUTA.inicio} replace />
  return <>{children}</>
}

export default function AdquisicionesApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Solicitudes />} />
        <Route path="nueva" element={<Solo si={(p) => p.puedeSolicitar}><NuevaSolicitud /></Solo>} />
        <Route path="dashboard" element={<Solo si={(p) => p.veControl}><Dashboard /></Solo>} />
        <Route path="ordenes" element={<Solo si={(p) => p.esCompras}><OrdenesSap /></Solo>} />
        <Route path="reposicion" element={<Solo si={(p) => p.veReposicion}><Reposicion /></Solo>} />
        <Route path="bodega" element={<Solo si={(p) => p.veReposicion}><Bodega /></Solo>} />
        <Route path="planificacion" element={<Solo si={(p) => p.veReposicion || p.veControl}><Planificacion /></Solo>} />
        <Route path="planes" element={<Solo si={(p) => p.veReposicion || p.veControl}><Planes /></Solo>} />
        <Route path="planes/:id" element={<Solo si={(p) => p.veReposicion || p.veControl}><Plan /></Solo>} />
        <Route path="proveedores" element={<Solo si={(p) => p.esCompras}><Proveedores /></Solo>} />
        <Route path="proveedores/:codigo" element={<Solo si={(p) => p.esCompras}><Proveedor /></Solo>} />
        <Route path="nc" element={<Solo si={(p) => p.esCompras}><NoConformidades /></Solo>} />
        <Route path="presupuestos" element={<Solo si={(p) => p.tiene('jefe_compras')}><Presupuestos /></Solo>} />
        <Route path="configuracion" element={<Solo si={(p) => p.tiene('jefe_compras')}><Configuracion /></Solo>} />
        <Route path=":id" element={<Solicitud />} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}

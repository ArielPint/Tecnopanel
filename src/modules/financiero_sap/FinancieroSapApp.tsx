import { Navigate, Route, Routes } from 'react-router-dom'
import PortalLayout from './components/PortalLayout'
import { Aviso } from './components/Estados'
import { usePermisosFin } from './hooks/usePermisosFin'
import { SinPortalError } from './lib/api'
import { RUTA } from './lib/rutas'
import EstadoResultados from './pages/EstadoResultados'
import PorLinea from './pages/PorLinea'
import Prorrateo from './pages/Prorrateo'
import Balance from './pages/Balance'
import Ifrs from './pages/Ifrs'
import ClasificacionIfrs from './pages/ClasificacionIfrs'
import Ventas from '@/modules/gestion/pages/Ventas'

// Portal Financiero: web propia como Adquisiciones, en /financiero. Contabilidad de SAP (estado de
// resultados) por línea de negocio, CECO y sucursal, con un permiso por informe y sucursal sobre el
// ancla FIN_ANCLA_ID. La sesión y el acceso al portal los controla ProtectedRoute en App.tsx.
// No confundir con el financiero de cada obra (modules/financiero, /proyectos/:slug/financiero).

type Permisos = ReturnType<typeof usePermisosFin>

function Solo({ si, children }: { si: (p: Permisos) => boolean; children: React.ReactNode }) {
  const permisos = usePermisosFin()
  if (permisos.loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (permisos.sinPortal) return <Aviso error={new SinPortalError()} />
  if (!si(permisos)) return <Navigate to={RUTA.inicio} replace />
  return <>{children}</>
}

// Aterriza en la primera pantalla que el usuario puede ver.
function Inicio() {
  const p = usePermisosFin()
  if (p.loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (p.sinPortal) return <Aviso error={new SinPortalError()} />
  if (p.veEerr) return <EstadoResultados />
  if (p.veVentas) return <Navigate to={RUTA.ventas} replace />
  if (p.veBalance) return <Navigate to={RUTA.balance} replace />
  if (p.configurar) return <Navigate to={RUTA.prorrateo} replace />
  return (
    <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
      Tu cuenta no tiene informes del portal Financiero. Pide a un administrador que te los asigne.
    </div>
  )
}

function VentasFin() {
  const { admin } = usePermisosFin()
  return <Ventas esAdmin={admin} />
}

export default function FinancieroSapApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Inicio />} />
        <Route path="lineas" element={<Solo si={(p) => p.veEerr}><PorLinea /></Solo>} />
        {/* Las ventas de SAP (antes Gestión › Ventas, que ahora muestra el Backlog): la base deja ver sap_ventas
            a quien tenga el informe Ventas. Los administradores cargan aquí la UF de un mes si falta. */}
        <Route path="ventas" element={<Solo si={(p) => p.veVentas}><VentasFin /></Solo>} />
        <Route path="prorrateo" element={<Solo si={(p) => p.veEerr || p.configurar}><Prorrateo /></Solo>} />
        <Route path="balance" element={<Solo si={(p) => p.veBalance}><Balance /></Solo>} />
        <Route path="ifrs" element={<Solo si={(p) => p.veBalance}><Ifrs /></Solo>} />
        <Route path="clasificacion-ifrs" element={<Solo si={(p) => p.veBalance}><ClasificacionIfrs /></Solo>} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}

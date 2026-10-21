import { Navigate, Route, Routes } from 'react-router-dom'
import PortalLayout from './components/PortalLayout'
import { RUTA } from './lib/rutas'
import Contratistas from './pages/Contratistas'
import ContratistaFicha from './pages/ContratistaFicha'

// Control de Contratistas (/control-contratistas): portal del personal de Tecnopanel para revisar y
// validar lo que cada empresa sube en su portal (/contratistas). Accesos propios: un rol por fila de
// permisos sobre el ancla CTR_ANCLA_ID (pestaña Contratistas de Usuarios). La sesión y el acceso al
// portal los controla ProtectedRoute en App.tsx.

export default function ControlContratistasApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Contratistas />} />
        <Route path=":id" element={<ContratistaFicha />} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}

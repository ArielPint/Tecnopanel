import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import PortalLayout from './components/PortalLayout'
import { RUTA } from './lib/rutas'
import ContratistaFicha from './pages/ContratistaFicha'
import Documentacion from './pages/Documentacion'
import Empresas from './pages/Empresas'
import EstadosPago from './pages/EstadosPago'

// Control de Contratistas (/control-contratistas): portal del personal de Tecnopanel para revisar y
// validar lo que cada empresa sube en su portal (/contratistas). Ordenado por lo que se revisa:
// Documentación del mes, Estados de pago y Empresas (con la ficha de cada una). Accesos propios: un rol
// por fila de permisos sobre el ancla CTR_ANCLA_ID (pestaña Contratistas de Usuarios). La sesión y el
// acceso al portal los controla ProtectedRoute en App.tsx.

/** Fichas con la ruta anterior (/control-contratistas/:id). */
function FichaAnterior() {
  const { id = '' } = useParams<{ id: string }>()
  return <Navigate to={RUTA.contratista(id)} replace />
}

export default function ControlContratistasApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Navigate to={RUTA.documentacion} replace />} />
        <Route path="documentacion" element={<Documentacion />} />
        <Route path="estados-pago" element={<EstadosPago />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="empresas/:id" element={<ContratistaFicha />} />
        <Route path=":id" element={<FichaAnterior />} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}

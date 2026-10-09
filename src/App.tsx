import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './modules/usuarios/LoginPage'
import ResetPasswordPage from './modules/usuarios/ResetPasswordPage'
import CrmLoginPage from './modules/crm/pages/Login'
import SipLoginPage from './modules/sip/pages/Login'
import PrevencionLoginPage from './modules/sso/pages/Login'
import { useAuthStore } from './store/authStore'
import { ConCarga, diferido } from './lib/cargaDiferida'

// Cada sección se descarga recién al entrar a ella
const UsuariosPage = diferido(() => import('./modules/usuarios/UsuariosPage'))
const DashboardPage = diferido(() => import('./modules/dashboard/DashboardPage'))
const ProyectosPage = diferido(() => import('./modules/proyectos/ProyectosPage'))
const CrmApp = diferido(() => import('./modules/crm/CrmApp'))
const FinancieroApp = diferido(() => import('./modules/financiero/FinancieroApp'))
const DashboardPlantaApp = diferido(() => import('./modules/planta/DashboardPlantaApp'))
const ProduccionApp = diferido(() => import('./modules/planta/ProduccionApp'))
const ObraApp = diferido(() => import('./modules/obra/ObraApp'))
const LogisticaApp = diferido(() => import('./modules/logistica/LogisticaApp'))
const SolicitudesApp = diferido(() => import('./modules/solicitudes/SolicitudesApp'))
const EstadosPagoApp = diferido(() => import('./modules/estados_pago/EstadosPagoApp'))
const SettingsApp = diferido(() => import('./modules/settings/SettingsApp'))
const GeoVictoriaPage = diferido(() => import('./modules/gestion/GeoVictoriaPage'))
const GestionApp = diferido(() => import('./modules/gestion/GestionApp'))
const SipApp = diferido(() => import('./modules/sip/SipApp'))
const PrevencionApp = diferido(() => import('./modules/sso/PrevencionApp'))

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/crm/login" element={<CrmLoginPage />} />
        {/* Portal Producción de Paneles SIP: web propia como el CRM, con su login (misma cuenta del hub) */}
        <Route path="/produccion/login" element={<SipLoginPage />} />
        <Route
          path="/produccion/*"
          element={
            <ProtectedRoute loginPath="/produccion/login" requiere="sip">
              <ConCarga><SipApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        {/* Portal de Prevención: web propia como el CRM, con su login (misma cuenta del hub) */}
        <Route path="/prevencion/login" element={<PrevencionLoginPage />} />
        <Route
          path="/prevencion/*"
          element={
            <ProtectedRoute loginPath="/prevencion/login" requiere="sso">
              <ConCarga><PrevencionApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        {/* versión anterior, dentro del hub */}
        <Route path="/sso/*" element={<Navigate to="/prevencion" replace />} />
        <Route
          path="/crm/*"
          element={
            <ProtectedRoute loginPath="/crm/login" requiere="crm">
              <ConCarga><CrmApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/financiero/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><FinancieroApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/dashboard/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><DashboardPlantaApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/produccion/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><ProduccionApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/obra/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><ObraApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/logistica/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><LogisticaApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/solicitudes/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><SolicitudesApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/estados-pago/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><EstadosPagoApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/:proyectoSlug/settings/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <ConCarga><SettingsApp /></ConCarga>
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<ConCarga><DashboardPage /></ConCarga>} />
          <Route
            path="/proyectos"
            element={
              <ProtectedRoute requiere="proyecto">
                <ConCarga><ProyectosPage /></ConCarga>
              </ProtectedRoute>
            }
          />
          <Route path="/geovictoria" element={<ConCarga><GeoVictoriaPage /></ConCarga>} />
          <Route
            path="/gestion"
            element={
              <ProtectedRoute requiere="gestion">
                <ConCarga><GestionApp /></ConCarga>
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute requiere="admin">
                <ConCarga><UsuariosPage /></ConCarga>
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

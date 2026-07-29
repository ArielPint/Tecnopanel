import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './modules/usuarios/LoginPage'
import ResetPasswordPage from './modules/usuarios/ResetPasswordPage'
import UsuariosPage from './modules/usuarios/UsuariosPage'
import DashboardPage from './modules/dashboard/DashboardPage'
import ProyectosPage from './modules/proyectos/ProyectosPage'
import CrmApp from './modules/crm/CrmApp'
import CrmLoginPage from './modules/crm/pages/Login'
import FinancieroApp from './modules/financiero/FinancieroApp'
import DashboardPlantaApp from './modules/planta/DashboardPlantaApp'
import LogisticaApp from './modules/logistica/LogisticaApp'
import SolicitudesApp from './modules/solicitudes/SolicitudesApp'
import SettingsApp from './modules/settings/SettingsApp'
import GeoVictoriaPage from './modules/gestion/GeoVictoriaPage'
import { useAuthStore } from './store/authStore'

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
        <Route
          path="/crm/*"
          element={
            <ProtectedRoute loginPath="/crm/login" requiere="crm">
              <CrmApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/financiero/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <FinancieroApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/dashboard/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <DashboardPlantaApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/logistica/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <LogisticaApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/solicitudes/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <SolicitudesApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/settings/*"
          element={
            <ProtectedRoute requiere="proyecto">
              <SettingsApp />
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
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/proyectos"
            element={
              <ProtectedRoute requiere="proyecto">
                <ProyectosPage />
              </ProtectedRoute>
            }
          />
          <Route path="/geovictoria" element={<GeoVictoriaPage />} />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute requiere="admin">
                <UsuariosPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

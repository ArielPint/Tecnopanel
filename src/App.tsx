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
        <Route
          path="/crm/*"
          element={
            <ProtectedRoute>
              <CrmApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/financiero/*"
          element={
            <ProtectedRoute>
              <FinancieroApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/dashboard/*"
          element={
            <ProtectedRoute>
              <DashboardPlantaApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/logistica/*"
          element={
            <ProtectedRoute>
              <LogisticaApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/solicitudes/*"
          element={
            <ProtectedRoute>
              <SolicitudesApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proyectos/la-chacra/settings/*"
          element={
            <ProtectedRoute>
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
          <Route path="/proyectos" element={<ProyectosPage />} />
          <Route path="/geovictoria" element={<GeoVictoriaPage />} />
          <Route path="/usuarios" element={<UsuariosPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

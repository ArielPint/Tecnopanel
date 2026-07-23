import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './modules/usuarios/LoginPage'
import ResetPasswordPage from './modules/usuarios/ResetPasswordPage'
import UsuariosPage from './modules/usuarios/UsuariosPage'
import DashboardPage from './modules/dashboard/DashboardPage'
import ProyectosPage from './modules/proyectos/ProyectosPage'
import CrmPage from './modules/gestion/CrmPage'
import { useAuthStore } from './store/authStore'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter basename="/Tecnopanel">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/proyectos" element={<ProyectosPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/usuarios" element={<UsuariosPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

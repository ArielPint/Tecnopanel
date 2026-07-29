import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAccesoUsuario } from '../hooks/useAccesoUsuario'

export default function ProtectedRoute({
  children,
  loginPath = '/login',
  requiere,
}: {
  children: React.ReactNode
  loginPath?: string
  /** Si se indica, exige que el usuario tenga ese acceso además de sesión — si no, lo manda a "/" para que aterrice donde sí tiene acceso real. */
  requiere?: 'admin' | 'crm' | 'proyecto'
}) {
  const { session, loading } = useAuthStore()
  const acceso = useAccesoUsuario()

  if (loading || (requiere && session && acceso.loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Cargando…
      </div>
    )
  }

  if (!session) {
    return <Navigate to={loginPath} replace />
  }

  if (requiere) {
    const autorizado =
      requiere === 'admin' ? acceso.isAdmin : requiere === 'crm' ? acceso.tieneCrm : acceso.tieneProyecto
    if (!autorizado) {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}

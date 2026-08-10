import { Navigate, useParams } from 'react-router-dom'
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
  requiere?: 'admin' | 'crm' | 'proyecto' | 'gestion'
}) {
  const { session, loading } = useAuthStore()
  const acceso = useAccesoUsuario()
  // Fase F: rutas de proyecto son /proyectos/:proyectoSlug/* — el gate 'proyecto'
  // ahora valida acceso a ESE proyecto puntual, no solo "tiene algún proyecto".
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

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
      requiere === 'admin'
        ? acceso.isAdmin
        : requiere === 'crm'
          ? acceso.tieneCrm
          : requiere === 'gestion'
            ? acceso.tieneGestion
            : acceso.isAdmin || acceso.proyectosObra.some((p) => p.slug === proyectoSlug)
    if (!autorizado) {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}

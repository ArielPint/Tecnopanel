import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({
  children,
  loginPath = '/login',
}: {
  children: React.ReactNode
  loginPath?: string
}) {
  const { session, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Cargando…
      </div>
    )
  }

  if (!session) {
    return <Navigate to={loginPath} replace />
  }

  return <>{children}</>
}

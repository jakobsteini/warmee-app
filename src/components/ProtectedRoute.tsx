import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const t = useT()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        {t('common.loading')}
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

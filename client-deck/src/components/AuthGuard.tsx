import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

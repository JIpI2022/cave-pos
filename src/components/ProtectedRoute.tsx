/** Garde de route : exige une session et, au besoin, un role minimum. */

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

export default function ProtectedRoute({
  children, require = 'caissier',
}: { children: ReactNode; require?: 'caissier' | 'gerant' | 'admin' }) {
  const { session, profile, loading, profileError, role } = useAuth()

  if (loading) return <Spinner label="Verification de la session..." />
  if (!session) return <Navigate to="/connexion" replace />

  if (profileError) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Alert kind="error">{profileError}</Alert>
      </div>
    )
  }
  if (!profile) return <Spinner label="Chargement du profil..." />

  const allowed =
    require === 'caissier' ? true
    : require === 'gerant' ? role === 'gerant' || role === 'admin'
    : role === 'admin'

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Alert kind="warning">
          Cette page est reservee aux {require === 'admin' ? 'administrateurs' : 'gerants et administrateurs'}.
          Votre role actuel ne permet pas d y acceder.
        </Alert>
      </div>
    )
  }

  return <>{children}</>
}

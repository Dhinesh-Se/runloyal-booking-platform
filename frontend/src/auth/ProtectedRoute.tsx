import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void loginWithRedirect({ appState: { returnTo: window.location.pathname } })
    }
  }, [isLoading, isAuthenticated, loginWithRedirect])

  if (isLoading) {
    // Auth state not yet resolved — show full-page loader
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
        <span>Authenticating…</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

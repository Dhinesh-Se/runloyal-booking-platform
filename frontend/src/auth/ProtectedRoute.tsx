import { useEffect } from 'react'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isLoading, isAuthenticated, login } = useAuth()
  const loggedOut = sessionStorage.getItem('runloyal:logged-out') === 'true'

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !loggedOut) {
      login()
    }
  }, [isLoading, isAuthenticated, loggedOut, login])

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
    return (
      <div className="auth-loading">
        <span>You are signed out.</span>
        <button type="button" onClick={login}>Sign in</button>
      </div>
    )
  }

  return <>{children}</>
}

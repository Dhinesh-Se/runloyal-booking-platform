import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { useOktaAuth } from '@okta/okta-react'
import { cancelApiRequests } from '@/api/client'
import { isTokenAccessBlocked, updateAuthSession } from './session'
import { LoginPage } from './LoginPage'

export function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isLoading, isAuthenticated, login, logout, loggedOut, isLoggingOut, isLoggingIn, error } = useAuth()
  const { authState } = useOktaAuth()
  const sdkError = authState?.error
  const queryClient = useQueryClient()
  const loginStarted = useRef(false)

  useEffect(() => {
    const expireSession = () => {
      if (isTokenAccessBlocked()) return
      updateAuthSession({ loggedOut: true, error: 'Your API session was rejected or expired. Sign in again.' })
      cancelApiRequests()
      void queryClient.cancelQueries()
      queryClient.clear()
    }
    window.addEventListener('runloyal:session-expired', expireSession)
    return () => window.removeEventListener('runloyal:session-expired', expireSession)
  }, [queryClient])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !loggedOut && !isLoggingIn && !error && !sdkError && !loginStarted.current) {
      loginStarted.current = true
      void login().catch(() => { /* Shared auth error is rendered below. */ })
    }
  }, [isLoading, isAuthenticated, loggedOut, isLoggingIn, error, sdkError, login])

  if (isLoading && !loggedOut) {
    // Auth state not yet resolved — show professional login page
    return (
      <LoginPage
        isLoading={isLoading}
        isAuthenticated={isAuthenticated}
        loggedOut={loggedOut}
        isLoggingOut={isLoggingOut}
        isLoggingIn={isLoggingIn}
        error={error}
        onLogin={login}
        onLogout={logout}
      />
    )
  }

  if (loggedOut || isLoggingIn || !isAuthenticated) {
    return (
      <LoginPage
        isLoading={isLoading}
        isAuthenticated={isAuthenticated}
        loggedOut={loggedOut}
        isLoggingOut={isLoggingOut}
        isLoggingIn={isLoggingIn}
        error={error}
        onLogin={login}
        onLogout={logout}
      />
    )
  }

  return <>{children}</>
}

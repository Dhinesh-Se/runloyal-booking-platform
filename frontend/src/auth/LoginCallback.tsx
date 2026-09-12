import { useAuth0 } from '@auth0/auth0-react'

export function LoginCallback() {
  const { isLoading, error } = useAuth0()

  return (
    <div className="auth-loading">
      {isLoading && <div className="auth-loading__spinner" />}
      <span>{error ? `Login failed: ${error.message}` : 'Completing sign in…'}</span>
    </div>
  )
}

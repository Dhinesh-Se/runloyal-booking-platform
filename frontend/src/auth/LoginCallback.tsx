import { useAuth } from './useAuth'

export function LoginCallback() {
  const { isLoading } = useAuth()

  return (
    <div className="auth-loading">
      {isLoading && <div className="auth-loading__spinner" />}
      <span>{isLoading ? 'Completing sign in…' : 'Returning to the portal…'}</span>
    </div>
  )
}

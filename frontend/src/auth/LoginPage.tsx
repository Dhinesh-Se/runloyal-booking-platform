import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { useOktaAuth } from '@okta/okta-react'

interface LoginPageProps {
  readonly isLoading: boolean
  readonly isAuthenticated: boolean
  readonly loggedOut: boolean
  readonly isLoggingOut: boolean
  readonly isLoggingIn: boolean
  readonly error?: string
  readonly onLogin: () => Promise<void>
  readonly onLogout: () => Promise<void>
}

export function LoginPage({
  isLoading,
  isAuthenticated,
  loggedOut,
  isLoggingOut,
  isLoggingIn,
  error,
  onLogin,
  onLogout
}: LoginPageProps) {
  const { authState } = useOktaAuth()
  const sdkError = authState?.error

  const isProcessing = isLoggingOut || isLoggingIn || isLoading
  const displayError = error || sdkError?.message || sdkError?.errorCode
  const statusMessage = isLoggingOut
    ? 'Signing out…'
    : isLoggingIn
      ? 'Redirecting to sign in…'
      : isLoading
        ? 'Authenticating…'
        : 'You are signed out'

  return (
    <div className="login-page">
      <div className="login-page__gradient" />
      
      <div className="login-card">
        {/* Header with logo/branding */}
        <div className="login-card__header">
          <div className="login-card__logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="url(#gradient)" />
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Manrope">
                RL
              </text>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3e63dd" />
                  <stop offset="100%" stopColor="#12b5a6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-card__title">RunLoyal</h1>
          <p className="login-card__subtitle">Professional Booking Platform</p>
        </div>

        {/* Main content */}
        <div className="login-card__content">
          {isProcessing ? (
            <div className="login-card__loader">
              <div className="login-card__spinner" />
              <p>{statusMessage}</p>
            </div>
          ) : (
            <>
              <p className="login-card__message">
                {loggedOut
                  ? 'Your session has ended. Please sign in to continue.'
                  : 'Sign in to access your booking dashboard.'}
              </p>

              {displayError && (
                <div className="login-card__alert login-card__alert--error" role="alert">
                  <svg className="login-card__alert-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="login-card__alert-title">Authentication Failed</p>
                    <p className="login-card__alert-message">{displayError}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with buttons */}
        {!isProcessing && (
          <div className="login-card__footer">
            <button
              type="button"
              className="btn btn--primary btn--lg login-card__btn"
              onClick={() => {
                void onLogin().catch(() => { /* Error handled in shared UI */ })
              }}
              disabled={isProcessing}
            >
              {loggedOut ? 'Sign In Again' : 'Sign In'}
            </button>

            {loggedOut && (
              <button
                type="button"
                className="btn btn--secondary login-card__btn-secondary"
                onClick={() => {
                  void onLogout().catch(() => { /* Error handled in shared UI */ })
                }}
                disabled={isProcessing}
              >
                Retry Sign Out
              </button>
            )}
          </div>
        )}

        {/* Footer link */}
        <div className="login-card__footer-text">
          <p>
            Need help?{' '}
            <a href="mailto:support@runloyal.com" className="login-card__link">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

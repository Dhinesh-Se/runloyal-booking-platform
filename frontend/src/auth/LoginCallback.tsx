import { useEffect, useState } from 'react'
import { LoginCallback as OktaLoginCallback, useOktaAuth } from '@okta/okta-react'
import { updateAuthSession } from './session'

function CallbackError() {
  useEffect(() => {
    updateAuthSession({ loggedOut: true, isLoggingIn: false, error: 'Sign-in could not be completed. Try Sign in again.' })
  }, [])

  return (
    <div className="auth-loading" role="alert">
      <p>Sign-in could not be completed. Return to the app and try Sign in again.</p>
      <a href="/">Return to app</a>
    </div>
  )
}

export function LoginCallback() {
  const { oktaAuth } = useOktaAuth()
  const [isRedirect] = useState(() => oktaAuth.isLoginRedirect())
  if (!isRedirect) return <CallbackError />

  // The SDK handles state/nonce/PKCE validation and the code-to-token exchange.
  // Only Security.restoreOriginalUri releases the app gate on success.
  return <OktaLoginCallback errorComponent={CallbackError} loadingElement={
    <div className="auth-loading">
      <div className="auth-loading__spinner" />
      <span>Completing sign in…</span>
    </div>
  } />
}

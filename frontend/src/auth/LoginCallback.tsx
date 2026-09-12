import { LoginCallback as OktaLoginCallback } from '@okta/okta-react'

const loadingElement = (
  <div className="auth-loading">
    <div className="auth-loading__spinner" />
    <span>Completing sign in…</span>
  </div>
)

const errorElement = (
  <div className="auth-loading">
    <span>Sign-in failed. Please close this tab and try again.</span>
  </div>
)

export function LoginCallback() {
  return <OktaLoginCallback loadingElement={loadingElement} errorComponent={() => errorElement} />
}

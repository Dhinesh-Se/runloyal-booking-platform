import React, { useEffect } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { registerTokenGetter } from '@/api/client'

const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN as string
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID as string
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE as string

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_AUDIENCE) {
  console.error(
    '[RunLoyal] Missing Auth0 configuration. ' +
      'Set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, and VITE_AUTH0_AUDIENCE in your .env file.'
  )
}

function TokenBridge({ children }: { children: React.ReactNode }) {
  const { getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    registerTokenGetter(async () => {
      try {
        return await getAccessTokenSilently({
          authorizationParams: { audience: AUTH0_AUDIENCE },
        })
      } catch {
        return null
      }
    })
  }, [getAccessTokenSilently])

  return <>{children}</>
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function OktaProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate()

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      cacheLocation="localstorage"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: AUTH0_AUDIENCE,
        scope: 'openid profile email',
      }}
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo || '/calendar', { replace: true })
      }}
    >
      <TokenBridge>{children}</TokenBridge>
    </Auth0Provider>
  )
}

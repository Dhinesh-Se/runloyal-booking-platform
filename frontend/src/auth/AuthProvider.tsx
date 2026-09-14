import React, { useCallback, useEffect, useState } from 'react'
import type { OktaAuth } from '@okta/okta-auth-js'
import { Security, useOktaAuth } from '@okta/okta-react'
import { useNavigate } from 'react-router-dom'
import { registerTokenGetter } from '@/api/client'
import { readAuthConfig, safeReturnTo } from './config'
import { getOktaClient } from './okta'
import { completeSignIn, forgetLogoutTokens, getAuthSession, isTokenAccessBlocked } from './session'

function TokenBridge({ children }: Readonly<{ children: React.ReactNode }>) {
  const { oktaAuth } = useOktaAuth()

  useEffect(() => {
    let mounted = true
    const unregister = registerTokenGetter(async () => {
      if (!mounted || isTokenAccessBlocked()) return null
      try {
        const token = await oktaAuth.getOrRenewAccessToken()
        return !mounted || isTokenAccessBlocked() ? null : token
      } catch {
        return null
      }
    })
    return () => { mounted = false; unregister() }
  }, [oktaAuth])

  return <>{children}</>
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: Readonly<AuthProviderProps>) {
  const navigate = useNavigate()
  const [setup] = useState(() => {
    try {
      const config = readAuthConfig()
      try {
        return { client: getOktaClient(config), error: null }
      } catch {
        return { client: null, error: 'Okta could not initialize. Check the SPA configuration and allow browser session storage.' }
      }
    } catch (error) {
      return { client: null, error: error instanceof Error ? error.message : 'Check the Okta SPA configuration and browser session storage.' }
    }
  })
  const restoreOriginalUri = useCallback(async (client: OktaAuth, originalUri?: string) => {
    // Auth JS calls this only after parsing, verifying and storing callback tokens.
    // Merely seeing stale SDK authentication must never release the app logout gate.
    if (!client.authStateManager.getAuthState()?.isAuthenticated || getAuthSession().isLoggingOut) {
      throw new Error('Sign-in was not completed.')
    }
    forgetLogoutTokens(client)
    completeSignIn()
    navigate(safeReturnTo(originalUri), { replace: true })
  }, [navigate])

  if (!setup.client) {
    return (
      <div className="auth-loading" role="alert">
        <h1>Authentication configuration required</h1>
        <p>{setup.error}</p>
      </div>
    )
  }

  return (
    <Security oktaAuth={setup.client} restoreOriginalUri={restoreOriginalUri}>
      <TokenBridge>{children}</TokenBridge>
    </Security>
  )
}


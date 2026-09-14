import { useOktaAuth } from '@okta/okta-react'
import type { Tokens } from '@okta/okta-auth-js'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cancelApiRequests, waitForTokenRequests } from '@/api/client'
import { safeReturnTo } from './config'
import {
  forgetLogoutTokens, getAuthSession, rememberLogoutTokens, SIGN_OUT_ERROR, updateAuthSession, useAuthSession,
} from './session'

export interface AuthUser {
  name?: string
  email?: string
  sub?: string
}

export function useAuth() {
  const { authState, oktaAuth } = useOktaAuth()
  const queryClient = useQueryClient()
  const session = useAuthSession()
  const blocked = session.loggedOut || session.isLoggingIn || session.isLoggingOut

  // ID claims are display-only. API authorization uses only access tokens.
  const claims = authState?.idToken?.claims
  const user: AuthUser = blocked ? {} : {
    name: typeof claims?.name === 'string' ? claims.name : undefined,
    email: typeof claims?.email === 'string' ? claims.email : undefined,
    sub: typeof claims?.sub === 'string' ? claims.sub : undefined,
  }

  const logout = useCallback(async () => {
    if (getAuthSession().isLoggingOut || getAuthSession().isLoggingIn) return
    updateAuthSession({ loggedOut: true, isLoggingOut: true, isLoggingIn: false, error: null })
    cancelApiRequests()
    let failure: { error: unknown } | undefined
    try {
      const cancellation = queryClient.cancelQueries()
      queryClient.clear()
      let tokens: Tokens = {}
      try {
        // Stop services BEFORE draining: late renewals can still write SDK cache.
        await oktaAuth.stop()
      } finally {
        await waitForTokenRequests()
        // Also preserve native logout hints for retry if stopping services fails.
        tokens = rememberLogoutTokens(oktaAuth)
      }
      await cancellation
      // Pass snapshots to the native SDK so clearing storage cannot lose the
      // id_token_hint or the tokens that must be revoked (including on retry).
      oktaAuth.tokenManager.clear()
      const completed = await oktaAuth.signOut({
        ...tokens,
        postLogoutRedirectUri: oktaAuth.options.postLogoutRedirectUri,
        clearTokensBeforeRedirect: true,
        revokeAccessToken: true,
        revokeRefreshToken: true,
      })
      // false means XHR fallback did not close a session, not confirmed remote logout.
      if (!completed) throw new Error('Okta did not confirm closing the session.')
      forgetLogoutTokens(oktaAuth)
    } catch (error) {
      updateAuthSession({ error: SIGN_OUT_ERROR })
      failure = { error }
    } finally {
      try {
        oktaAuth.tokenManager.clear()
      } catch (error) {
        updateAuthSession({ error: SIGN_OUT_ERROR })
        // Preserve the original failure; cleanup must not mask it in finally.
        failure ??= { error }
      } finally {
        queryClient.clear()
        updateAuthSession({ isLoggingOut: false })
      }
    }
    if (failure) throw failure.error
  }, [oktaAuth, queryClient])

  const login = useCallback(async () => {
    const current = getAuthSession()
    if (current.isLoggingIn || current.isLoggingOut) return
    updateAuthSession({ isLoggingIn: true, error: null })
    try {
      // Only a successful redirect callback clears the logout gate, not merely
      // redirect initiation: stale SDK auth must never reopen protected UI.
      await oktaAuth.start()
      await oktaAuth.signInWithRedirect({ originalUri: safeReturnTo(window.location.href) })
    } catch (error) {
      updateAuthSession({
        loggedOut: true,
        isLoggingIn: false,
        error: 'Sign-in could not be started. Check your connection and try Sign in again.',
      })
      throw error
    }
  }, [oktaAuth])

  return { ...session, isAuthenticated: !!authState?.isAuthenticated && !blocked, isLoading: !authState, user, logout, login }
}

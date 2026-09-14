import { useSyncExternalStore } from 'react'
import type { OktaAuth, Tokens } from '@okta/okta-auth-js'

const LOGGED_OUT_KEY = 'runloyal:logged-out'

function readLoggedOut() {
  try {
    return sessionStorage.getItem(LOGGED_OUT_KEY) === 'true'
  } catch {
    return false
  }
}

let session = {
  loggedOut: readLoggedOut(),
  isLoggingOut: false,
  isLoggingIn: false,
  error: null as string | null,
}
const listeners = new Set<() => void>()

export function getAuthSession() {
  return session
}

export function updateAuthSession(update: Partial<typeof session>) {
  session = { ...session, ...update }
  if (update.loggedOut !== undefined) {
    try {
      if (update.loggedOut) sessionStorage.setItem(LOGGED_OUT_KEY, 'true')
      else sessionStorage.removeItem(LOGGED_OUT_KEY)
    } catch {
      // Storage can be disabled; the in-memory gate still locks this page.
    }
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useAuthSession() {
  return useSyncExternalStore(subscribe, getAuthSession)
}

export function isTokenAccessBlocked() {
  return session.loggedOut || session.isLoggingOut || session.isLoggingIn
}

export function completeSignIn() {
  updateAuthSession({ loggedOut: false, isLoggingIn: false, error: null })
}

export const SIGN_OUT_ERROR =
  'Sign-out could not be completed. This app remains locked, but your Okta session may still be active. Retry sign out. If the problem persists, ask your administrator to check the Okta Sign-out redirect URIs and browser cookie settings.'

// Shared between hook consumers for explicit retry, never written to storage.
// Keep the ID token for native end-session even after clearing the local cache.
const logoutTokens = new WeakMap<OktaAuth, Tokens>()

export function rememberLogoutTokens(client: OktaAuth): Tokens {
  const previous = logoutTokens.get(client)
  const current = client.tokenManager.getTokensSync()
  const tokens = {
    idToken: current.idToken ?? previous?.idToken,
    accessToken: current.accessToken ?? previous?.accessToken,
    refreshToken: current.refreshToken ?? previous?.refreshToken,
  }
  logoutTokens.set(client, tokens)
  return tokens
}

export function forgetLogoutTokens(client: OktaAuth) {
  logoutTokens.delete(client)
}
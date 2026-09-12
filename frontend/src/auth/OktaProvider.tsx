import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { registerTokenGetter } from '@/api/client'

const issuer = (import.meta.env.VITE_OKTA_ISSUER_URI as string | undefined)?.replace(/\/$/, '')
const clientId = import.meta.env.VITE_OKTA_CLIENT_ID as string | undefined
const audience = import.meta.env.VITE_OKTA_AUDIENCE as string | undefined
const redirectUri = `${window.location.origin}/login/callback`
const tokenKey = 'runloyal.okta.access-token'
const verifierKey = 'runloyal.okta.pkce-verifier'
const returnToKey = 'runloyal.okta.return-to'

export interface AuthUser { name?: string; email?: string; sub?: string }
export interface AuthContextValue { isAuthenticated: boolean; isLoading: boolean; user: AuthUser; login: () => void; logout: () => void }
export const AuthContext = createContext<AuthContextValue | null>(null)

function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function randomVerifier() { const bytes = crypto.getRandomValues(new Uint8Array(64)); return base64Url(bytes) }
async function challenge(verifier: string) { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))) }
function parseJwt(token: string): AuthUser & { exp?: number } { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as AuthUser & { exp?: number } } catch { return {} } }

export function OktaProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(tokenKey))
  const [isLoading, setIsLoading] = useState(true)

  const login = useCallback(() => {
    if (!issuer || !clientId || !audience) throw new Error('Okta configuration is missing. Set VITE_OKTA_ISSUER_URI, VITE_OKTA_CLIENT_ID, and VITE_OKTA_AUDIENCE.')
    void (async () => {
      const verifier = randomVerifier()
      sessionStorage.setItem(verifierKey, verifier)
      sessionStorage.setItem(returnToKey, window.location.pathname)
      const params = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'openid profile email', redirect_uri: redirectUri, code_challenge: await challenge(verifier), code_challenge_method: 'S256', audience })
      window.location.assign(`${issuer}/v1/authorize?${params}`)
    })()
  }, [])

  const logout = useCallback(() => { sessionStorage.clear(); setToken(null); window.location.assign(window.location.origin) }, [])

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) { setIsLoading(false); return }
    const verifier = sessionStorage.getItem(verifierKey)
    if (!verifier || !issuer || !clientId) { setIsLoading(false); return }
    void fetch(`${issuer}/v1/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier }) })
      .then(async (response) => { if (!response.ok) throw new Error('Okta could not complete sign in.'); return response.json() as Promise<{ access_token: string }> })
      .then(({ access_token }) => {
        const returnTo = sessionStorage.getItem(returnToKey) || '/'
        sessionStorage.setItem(tokenKey, access_token)
        sessionStorage.removeItem(verifierKey)
        sessionStorage.removeItem(returnToKey)
        setToken(access_token)
        window.history.replaceState({}, document.title, returnTo)
      })
      .catch(() => { sessionStorage.removeItem(tokenKey); setToken(null) })
      .finally(() => setIsLoading(false))
  }, [])

  const tokenClaims = token ? parseJwt(token) : {}
  const tokenIsValid = !!token && (!tokenClaims.exp || tokenClaims.exp * 1000 > Date.now())
  useEffect(() => { registerTokenGetter(async () => tokenIsValid ? token : null) }, [token, tokenIsValid])
  const value = useMemo<AuthContextValue>(() => ({ isAuthenticated: tokenIsValid, isLoading, user: tokenIsValid ? tokenClaims : {}, login, logout }), [tokenIsValid, tokenClaims, isLoading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

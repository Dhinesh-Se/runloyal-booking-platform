export interface AuthConfig {
  issuer: string
  clientId: string
  scopes: string[]
  redirectUri: string
  postLogoutRedirectUri: string
}

const SETUP_ERROR = 'Set VITE_OKTA_ISSUER to the HTTPS Issuer URI in Okta Security > API > Authorization Servers (for example, your Okta domain followed by /oauth2/default), not the org URL or an Auth0 issuer. Set VITE_OKTA_CLIENT_ID to the public SPA Client ID (the ID-token audience); never use a client secret. Use this origin and /login/callback for VITE_OKTA_REDIRECT_URI, and this origin for VITE_OKTA_LOGOUT_URI. Then restart the development server.'
const placeholder = /[{}<>]|your[._-]|replace[._-]?me|placeholder|changeme|example\.(com|org|net)|\.invalid(?:\/|$)/i
const unsafePathCharacters = (value: string) => Array.from(value).some((char) => char === '\\' || char.charCodeAt(0) <= 32)

/** Read public SPA settings only; never require a browser client secret. */
export function readAuthConfig(
  env: Record<string, unknown> = import.meta.env,
  origin = window.location.origin,
): AuthConfig {
  const value = (key: string) => typeof env[key] === 'string' ? env[key].trim() : ''
  try {
    const issuer = value('VITE_OKTA_ISSUER')
    const clientId = value('VITE_OKTA_CLIENT_ID')
    if (!issuer || !clientId || placeholder.test(issuer) || placeholder.test(clientId) || /\s/.test(clientId)) {
      throw new Error()
    }
    const server = new URL(issuer)
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash
      || /(^|\.)auth0\./i.test(server.hostname)
      || !/^\/oauth2\/[A-Za-z0-9_-]+$/.test(server.pathname)
      || issuer !== `${server.origin}${server.pathname}`) throw new Error()

    const redirectUri = value('VITE_OKTA_REDIRECT_URI') || `${origin}/login/callback`
    const postLogoutRedirectUri = value('VITE_OKTA_LOGOUT_URI') || `${origin}/`
    for (const uri of [redirectUri, postLogoutRedirectUri]) {
      const url = new URL(uri)
      if (url.origin !== origin || url.username || url.password || placeholder.test(uri)
        || !/^https?:\/\//.test(uri) || /[\\\s]/.test(uri)) throw new Error()
    }
    const callback = new URL(redirectUri)
    if (callback.pathname !== '/login/callback' || callback.search || callback.hash) throw new Error()
    const scopes = [...new Set((value('VITE_OKTA_SCOPES') || 'openid profile email').split(/\s+/))]
    if (!scopes.includes('openid') || scopes.some((scope) => !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope))) {
      throw new Error()
    }
    return { issuer, clientId, scopes, redirectUri, postLogoutRedirectUri }
  } catch {
    // Never reflect a configured URI, callback query, or SDK details in the setup error.
    throw new Error(SETUP_ERROR)
  }
}

/** Only app-local navigation; reject protocol-relative URLs and URL parser tricks. */
export function safeReturnTo(uri?: string, origin = window.location.origin): string {
  if (!uri || uri !== uri.trim() || unsafePathCharacters(uri) || uri.startsWith('//')) return '/calendar'
  try {
    if (!uri.startsWith('/') && !/^https?:\/\//.test(uri)) return '/calendar'
    const url = new URL(uri, origin)
    const decodedPath = decodeURIComponent(url.pathname)
    if (url.origin !== origin || url.username || url.password || decodedPath.startsWith('//')
      || unsafePathCharacters(decodedPath) || decodedPath.replace(/\/+$/, '') === '/login/callback') {
      return '/calendar'
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/calendar'
  }
}
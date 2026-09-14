import { describe, expect, it } from 'vitest'
import { readAuthConfig, safeReturnTo } from '@/auth/config'

const origin = 'http://localhost:3000'
const valid = { VITE_OKTA_ISSUER: 'https://unit.okta.com/oauth2/default', VITE_OKTA_CLIENT_ID: 'spa-unit' }

describe('Okta SPA configuration', () => {
  it('defaults to PKCE callback and root logout on the current origin', () => {
    expect(readAuthConfig(valid, origin)).toEqual({
      issuer: valid.VITE_OKTA_ISSUER, clientId: valid.VITE_OKTA_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'], redirectUri: `${origin}/login/callback`, postLogoutRedirectUri: `${origin}/`,
    })
  })

  it('explains where to find the API issuer when an org URL is supplied', () => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_ISSUER: 'https://unit.okta.com' }, origin))
      .toThrow('Okta Security > API > Authorization Servers')
  })

  it('does not accept legacy Auth0 configuration as an Okta fallback', () => {
    expect(() => readAuthConfig({
      VITE_AUTH0_DOMAIN: 'unit.auth0.com', VITE_AUTH0_CLIENT_ID: 'legacy-spa',
    }, origin)).toThrow('VITE_OKTA_CLIENT_ID')
  })

  it('supports custom domains/authorization server IDs and space-separated custom API scopes', () => {
    expect(readAuthConfig({ ...valid,
      VITE_OKTA_ISSUER: 'https://login.runloyal.test/oauth2/aus_123-456',
      VITE_OKTA_SCOPES: ' openid   profile email booking.read booking.write openid ',
      VITE_OKTA_REDIRECT_URI: `${origin}/login/callback`, VITE_OKTA_LOGOUT_URI: `${origin}/signed-out`,
    }, origin)).toMatchObject({
      issuer: 'https://login.runloyal.test/oauth2/aus_123-456',
      scopes: ['openid', 'profile', 'email', 'booking.read', 'booking.write'],
      postLogoutRedirectUri: `${origin}/signed-out`,
    })
  })

  it.each([
    undefined, '', 'https://your-okta-domain/oauth2/default', 'https://{yourOktaDomain}/oauth2/default',
    'https://example.com/oauth2/default', 'https://login.invalid/oauth2/default',
    'https://unit.okta.com', 'http://unit.okta.com/oauth2/default',
    'https://unit.auth0.com/oauth2/default', 'https://unit.okta.com/oauth2',
    'https://unit.okta.com/oauth2/default/', 'https://unit.okta.com/oauth2/default/v1',
    'https://user:secret@unit.okta.com/oauth2/default', 'https://unit.okta.com/oauth2/default?query=1',
    'https://unit.okta.com/oauth2/default#fragment', 'https://unit.okta.com/oauth2/%64efault',
  ])('rejects missing/placeholder/non-custom/unsafe issuer %s', (issuer) => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_ISSUER: issuer }, origin)).toThrow('VITE_OKTA_ISSUER')
  })

  it.each([undefined, '', 'your_okta_spa_client_id', '{clientId}', 'replace-me', 'not a client'])('rejects missing or placeholder client ID %s', (clientId) => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_CLIENT_ID: clientId }, origin)).toThrow('VITE_OKTA_CLIENT_ID')
  })

  it.each([
    'https://external.test/login/callback', `${origin}/`, `${origin}/other`, `${origin}/login/callback/`,
    'http://localhost:4000/login/callback', '/login/callback', '//localhost:3000/login/callback',
    `${origin}/login/callback?code=unsafe`, `${origin}/login/callback#fragment`,
    'http://user:secret@localhost:3000/login/callback',
  ])('rejects callbacks outside the exact same-origin callback route: %s', (uri) => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_REDIRECT_URI: uri }, origin)).toThrow('VITE_OKTA_REDIRECT_URI')
  })

  it.each(['https://external.test/', '//localhost:3000/', 'http://user:secret@localhost:3000/', 'javascript:alert(1)', 'your_logout_url'])('rejects external or malformed logout URI %s', (uri) => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_LOGOUT_URI: uri }, origin)).toThrow('VITE_OKTA_LOGOUT_URI')
  })

  it.each(['profile email', 'openid bad"scope', 'openid bad\\scope'])('rejects invalid OIDC scopes %s', (scopes) => {
    expect(() => readAuthConfig({ ...valid, VITE_OKTA_SCOPES: scopes }, origin)).toThrow()
  })
})

describe('safe post-login navigation', () => {
  it.each([
    ['/bookings?staff=1#upcoming', '/bookings?staff=1#upcoming'],
    [`${origin}/services/123`, '/services/123'], ['/', '/'],
  ])('keeps app-local destination %s', (uri, expected) => {
    expect(safeReturnTo(uri, origin)).toBe(expected)
  })

  it.each([
    undefined, '', 'bookings', 'https://external.test/bookings', '//external.test/bookings', '//localhost:3000/staff',
    'javascript:alert(1)', '/\\external.test', '/%2fexternal.test', '/%5cexternal.test',
    ' /bookings', '/bookings\n', '/%00path', '/%E0%A4%A',
    'http://user:secret@localhost:3000/bookings', '/login/callback', '/login/callback/?code=unsafe',
    '/foo/../login/callback',
  ])('falls back safely for unsafe or callback destination %s', (uri) => {
    expect(safeReturnTo(uri, origin)).toBe('/calendar')
  })
})
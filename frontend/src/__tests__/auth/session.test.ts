import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { OktaAuth, Tokens } from '@okta/okta-auth-js'

function createTokens(label = 'initial'): Required<Tokens> {
  const issuer = 'https://test.okta.invalid/oauth2/default'
  const common = {
    expiresAt: 4_000_000_000,
    authorizeUrl: `${issuer}/v1/authorize`,
    scopes: ['openid', 'profile', 'email'],
  }
  return {
    idToken: {
      ...common, idToken: `${label}-id-token`, issuer, clientId: 'test-client', claims: { sub: 'test-user' },
    },
    accessToken: {
      ...common, accessToken: `${label}-access-token`, tokenType: 'Bearer',
      userinfoUrl: `${issuer}/v1/userinfo`, claims: { sub: 'test-user' },
    },
    refreshToken: {
      ...common, refreshToken: `${label}-refresh-token`, issuer, tokenUrl: `${issuer}/v1/token`,
    },
  }
}

function createClient(tokens: Tokens = {}) {
  const getTokensSync = vi.fn<() => Tokens>().mockReturnValue(tokens)
  // The helper only consumes getTokensSync; do not construct a network-capable SDK.
  const client = { tokenManager: { getTokensSync } } as unknown as OktaAuth
  return { client, getTokensSync }
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  vi.resetModules()
})

describe('persisted explicit logout', () => {
  it('restores the logout gate on a fresh page/module load', async () => {
    sessionStorage.setItem('runloyal:logged-out', 'true')
    vi.resetModules()
    const { getAuthSession, isTokenAccessBlocked } = await import('@/auth/session')
    expect(getAuthSession().loggedOut).toBe(true)
    expect(isTokenAccessBlocked()).toBe(true)
  })

  it.each([null, 'false', 'unrelated-value'])('does not lock a fresh module for marker %s', async (marker) => {
    if (marker !== null) sessionStorage.setItem('runloyal:logged-out', marker)
    const { getAuthSession, isTokenAccessBlocked } = await import('@/auth/session')
    expect(getAuthSession()).toEqual({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
    expect(isTokenAccessBlocked()).toBe(false)
  })

  it('persists only the logout flag and preserves unrelated storage through successful sign-in', async () => {
    sessionStorage.setItem('unrelated-preference', 'keep-session')
    localStorage.setItem('unrelated-preference', 'keep-local')
    const { completeSignIn, getAuthSession, isTokenAccessBlocked, updateAuthSession } = await import('@/auth/session')
    updateAuthSession({ loggedOut: true, error: 'Previous failure' })
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')
    updateAuthSession({ isLoggingIn: true })
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')
    expect(isTokenAccessBlocked()).toBe(true)

    completeSignIn()
    expect(getAuthSession()).toEqual({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
    expect(isTokenAccessBlocked()).toBe(false)
    expect(sessionStorage.getItem('runloyal:logged-out')).toBeNull()
    expect(sessionStorage.getItem('unrelated-preference')).toBe('keep-session')
    expect(localStorage.getItem('unrelated-preference')).toBe('keep-local')
    expect(localStorage.getItem('runloyal:logged-out')).toBeNull()
  })

  it.each(['loggedOut', 'isLoggingOut', 'isLoggingIn'] as const)('blocks token access independently while %s', async (flag) => {
    const { isTokenAccessBlocked, updateAuthSession } = await import('@/auth/session')
    updateAuthSession({ [flag]: true })
    expect(isTokenAccessBlocked()).toBe(true)
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe(flag === 'loggedOut' ? 'true' : null)
    updateAuthSession({ [flag]: false })
    expect(isTokenAccessBlocked()).toBe(false)
  })

  it('tolerates unavailable sessionStorage at module load and maintains the in-memory gate', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('Storage blocked') })
    const { completeSignIn, getAuthSession, isTokenAccessBlocked, updateAuthSession } = await import('@/auth/session')
    expect(getAuthSession().loggedOut).toBe(false)
    updateAuthSession({ loggedOut: true })
    expect(getAuthSession().loggedOut).toBe(true)
    expect(isTokenAccessBlocked()).toBe(true)
    completeSignIn()
    expect(getAuthSession().loggedOut).toBe(false)
    expect(isTokenAccessBlocked()).toBe(false)
  })

  it('keeps working in memory when storage writes or removals reject', async () => {
    const { completeSignIn, getAuthSession, isTokenAccessBlocked, updateAuthSession } = await import('@/auth/session')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked') })
    updateAuthSession({ loggedOut: true, error: 'Sign-out failure' })
    expect(getAuthSession().loggedOut).toBe(true)
    expect(isTokenAccessBlocked()).toBe(true)
    completeSignIn()
    expect(getAuthSession()).toMatchObject({ loggedOut: false, isLoggingIn: false, error: null })
    expect(isTokenAccessBlocked()).toBe(false)
  })
})

describe('volatile per-client logout snapshots', () => {
  it('retains all token objects after the SDK cache is emptied without persisting them', async () => {
    const { rememberLogoutTokens } = await import('@/auth/session')
    const tokens = createTokens()
    const { client, getTokensSync } = createClient(tokens)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const initial = rememberLogoutTokens(client)
    expect(initial).toEqual(tokens)
    expect(initial).not.toBe(tokens)
    getTokensSync.mockReturnValue({})

    const retry = rememberLogoutTokens(client)
    expect(retry.idToken).toBe(tokens.idToken)
    expect(retry.accessToken).toBe(tokens.accessToken)
    expect(retry.refreshToken).toBe(tokens.refreshToken)
    expect(getTokensSync).toHaveBeenCalledTimes(2)
    expect(setItem).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it.each(['idToken', 'accessToken', 'refreshToken'] as const)('prefers the newest %s while retaining other drained snapshots', async (kind) => {
    const { rememberLogoutTokens } = await import('@/auth/session')
    const previous = createTokens()
    const renewed = createTokens('renewed')
    const { client, getTokensSync } = createClient(previous)
    rememberLogoutTokens(client)
    const current: Tokens = { [kind]: renewed[kind] }
    getTokensSync.mockReturnValue(current)

    const merged = rememberLogoutTokens(client)
    expect(merged).toEqual({ ...previous, ...current })
    expect(merged[kind]).toBe(renewed[kind])
    expect(current).toEqual({ [kind]: renewed[kind] }) // Do not mutate the SDK's return value.
  })

  it('isolates snapshots between SDK instances and forgets only the specified client', async () => {
    const { forgetLogoutTokens, rememberLogoutTokens } = await import('@/auth/session')
    const firstTokens = createTokens('first')
    const secondTokens = createTokens('second')
    const first = createClient(firstTokens)
    const second = createClient()
    rememberLogoutTokens(first.client)
    expect(rememberLogoutTokens(second.client)).toEqual({
      idToken: undefined, accessToken: undefined, refreshToken: undefined,
    })
    second.getTokensSync.mockReturnValue(secondTokens)
    rememberLogoutTokens(second.client)
    first.getTokensSync.mockReturnValue({})
    second.getTokensSync.mockReturnValue({})

    forgetLogoutTokens(first.client)
    expect(rememberLogoutTokens(first.client)).toEqual({
      idToken: undefined, accessToken: undefined, refreshToken: undefined,
    })
    expect(rememberLogoutTokens(second.client)).toEqual(secondTokens)
  })

  it('does not restore token snapshots on a fresh module load even when the logout gate persists', async () => {
    const original = await import('@/auth/session')
    const { client, getTokensSync } = createClient(createTokens())
    original.rememberLogoutTokens(client)
    original.updateAuthSession({ loggedOut: true })
    getTokensSync.mockReturnValue({})
    vi.resetModules()

    const reloaded = await import('@/auth/session')
    expect(reloaded.getAuthSession().loggedOut).toBe(true)
    expect(reloaded.rememberLogoutTokens(client)).toEqual({
      idToken: undefined, accessToken: undefined, refreshToken: undefined,
    })
    expect(sessionStorage.length).toBe(1)
    expect(localStorage.length).toBe(0)
  })
})
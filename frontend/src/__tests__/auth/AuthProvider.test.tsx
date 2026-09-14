import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { AuthState, OktaAuth, OktaAuthOptions } from '@okta/okta-auth-js'
import { AuthProvider } from '@/auth/AuthProvider'
import { LoginCallback } from '@/auth/LoginCallback'
import { getOktaClient } from '@/auth/okta'
import { readAuthConfig } from '@/auth/config'
import { getAuthSession, updateAuthSession } from '@/auth/session'

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  getOrRenewAccessToken: vi.fn<() => Promise<string | null>>(),
  unregister: vi.fn(),
  registerTokenGetter: vi.fn(),
  handleLoginRedirect: vi.fn<() => Promise<void>>(),
  start: vi.fn<() => Promise<void>>(),
  state: { isAuthenticated: true } as AuthState | null,
  subscribers: new Set<(state: AuthState) => void>(),
  client: undefined as OktaAuth | undefined,
}))
// Real okta-react Security and LoginCallback; only the network-capable Auth JS
// instance is modeled. This verifies the installed React SDK calls its real APIs.
vi.mock('@okta/okta-auth-js', async (importOriginal) => ({
  ...await importOriginal<typeof import('@okta/okta-auth-js')>(),
  OktaAuth: function (options: OktaAuthOptions) {
    mocks.construct(options)
    const client = {
      options: { ...options },
      _oktaUserAgent: { addEnvironment: vi.fn(), getVersion: () => '7.11.1' },
      authStateManager: {
        getAuthState: () => mocks.state,
        subscribe: (fn: (state: AuthState) => void) => { mocks.subscribers.add(fn) },
        unsubscribe: (fn: (state: AuthState) => void) => { mocks.subscribers.delete(fn) },
      },
      start: mocks.start,
      getOrRenewAccessToken: mocks.getOrRenewAccessToken,
      handleLoginRedirect: mocks.handleLoginRedirect,
      isLoginRedirect: () => true,
      idx: { isInteractionRequired: () => false },
    } as unknown as OktaAuth
    mocks.client = client
    return client
  },
}))
vi.mock('@/api/client', () => ({ registerTokenGetter: mocks.registerTokenGetter }))

let configSequence = 0
beforeEach(() => {
  vi.stubEnv('VITE_OKTA_ISSUER', 'https://unit.okta.com/oauth2/default')
  vi.stubEnv('VITE_OKTA_CLIENT_ID', `spa-unit-${++configSequence}`)
  vi.stubEnv('VITE_OKTA_REDIRECT_URI', '')
  vi.stubEnv('VITE_OKTA_LOGOUT_URI', '')
  vi.stubEnv('VITE_OKTA_SCOPES', '')
  updateAuthSession({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
  mocks.state = { isAuthenticated: true }
  mocks.subscribers.clear()
  mocks.construct.mockReset()
  mocks.start.mockReset().mockResolvedValue(undefined)
  mocks.handleLoginRedirect.mockReset().mockResolvedValue(undefined)
  mocks.getOrRenewAccessToken.mockReset().mockResolvedValue('mock-access-token')
  mocks.unregister.mockReset()
  mocks.registerTokenGetter.mockReset().mockReturnValue(mocks.unregister)
})

afterEach(() => { cleanup(); vi.unstubAllEnvs() })

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
}

function mount() {
  return render(<MemoryRouter><AuthProvider><div>Application</div><LocationProbe /></AuthProvider></MemoryRouter>)
}

function getter() {
  return mocks.registerTokenGetter.mock.calls[0][0] as () => Promise<string | null>
}

describe('Okta Security configuration and token bridge', () => {
  it('shows setup guidance instead of starting authentication with missing configuration', () => {
    vi.stubEnv('VITE_OKTA_ISSUER', '')
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication configuration required')
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_OKTA_ISSUER')
    expect(screen.queryByText('Application')).not.toBeInTheDocument()
    expect(mocks.registerTokenGetter).not.toHaveBeenCalled()
    expect(mocks.construct).not.toHaveBeenCalled()
  })

  it('reports a safe setup error if the SDK cannot initialize session storage', () => {
    mocks.construct.mockImplementation(() => { throw new Error('unsafe SDK/config details') })
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('allow browser session storage')
    expect(screen.getByRole('alert')).not.toHaveTextContent('unsafe SDK/config details')
    expect(mocks.registerTokenGetter).not.toHaveBeenCalled()
  })

  it('uses a stable app-scoped session-only PKCE client without active or passive automatic renewal', () => {
    const view = render(<StrictMode><MemoryRouter><AuthProvider><div>Application</div></AuthProvider></MemoryRouter></StrictMode>)
    view.rerender(<StrictMode><MemoryRouter><AuthProvider><div>Updated</div></AuthProvider></MemoryRouter></StrictMode>)
    expect(mocks.construct).toHaveBeenCalledOnce()
    expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({
      issuer: 'https://unit.okta.com/oauth2/default',
      clientId: `spa-unit-${configSequence}`,
      redirectUri: `${window.location.origin}/login/callback`,
      postLogoutRedirectUri: `${window.location.origin}/`,
      scopes: ['openid', 'profile', 'email'], pkce: true, responseType: 'code',
      transactionManager: { enableSharedStorage: false },
      storageManager: expect.objectContaining({ token: { storageTypes: ['sessionStorage'] } }),
      tokenManager: expect.objectContaining({ autoRenew: false, autoRemove: false, syncStorage: false }),
      services: { autoRenew: false, autoRemove: false, syncStorage: false, renewOnTabActivation: false },
    }))
    const first = getOktaClient(readAuthConfig())
    expect(first).toBe(mocks.client)
    const key = first.options.tokenManager?.storageKey
    expect(key).toContain('runloyal:okta:')
    const otherClient = getOktaClient({ ...readAuthConfig(), clientId: 'another-spa' })
    const otherIssuer = getOktaClient({ ...readAuthConfig(), issuer: 'https://unit.okta.com/oauth2/another' })
    expect(otherClient.options.tokenManager?.storageKey).not.toBe(key)
    expect(otherIssuer.options.tokenManager?.storageKey).not.toBe(key)
    expect(mocks.handleLoginRedirect).not.toHaveBeenCalled()
  })

  it.each(['loggedOut', 'isLoggingOut', 'isLoggingIn'] as const)('suppresses token access while %s and unregisters on unmount', async (flag) => {
    updateAuthSession({ [flag]: true })
    const view = mount()
    expect(await getter()()).toBeNull()
    expect(mocks.getOrRenewAccessToken).not.toHaveBeenCalled()
    view.unmount()
    expect(mocks.unregister).toHaveBeenCalledOnce()
    expect(mocks.subscribers.size).toBe(0)
  })

  it.each(['logout', 'unmount'])('discards a token that resolves after %s', async (action) => {
    let resolve!: (token: string) => void
    mocks.getOrRenewAccessToken.mockReturnValue(new Promise<string>((done) => { resolve = done }))
    const view = mount()
    const token = getter()()
    if (action === 'logout') updateAuthSession({ loggedOut: true })
    else view.unmount()
    resolve('late-token')
    expect(await token).toBeNull()
  })

  it('returns null when access-token retrieval fails without leaking SDK errors', async () => {
    mocks.getOrRenewAccessToken.mockRejectedValue(new Error('offline'))
    mount()
    expect(await getter()()).toBeNull()
  })

  it.each([
    ['/bookings?staff=1#upcoming', '/bookings?staff=1#upcoming'],
    [`${window.location.origin}/staff?sort=name`, '/staff?sort=name'],
    ['https://external.invalid/private', '/calendar'],
    ['//external.invalid/private', '/calendar'],
    ['/login/callback', '/calendar'],
    [undefined, '/calendar'],
  ])('restores a safe local destination for %s only via the successful SDK callback', async (originalUri, expected) => {
    updateAuthSession({ loggedOut: true, isLoggingIn: true })
    mount()
    expect(getAuthSession().loggedOut).toBe(true)
    const client = mocks.client!
    await act(async () => { await client.options.restoreOriginalUri?.(client, originalUri) })
    expect(screen.getByTestId('location')).toHaveTextContent(expected)
    expect(getAuthSession()).toMatchObject({ loggedOut: false, isLoggingIn: false })
    expect(sessionStorage.getItem('runloyal:logged-out')).toBeNull()
    expect(await getter()()).toBe('mock-access-token')
  })

  it('does not release the gate when callback auth state is unauthenticated or logout is pending', async () => {
    updateAuthSession({ loggedOut: true })
    mocks.state = { isAuthenticated: false }
    mount()
    const client = mocks.client!
    await expect(client.options.restoreOriginalUri?.(client, '/bookings')).rejects.toThrow('Sign-in was not completed')
    expect(getAuthSession().loggedOut).toBe(true)
    mocks.state = { isAuthenticated: true }
    updateAuthSession({ isLoggingOut: true })
    await expect(client.options.restoreOriginalUri?.(client, '/bookings')).rejects.toThrow('Sign-in was not completed')
    expect(getAuthSession().loggedOut).toBe(true)
  })

  it('lets the actual SDK LoginCallback handle the redirect once, then unlocks and restores the route', async () => {
    let finish!: () => void
    const parsed = new Promise<void>((resolve) => { finish = resolve })
    mocks.state = null
    mocks.handleLoginRedirect.mockImplementation(async () => {
      await parsed // Model Auth JS parse/verify/store finishing; no network.
      const state = { isAuthenticated: true }
      mocks.state = state
      mocks.subscribers.forEach((listener) => listener(state))
      const client = mocks.client!
      await client.options.restoreOriginalUri?.(client, '/bookings?staff=1')
    })
    updateAuthSession({ loggedOut: true, isLoggingIn: true })
    render(<StrictMode><MemoryRouter initialEntries={['/login/callback?code=test&state=test']}>
      <AuthProvider><Routes>
        <Route path="/login/callback" element={<LoginCallback />} />
        <Route path="*" element={<div>Restored app</div>} />
      </Routes><LocationProbe /></AuthProvider>
    </MemoryRouter></StrictMode>)
    expect(screen.getByText('Completing sign in…')).toBeInTheDocument()
    expect(mocks.handleLoginRedirect).toHaveBeenCalledOnce()
    expect(mocks.handleLoginRedirect).toHaveBeenCalledWith()
    expect(getAuthSession().loggedOut).toBe(true)
    await act(async () => { finish(); await parsed })
    await waitFor(() => expect(screen.getByText('Restored app')).toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent('/bookings?staff=1')
    expect(getAuthSession().loggedOut).toBe(false)
    expect(getAuthSession().isLoggingIn).toBe(false)
    expect(sessionStorage.getItem('runloyal:logged-out')).toBeNull()
    expect(mocks.handleLoginRedirect).toHaveBeenCalledOnce()
  })
})
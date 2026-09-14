import { StrictMode, type ReactNode } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, type AxiosAdapter } from 'axios'
import type { AuthState, SignoutOptions, Tokens } from '@okta/okta-auth-js'
import { AuthProvider } from '@/auth/AuthProvider'
import { useAuth } from '@/auth/useAuth'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { TopBar } from '@/components/layout/TopBar'
import { apiClient, cancelApiRequests, registerTokenGetter } from '@/api/client'
import { completeSignIn, getAuthSession, updateAuthSession } from '@/auth/session'

const sdk = vi.hoisted(() => {
  const createOktaAuth = () => ({
    options: { postLogoutRedirectUri: 'http://localhost:3000/' },
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    signInWithRedirect: vi.fn<(options?: { originalUri?: string }) => Promise<void>>().mockResolvedValue(undefined),
    signOut: vi.fn<(options?: SignoutOptions) => Promise<boolean>>().mockResolvedValue(true),
    getOrRenewAccessToken: vi.fn<() => Promise<string | undefined>>(),
    getIdToken: vi.fn<() => string | undefined>(),
    tokenManager: {
      getTokensSync: vi.fn<() => Tokens>(),
      clear: vi.fn<() => void>(),
    },
  })
  return { authState: null as AuthState | null, oktaAuth: createOktaAuth(), createOktaAuth }
})
vi.mock('@okta/okta-react', () => ({
  useOktaAuth: () => ({ oktaAuth: sdk.oktaAuth, authState: sdk.authState }),
  Security: ({ children }: { children: ReactNode }) => children,
}))
// Exercise the real TokenBridge without constructing an SDK client or logging in.
vi.mock('@/auth/okta', () => ({ getOktaClient: () => sdk.oktaAuth }))
vi.mock('@/auth/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/auth/config')>(),
  readAuthConfig: () => ({
    issuer: 'https://test.okta.invalid/oauth2/default',
    clientId: 'test-client',
    scopes: ['openid', 'profile', 'email'],
    redirectUri: 'http://localhost:3000/login/callback',
    postLogoutRedirectUri: sdk.oktaAuth.options.postLogoutRedirectUri,
  }),
}))
vi.mock('@/hooks/useMe', () => ({ useMe: () => ({ data: { tenantName: 'Test tenant' } }) }))

function createTokens(label = 'initial'): Required<Tokens> {
  const issuer = 'https://test.okta.invalid/oauth2/default'
  const common = {
    expiresAt: 4_000_000_000,
    authorizeUrl: `${issuer}/v1/authorize`,
    scopes: ['openid', 'profile', 'email'],
  }
  return {
    idToken: {
      ...common, idToken: `${label}-id-token`, issuer, clientId: 'test-client',
      claims: { sub: 'test-user', name: 'Test user', email: 'test@example.invalid' },
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

function signOutOptions(tokens: Tokens): SignoutOptions {
  return {
    ...tokens,
    postLogoutRedirectUri: sdk.oktaAuth.options.postLogoutRedirectUri,
    clearTokensBeforeRedirect: true,
    revokeAccessToken: true,
    revokeRefreshToken: true,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

let queryClient: QueryClient
let unregister: (() => void) | undefined
let cachedTokens: Tokens
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
function SdkWrapper({ children }: { children: ReactNode }) {
  return <Wrapper><MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter></Wrapper>
}
function ProtectedApp() {
  return <ProtectedRoute><TopBar /><div>Private bookings</div></ProtectedRoute>
}

beforeEach(() => {
  // A fresh client also isolates the session module's per-client WeakMap.
  sdk.oktaAuth = sdk.createOktaAuth()
  cachedTokens = createTokens()
  sdk.authState = { isAuthenticated: true, ...cachedTokens }
  sdk.oktaAuth.tokenManager.getTokensSync.mockImplementation(() => cachedTokens)
  sdk.oktaAuth.tokenManager.clear.mockImplementation(() => { cachedTokens = {} })
  sdk.oktaAuth.getOrRenewAccessToken.mockImplementation(async () => cachedTokens.accessToken?.accessToken)
  sdk.oktaAuth.getIdToken.mockImplementation(() => cachedTokens.idToken?.idToken)
  updateAuthSession({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

afterEach(() => {
  cleanup()
  unregister?.()
  unregister = undefined
  cancelApiRequests()
  queryClient.clear()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  updateAuthSession({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
})

describe('Okta sign-out', () => {
  it.each([false, true])('keeps the gate closed on final cache-clear failure (SDK also failed: %s)', async (sdkFailed) => {
    if (sdkFailed) sdk.oktaAuth.signOut.mockRejectedValue(new Error('SDK failure'))
    sdk.oktaAuth.tokenManager.clear
      .mockImplementationOnce(() => { cachedTokens = {} })
      .mockImplementationOnce(() => { throw new Error('Storage failure') })
    queryClient.setQueryData(['me'], { private: true })
    const { result } = renderHook(useAuth, { wrapper: Wrapper })

    await act(async () => {
      await expect(result.current.logout()).rejects.toThrow(sdkFailed ? 'SDK failure' : 'Storage failure')
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoggingOut).toBe(false)
    expect(result.current.error).toContain('app remains locked')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('handles TopBar logout failure when rendered without a protected-route parent', async () => {
    sdk.oktaAuth.signOut.mockRejectedValue(new Error('SDK failure'))
    render(<TopBar />, { wrapper: Wrapper })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Test user/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out could not be completed')
    expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.tokenManager.clear).toHaveBeenCalledTimes(2)
    expect(cachedTokens).toEqual({})
  })

  it('cancels queries, clears both caches, and supplies snapshots to native SDK sign-out after clearing tokens', async () => {
    const order: string[] = []
    const tokens = cachedTokens
    const cacheKey = 'runloyal:okta:test-issuer:test-client'
    sessionStorage.setItem(cacheKey, JSON.stringify(tokens))
    sessionStorage.setItem('unrelated-preference', 'keep-session')
    localStorage.setItem('unrelated-preference', 'keep')
    queryClient.setQueryData(['me'], { private: true })
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['private-mutation'] })
    let querySignal: AbortSignal | undefined
    const fetching = queryClient.fetchQuery({
      queryKey: ['pending'],
      queryFn: ({ signal }) => {
        querySignal = signal
        return new Promise(() => {})
      },
    }).catch(() => undefined)
    sdk.oktaAuth.stop.mockImplementation(async () => { order.push('stop') })
    sdk.oktaAuth.tokenManager.getTokensSync.mockImplementation(() => {
      order.push('snapshot')
      return cachedTokens
    })
    sdk.oktaAuth.tokenManager.clear.mockImplementation(() => {
      // Model only this SDK client's cache removal, never global storage clearing.
      cachedTokens = {}
      sessionStorage.removeItem(cacheKey)
      order.push('clear')
    })
    sdk.oktaAuth.signOut.mockImplementation(async (options) => {
      expect(querySignal?.aborted).toBe(true)
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
      expect(cachedTokens).toEqual({})
      expect(options).toEqual(signOutOptions(tokens))
      expect(options?.idToken).toBe(tokens.idToken)
      expect(options?.accessToken).toBe(tokens.accessToken)
      expect(options?.refreshToken).toBe(tokens.refreshToken)
      order.push('sign-out')
      return true // Native SDK redirect/revocation is mocked; no live Okta traffic.
    })
    const { result } = renderHook(useAuth, { wrapper: Wrapper })
    await act(async () => { await result.current.logout() })
    await fetching
    expect(order).toEqual(['stop', 'snapshot', 'clear', 'sign-out', 'clear'])
    expect(sessionStorage.getItem(cacheKey)).toBeNull()
    expect(sessionStorage.getItem('unrelated-preference')).toBe('keep-session')
    expect(localStorage.getItem('unrelated-preference')).toBe('keep')
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toEqual({})
    expect(result.current.isLoggingOut).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it.each(['SDK rejection', 'boolean false'])('keeps UI locked and displays recovery after %s', async (failure) => {
    if (failure === 'SDK rejection') sdk.oktaAuth.signOut.mockRejectedValue(new Error('SDK failure'))
    else sdk.oktaAuth.signOut.mockResolvedValue(false)
    queryClient.setQueryData(['me'], { private: true })
    render(<ProtectedApp />, { wrapper: Wrapper })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Test user/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Okta session may still be active')
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(getAuthSession().loggedOut).toBe(true)
    expect(sdk.authState?.isAuthenticated).toBe(true) // Deliberately stale SDK state.
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.tokenManager.clear).toHaveBeenCalledTimes(2)
    expect(cachedTokens).toEqual({})
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('retries a failed logout explicitly without restoring protected UI', async () => {
    sdk.oktaAuth.signOut.mockRejectedValueOnce(new Error('Offline'))
    updateAuthSession({ loggedOut: true })
    render(<ProtectedApp />, { wrapper: Wrapper })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry sign out' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry sign out' }))
    await waitFor(() => expect(sdk.oktaAuth.signOut).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getAuthSession().isLoggingOut).toBe(false))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
  })

  it.each(['rejection', 'false'])('shares volatile snapshots with a remounted hook for explicit retry after %s', async (failure) => {
    const tokens = cachedTokens
    if (failure === 'rejection') sdk.oktaAuth.signOut.mockRejectedValueOnce(new Error('Offline'))
    else sdk.oktaAuth.signOut.mockResolvedValueOnce(false)
    const view = render(<ProtectedApp />, { wrapper: Wrapper })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Test user/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    // TopBar's initiating hook has already unmounted when the shared gate closes.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(cachedTokens).toEqual({})
    expect(sdk.oktaAuth.signOut).toHaveBeenNthCalledWith(1, signOutOptions(tokens))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(1)
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')

    view.unmount()
    render(<ProtectedApp />, { wrapper: Wrapper })
    expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Retry sign out' }))
    await waitFor(() => expect(sdk.oktaAuth.signOut).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getAuthSession().isLoggingOut).toBe(false))
    expect(sdk.oktaAuth.signOut).toHaveBeenNthCalledWith(2, signOutOptions(tokens))
    const retryOptions = sdk.oktaAuth.signOut.mock.calls[1][0]
    expect(retryOptions?.idToken).toBe(tokens.idToken)
    expect(retryOptions?.accessToken).toBe(tokens.accessToken)
    expect(retryOptions?.refreshToken).toBe(tokens.refreshToken)
    expect(sdk.oktaAuth.tokenManager.getTokensSync).toHaveBeenCalledTimes(2)
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()

    // A confirmed SDK logout must also forget the volatile snapshots.
    await user.click(screen.getByRole('button', { name: 'Retry sign out' }))
    await waitFor(() => expect(sdk.oktaAuth.signOut).toHaveBeenCalledTimes(3))
    expect(sdk.oktaAuth.signOut.mock.calls[2][0]).toEqual(signOutOptions({
      idToken: undefined, accessToken: undefined, refreshToken: undefined,
    }))
  })

  it('deduplicates logout across hook consumers and disables recovery while pending', async () => {
    const pending = deferred<boolean>()
    sdk.oktaAuth.signOut.mockReturnValue(pending.promise)
    const { result } = renderHook(() => [useAuth(), useAuth()], { wrapper: Wrapper })
    render(<ProtectedApp />, { wrapper: Wrapper })
    let loggingOut!: Promise<void>
    act(() => {
      loggingOut = result.current[0].logout()
      void result.current[1].logout()
    })
    expect(screen.getByText('Signing out…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeDisabled()
    await waitFor(() => expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce())
    await act(async () => { pending.resolve(true); await loggingOut })
    expect(sdk.oktaAuth.stop).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.tokenManager.getTokensSync).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce()
  })

  it('remains locked even if sessionStorage is unavailable', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('Storage blocked') })
    sdk.oktaAuth.signOut.mockRejectedValue(new Error('SDK failure'))
    const { result } = renderHook(useAuth, { wrapper: Wrapper })
    await act(async () => { await expect(result.current.logout()).rejects.toThrow('SDK failure') })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.error).toContain('app remains locked')
    expect(sdk.oktaAuth.tokenManager.clear).toHaveBeenCalledTimes(2)
    expect(cachedTokens).toEqual({})
  })
})

describe('sign-in and stale SDK authentication', () => {
  it('locks protected content, cancels queries, and clears both caches after a real Axios 401 rejection', async () => {
    queryClient.setQueryData(['bookings'], [{ customerName: 'Private customer' }])
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['private-mutation'] })
    let querySignal: AbortSignal | undefined
    const fetching = queryClient.fetchQuery({
      queryKey: ['pending'],
      queryFn: ({ signal }) => {
        querySignal = signal
        return new Promise(() => {})
      },
    }).catch(() => undefined)
    unregister = registerTokenGetter(async () => 'access-token')
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, {
        data: { message: 'Expired access token' }, status: 401, statusText: 'Unauthorized', headers: {}, config,
      })
    })
    render(<ProtectedApp />, { wrapper: Wrapper })
    expect(screen.getByText('Private bookings')).toBeInTheDocument()
    await act(async () => {
      await expect(apiClient.get('/private', { adapter })).rejects.toMatchObject({
        name: 'AxiosError', response: { status: 401 },
      })
    })
    await fetching
    expect(adapter).toHaveBeenCalledOnce()
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer access-token')
    expect(querySignal?.aborted).toBe(true)
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('API session was rejected or expired')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(getAuthSession().loggedOut).toBe(true)
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.signOut).not.toHaveBeenCalled()
  })

  it('removes its session-expired listener on unmount without leaving a cache-clearing handler', () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const view = render(<ProtectedApp />, { wrapper: Wrapper })
    const registrations = addListener.mock.calls.filter(([name]) => name === 'runloyal:session-expired')
    expect(registrations).toHaveLength(1)
    view.unmount()
    expect(removeListener).toHaveBeenCalledWith('runloyal:session-expired', registrations[0][1])
    queryClient.setQueryData(['retained'], 'do not clear after unmount')
    act(() => { window.dispatchEvent(new CustomEvent('runloyal:session-expired')) })
    expect(getAuthSession().loggedOut).toBe(false)
    expect(queryClient.getQueryData(['retained'])).toBe('do not clear after unmount')
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
  })

  it('shows explicit sign-in instead of protected UI even while the stale SDK is loading', () => {
    updateAuthSession({ loggedOut: true })
    sdk.authState = null
    render(<ProtectedApp />, { wrapper: Wrapper })
    expect(screen.getByText('You are signed out.')).toBeInTheDocument()
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
  })

  it('keeps the logout flag during explicit sign-in until a successful callback', async () => {
    updateAuthSession({ loggedOut: true })
    render(<ProtectedApp />, { wrapper: Wrapper })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledOnce())
    expect(sdk.oktaAuth.start).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
    act(() => { completeSignIn() })
    expect(sessionStorage.getItem('runloyal:logged-out')).toBeNull()
    expect(screen.getByText('Private bookings')).toBeInTheDocument()
  })

  it('awaits an explicit SDK restart after logout before redirecting, and deduplicates login across hooks', async () => {
    const hook = renderHook(() => [useAuth(), useAuth()], { wrapper: Wrapper })
    await act(async () => { await hook.result.current[0].logout() })
    const started = deferred<void>()
    sdk.oktaAuth.start.mockReturnValue(started.promise)
    let signingIn!: Promise<void>
    act(() => {
      signingIn = hook.result.current[0].login()
      void hook.result.current[1].login()
      void hook.result.current[1].logout()
    })
    expect(sdk.oktaAuth.start).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.stop).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce()
    expect(getAuthSession()).toMatchObject({ loggedOut: true, isLoggingIn: true })
    expect(hook.result.current[0].user).toEqual({})
    await act(async () => { started.resolve(); await signingIn })
    expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledWith({
      originalUri: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    })
    expect(getAuthSession().loggedOut).toBe(true)
  })

  it.each(['start', 'redirect'])('handles %s rejection without repeated redirects and allows explicit retry', async (failure) => {
    sdk.authState = { isAuthenticated: false }
    if (failure === 'start') sdk.oktaAuth.start.mockRejectedValueOnce(new Error('Offline'))
    else sdk.oktaAuth.signInWithRedirect.mockRejectedValueOnce(new Error('Offline'))
    const view = render(<ProtectedApp />, { wrapper: Wrapper })
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in could not be started')
    view.rerender(<ProtectedApp />)
    expect(sdk.oktaAuth.start).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledTimes(failure === 'start' ? 0 : 1)
    expect(getAuthSession().loggedOut).toBe(true)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledTimes(failure === 'start' ? 1 : 2))
    expect(sdk.oktaAuth.start).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Private bookings')).not.toBeInTheDocument()
  })

  it('has stable callbacks and starts automatic login only once under StrictMode', async () => {
    const hook = renderHook(useAuth, { wrapper: Wrapper })
    const { login, logout } = hook.result.current
    sdk.authState = { ...sdk.authState, idToken: createTokens('updated').idToken }
    hook.rerender()
    expect(hook.result.current.login).toBe(login)
    expect(hook.result.current.logout).toBe(logout)
    sdk.authState = { isAuthenticated: false }
    const view = render(<StrictMode><ProtectedApp /></StrictMode>, { wrapper: Wrapper })
    view.rerender(<StrictMode><ProtectedApp /></StrictMode>)
    await waitFor(() => expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledOnce())
    view.rerender(<StrictMode><ProtectedApp /></StrictMode>)
    expect(sdk.oktaAuth.start).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.signInWithRedirect).toHaveBeenCalledOnce()
    expect(hook.result.current.login).toBe(login)
    expect(hook.result.current.logout).toBe(logout)
  })

  it('does not automatically retry an SDK callback error', () => {
    sdk.authState = { isAuthenticated: false, error: new Error('Callback failed') }
    render(<ProtectedApp />, { wrapper: Wrapper })
    expect(screen.getByRole('alert')).toHaveTextContent('Authentication failed')
    expect(sdk.oktaAuth.start).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.signInWithRedirect).not.toHaveBeenCalled()
  })
})

describe('API cancellation and token suppression', () => {
  it.each(['loggedOut', 'isLoggingOut', 'isLoggingIn'] as const)('never invokes the token getter or adapter while %s', async (flag) => {
    const token = vi.fn().mockResolvedValue('mock-token')
    unregister = registerTokenGetter(token)
    const adapter = vi.fn<AxiosAdapter>()
    updateAuthSession({ [flag]: true })
    await expect(apiClient.get('/private', { adapter })).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(token).not.toHaveBeenCalled()
    expect(adapter).not.toHaveBeenCalled()
  })

  it.each([true, false])('uses only the access token, never the display ID token (access token available: %s)', async (available) => {
    const tokens = createTokens()
    cachedTokens = available ? tokens : { idToken: tokens.idToken }
    sdk.authState = { isAuthenticated: available, ...cachedTokens }
    const { result } = renderHook(useAuth, { wrapper: SdkWrapper })
    expect(result.current.user).toEqual({
      name: 'Test user', email: 'test@example.invalid', sub: 'test-user',
    })
    const adapter = vi.fn<AxiosAdapter>(async (config) => ({
      data: 'ok', status: 200, statusText: 'OK', headers: {}, config,
    }))
    await apiClient.get('/private', { adapter })
    expect(sdk.oktaAuth.getOrRenewAccessToken).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.getIdToken).not.toHaveBeenCalled()
    const authorization = adapter.mock.calls[0][0].headers.Authorization
    expect(authorization).toBe(available ? `Bearer ${tokens.accessToken.accessToken}` : undefined)
    expect(authorization).not.toBe(`Bearer ${tokens.idToken.idToken}`)
  })

  it('stops SDK services before draining, captures renewed snapshots afterwards, and never sends the late token', async () => {
    const stopped = deferred<void>()
    const token = deferred<string>()
    const renewed = createTokens('renewed')
    const order: string[] = []
    sdk.oktaAuth.stop.mockImplementation(async () => {
      order.push('stop-started')
      await stopped.promise
      order.push('stop-completed')
    })
    sdk.oktaAuth.getOrRenewAccessToken.mockImplementation(async () => {
      const value = await token.promise
      // A renewal already in progress can write tokens after stop was requested.
      cachedTokens = renewed
      order.push('renewal-drained')
      return value
    })
    sdk.oktaAuth.tokenManager.getTokensSync.mockImplementation(() => {
      order.push('snapshot')
      return cachedTokens
    })
    sdk.oktaAuth.signOut.mockImplementation(async (options) => {
      expect(cachedTokens).toEqual({})
      expect(options).toEqual(signOutOptions(renewed))
      expect(options?.idToken).toBe(renewed.idToken)
      expect(options?.accessToken).toBe(renewed.accessToken)
      expect(options?.refreshToken).toBe(renewed.refreshToken)
      order.push('sign-out')
      return true
    })
    const { result } = renderHook(useAuth, { wrapper: SdkWrapper })
    const adapter = vi.fn<AxiosAdapter>()
    const request = apiClient.get('/private', { adapter }).catch((error) => error)
    await waitFor(() => expect(sdk.oktaAuth.getOrRenewAccessToken).toHaveBeenCalledOnce())
    let loggingOut!: Promise<void>
    act(() => { loggingOut = result.current.logout() })
    // This would fail if stop were delayed until after the pending token drained.
    expect(sdk.oktaAuth.stop).toHaveBeenCalledOnce()
    expect(sdk.oktaAuth.tokenManager.getTokensSync).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.tokenManager.clear).not.toHaveBeenCalled()
    await act(async () => { stopped.resolve() })
    expect(sdk.oktaAuth.signOut).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.tokenManager.getTokensSync).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.tokenManager.clear).not.toHaveBeenCalled()
    await act(async () => { token.resolve(renewed.accessToken.accessToken); await loggingOut })
    expect((await request).code).toBe('ERR_CANCELED')
    expect(adapter).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.signOut).toHaveBeenCalledOnce()
    expect(order).toEqual(['stop-started', 'stop-completed', 'renewal-drained', 'snapshot', 'sign-out'])
  })

  it('still drains tokens and clears the SDK cache when stopping services rejects', async () => {
    const token = deferred<string>()
    const getToken = vi.fn(() => token.promise)
    unregister = registerTokenGetter(getToken)
    const adapter = vi.fn<AxiosAdapter>()
    const request = apiClient.get('/private', { adapter }).catch((error) => error)
    await waitFor(() => expect(getToken).toHaveBeenCalledOnce())
    const failure = new Error('Stop failed')
    sdk.oktaAuth.stop.mockRejectedValue(failure)
    const { result } = renderHook(useAuth, { wrapper: Wrapper })
    let loggingOut!: Promise<unknown>
    act(() => { loggingOut = result.current.logout().catch((error: unknown) => error) })
    await act(async () => { await Promise.resolve() })
    expect(sdk.oktaAuth.tokenManager.clear).not.toHaveBeenCalled()
    await act(async () => { token.resolve('late-token'); expect(await loggingOut).toBe(failure) })
    expect((await request).code).toBe('ERR_CANCELED')
    expect(adapter).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.signOut).not.toHaveBeenCalled()
    expect(sdk.oktaAuth.tokenManager.clear).toHaveBeenCalledOnce()
    expect(cachedTokens).toEqual({})
    expect(result.current).toMatchObject({ loggedOut: true, isLoggingOut: false, isAuthenticated: false })
    expect(result.current.error).toContain('app remains locked')
  })

  it('aborts an in-flight cached mutation transport and rejects its late response even after sign-in', async () => {
    const response = deferred<void>()
    let signal: Parameters<AxiosAdapter>[0]['signal']
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      signal = config.signal
      await response.promise
      return { data: 'private response', status: 200, statusText: 'OK', headers: {}, config }
    })
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['private-mutation'],
      mutationFn: () => apiClient.post('/private', {}, { adapter }),
    })
    const request = mutation.execute(undefined).catch((error) => error)
    await waitFor(() => expect(adapter).toHaveBeenCalledOnce())
    const { result } = renderHook(useAuth, { wrapper: Wrapper })
    await act(async () => { await result.current.logout() })
    expect(signal?.aborted).toBe(true)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    // Even a newly authenticated session cannot revive an old request.
    act(() => { completeSignIn() })
    response.resolve()
    expect((await request).code).toBe('ERR_CANCELED')
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it('preserves caller cancellation and permits new requests after successful sign-in', async () => {
    const controller = new AbortController()
    controller.abort()
    const adapter = vi.fn<AxiosAdapter>(async (config) => ({ data: 'ok', status: 200, statusText: 'OK', headers: {}, config }))
    await expect(apiClient.get('/private', { signal: controller.signal, adapter })).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(adapter).not.toHaveBeenCalled()
    updateAuthSession({ loggedOut: true })
    cancelApiRequests()
    completeSignIn()
    unregister = registerTokenGetter(async () => 'new-token')
    await apiClient.get('/private', { adapter })
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer new-token')
  })
})
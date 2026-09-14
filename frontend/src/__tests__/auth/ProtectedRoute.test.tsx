import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import type { AuthState } from '@okta/okta-auth-js'
import { renderWithProviders as render } from '../testUtils'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import type { useAuth } from '@/auth/useAuth'
import { updateAuthSession } from '@/auth/session'

// Isolated rendering tests; SDK-backed flows are covered in AuthFlow.test.tsx.
const mockLogin = vi.fn().mockResolvedValue(undefined)
const mockLogout = vi.fn().mockResolvedValue(undefined)

const sdk = vi.hoisted(() => ({
  authState: null as AuthState | null,
  oktaAuth: {
    start: vi.fn(),
    stop: vi.fn(),
    signInWithRedirect: vi.fn(),
    signOut: vi.fn(),
  },
}))
vi.mock('@okta/okta-react', () => ({
  useOktaAuth: () => ({ oktaAuth: sdk.oktaAuth, authState: sdk.authState }),
}))

let mockAuthState: ReturnType<typeof useAuth>

vi.mock('@/auth/useAuth', () => ({ useAuth: () => mockAuthState }))

beforeEach(() => {
  mockLogin.mockReset().mockResolvedValue(undefined)
  mockLogout.mockReset().mockResolvedValue(undefined)
  sdk.authState = { isAuthenticated: false }
  mockAuthState = {
    isAuthenticated: false,
    isLoading: false,
    loggedOut: false,
    isLoggingOut: false,
    isLoggingIn: false,
    error: null,
    user: {},
    login: mockLogin,
    logout: mockLogout,
  }
  updateAuthSession({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
})

afterEach(() => {
  cleanup()
  updateAuthSession({ loggedOut: false, isLoggingOut: false, isLoggingIn: false, error: null })
})

describe('ProtectedRoute', () => {
  it('shows loading spinner when auth state is not yet resolved', () => {
    sdk.authState = null
    mockAuthState.isLoading = true
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText(/Authenticating/i)).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('starts Okta sign-in once when user is not authenticated, not on every render', () => {
    const view = render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    view.rerender(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>)
    expect(mockLogin).toHaveBeenCalledOnce()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user is authenticated', () => {
    sdk.authState = { isAuthenticated: true }
    mockAuthState.isAuthenticated = true
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('gives the explicit logout gate precedence over unresolved SDK state', () => {
    sdk.authState = null
    mockAuthState.isLoading = true
    mockAuthState.loggedOut = true
    render(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>)

    expect(screen.getByText('You are signed out.')).toBeInTheDocument()
    expect(screen.queryByText(/Authenticating/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeEnabled()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it.each([
    { phase: 'isLoggingOut', message: 'Signing out…' },
    { phase: 'isLoggingIn', message: 'Redirecting to sign in…' },
  ] as const)('disables recovery controls while $phase', ({ phase, message }) => {
    sdk.authState = { isAuthenticated: true }
    mockAuthState.loggedOut = true
    mockAuthState[phase] = true
    render(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>)

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeDisabled()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
    expect(mockLogout).not.toHaveBeenCalled()
  })

  it('renders a generic SDK callback error without automatically redirecting or leaking its details', () => {
    sdk.authState = { isAuthenticated: false, error: new Error('Sensitive callback details') }
    render(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>)

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication failed. Try Sign in again.')
    expect(screen.queryByText('Sensitive callback details')).not.toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('prefers the shared recovery error over an SDK error and stale authentication', () => {
    sdk.authState = { isAuthenticated: true, error: new Error('SDK callback details') }
    mockAuthState.loggedOut = true
    mockAuthState.error = 'This app remains locked. Retry sign out.'
    render(<ProtectedRoute><div>Protected Content</div></ProtectedRoute>)

    expect(screen.getByRole('alert')).toHaveTextContent(mockAuthState.error)
    expect(screen.queryByText('SDK callback details')).not.toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from '@/auth/ProtectedRoute'

// Mock Auth0 and the provider boundary
const mockSignInWithRedirect = vi.fn()

let mockAuthState: { isAuthenticated: boolean; isLoading?: boolean } = {
  isAuthenticated: false,
  isLoading: false,
}

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    isAuthenticated: mockAuthState.isAuthenticated,
    isLoading: mockAuthState.isLoading ?? false,
    loginWithRedirect: mockSignInWithRedirect,
  }),
}))

describe('ProtectedRoute', () => {
  it('shows loading spinner when auth state is not yet resolved', () => {
    mockAuthState = { isAuthenticated: false, isLoading: true }
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText(/Authenticating/i)).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('triggers signInWithRedirect when user is not authenticated', () => {
    mockAuthState = { isAuthenticated: false }
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockSignInWithRedirect).toHaveBeenCalled()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user is authenticated', () => {
    mockAuthState = { isAuthenticated: true }
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})

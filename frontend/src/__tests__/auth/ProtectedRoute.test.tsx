import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from '@/auth/ProtectedRoute'

// Mock the Okta provider boundary.
const mockLogin = vi.fn()

let mockAuthState: { isAuthenticated: boolean; isLoading?: boolean } = {
  isAuthenticated: false,
  isLoading: false,
}

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: mockAuthState.isAuthenticated,
    isLoading: mockAuthState.isLoading ?? false,
    login: mockLogin,
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

  it('starts Okta sign-in when user is not authenticated', () => {
    mockAuthState = { isAuthenticated: false }
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(mockLogin).toHaveBeenCalled()
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

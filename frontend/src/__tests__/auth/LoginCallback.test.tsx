import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { OktaAuth } from '@okta/okta-auth-js'
import { Security } from '@okta/okta-react'
import { LoginCallback } from '@/auth/LoginCallback'
import { getAuthSession, updateAuthSession } from '@/auth/session'

const handleLoginRedirect = vi.fn<() => Promise<void>>()
const restoreOriginalUri = vi.fn()
const isLoginRedirect = vi.fn()
// Keep the real installed React SDK callback. This fixture replaces only Auth JS.
const client = {
  options: {},
  _oktaUserAgent: { addEnvironment: vi.fn(), getVersion: () => '7.11.1' },
  authStateManager: { getAuthState: () => null, subscribe: vi.fn(), unsubscribe: vi.fn() },
  start: vi.fn().mockResolvedValue(undefined),
  handleLoginRedirect, isLoginRedirect,
  idx: { isInteractionRequired: () => false },
} as unknown as OktaAuth

beforeEach(() => {
  handleLoginRedirect.mockReset().mockRejectedValue(new Error('code=private&state=private'))
  restoreOriginalUri.mockReset()
  isLoginRedirect.mockReset().mockReturnValue(true)
  updateAuthSession({ loggedOut: true, isLoggingIn: true, isLoggingOut: false, error: null })
})

describe('real SDK callback failure handling', () => {
  it('renders a safe error on rejected parsing without releasing the gate or automatically retrying', async () => {
    const view = render(<StrictMode><Security oktaAuth={client} restoreOriginalUri={restoreOriginalUri}>
      <LoginCallback />
    </Security></StrictMode>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in could not be completed')
    expect(screen.getByRole('alert')).not.toHaveTextContent('private')
    expect(screen.getByRole('link', { name: 'Return to app' })).toHaveAttribute('href', '/')
    // The SDK renders the error before CallbackError's passive cleanup effect runs.
    await waitFor(() => expect(getAuthSession()).toMatchObject({ loggedOut: true, isLoggingIn: false }))
    expect(sessionStorage.getItem('runloyal:logged-out')).toBe('true')
    expect(handleLoginRedirect).toHaveBeenCalledOnce()
    expect(restoreOriginalUri).not.toHaveBeenCalled()
    view.rerender(<StrictMode><Security oktaAuth={client} restoreOriginalUri={restoreOriginalUri}>
      <LoginCallback />
    </Security></StrictMode>)
    expect(handleLoginRedirect).toHaveBeenCalledOnce()
  })

  it('offers recovery for a callback route without an OAuth response rather than hanging or unlocking', () => {
    isLoginRedirect.mockReturnValue(false)
    render(<Security oktaAuth={client} restoreOriginalUri={restoreOriginalUri}><LoginCallback /></Security>)
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in could not be completed')
    expect(handleLoginRedirect).not.toHaveBeenCalled()
    expect(restoreOriginalUri).not.toHaveBeenCalled()
    expect(getAuthSession()).toMatchObject({ loggedOut: true, isLoggingIn: false })
  })
})
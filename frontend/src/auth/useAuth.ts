import { useAuth0 } from '@auth0/auth0-react'

import { AUTH0_LOGOUT_URI } from './AuthProvider'

export interface AuthUser {
  name?: string
  email?: string
  sub?: string
}

export function useAuth() {
  const { isAuthenticated, isLoading, user: auth0User, loginWithRedirect, logout: auth0Logout } = useAuth0()

  const user: AuthUser = {
    name: auth0User?.name,
    email: auth0User?.email,
    sub: auth0User?.sub,
  }

  const logout = async () => {
    await auth0Logout({ logoutParams: { returnTo: AUTH0_LOGOUT_URI } })
  }

  const login = () => {
    void loginWithRedirect()
  }

  return { isAuthenticated, isLoading, user, logout, login }
}

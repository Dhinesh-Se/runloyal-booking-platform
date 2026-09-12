import { useContext } from 'react'
import { AuthContext } from './OktaProvider'

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside OktaProvider')
  return auth
}

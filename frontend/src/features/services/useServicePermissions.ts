import { useMe } from '@/hooks/useMe'

export function useServicePermissions() {
  const identity = useMe()
  return {
    isAdmin: identity.isSuccess && !identity.isError
      && identity.data?.role === 'TENANT_ADMIN' && identity.data.status === 'ACTIVE',
  }
}
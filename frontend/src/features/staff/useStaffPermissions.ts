import { useMe } from '@/hooks/useMe'

/** Unknown, inactive, and failed identities must never enable staff management. */
export function useStaffPermissions() {
  const identity = useMe()
  return {
    identity,
    canManage: identity.isSuccess && !identity.isError && !identity.isFetching
      && identity.data?.role === 'TENANT_ADMIN' && identity.data.status === 'ACTIVE',
  }
}
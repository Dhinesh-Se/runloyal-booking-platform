import { useMe } from '@/hooks/useMe'

/** Reading booking details remains available to staff; mutations are admin-only. */
export function useCanManageBookings() {
  const { data: me, isPending, isError } = useMe()
  return !isPending && !isError && me?.status === 'ACTIVE' && me.role === 'TENANT_ADMIN'
}
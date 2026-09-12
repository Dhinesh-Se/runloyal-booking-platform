import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/api/auth'

export const ME_QUERY_KEY = ['me'] as const

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: getMe,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  })
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s
      gcTime: 5 * 60_000,      // 5min
      retry: (failureCount, error) => {
        // Don't retry 401/403/404 — they are auth/logic errors
        if (typeof error === 'object' && error !== null && 'response' in error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403 || status === 404) return false
        }
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}

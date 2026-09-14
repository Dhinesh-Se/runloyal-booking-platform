import type { QueryClient } from '@tanstack/react-query'

/** Service duration/status and assignments all affect slot eligibility. */
export function invalidateServiceDependents(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['services'] }),
    client.invalidateQueries({ queryKey: ['service-assignments'] }),
    client.invalidateQueries({ queryKey: ['calendar'] }),
    // Also invalidate eligible-staff consumers when they use the shared prefix.
    client.invalidateQueries({ queryKey: ['available-staff'] }),
  ])
}
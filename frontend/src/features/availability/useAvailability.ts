import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAvailability, createAvailability, updateAvailability, deleteAvailability,
} from '@/api/availability'
import type { AvailabilityCommand } from '@/api/types'

export const AVAILABILITY_QUERY_KEY = (staffId: string) => ['availability', staffId] as const

export function useAvailabilityForStaff(staffId: string) {
  return useQuery({
    queryKey: AVAILABILITY_QUERY_KEY(staffId),
    queryFn: () => listAvailability(staffId),
    enabled: !!staffId,
  })
}

export function useCreateAvailability(staffId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (command: AvailabilityCommand) => createAvailability(staffId, command),
    onSuccess: () => qc.invalidateQueries({ queryKey: AVAILABILITY_QUERY_KEY(staffId) }),
  })
}

export function useUpdateAvailability(staffId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: AvailabilityCommand }) =>
      updateAvailability(staffId, id, command),
    onSuccess: () => qc.invalidateQueries({ queryKey: AVAILABILITY_QUERY_KEY(staffId) }),
  })
}

export function useDeleteAvailability(staffId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAvailability(staffId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: AVAILABILITY_QUERY_KEY(staffId) }),
  })
}

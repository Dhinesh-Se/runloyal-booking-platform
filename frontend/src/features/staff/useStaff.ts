import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  listStaff, createStaff, updateStaff, listAssignedStaff,
  assignStaffToService, unassignStaffFromService,
} from '@/api/staff'
import type { StaffCommand } from '@/api/types'

export const STAFF_QUERY_KEY = ['staff'] as const

/** Staff names/status and assignments are embedded in eligibility query results. */
function invalidateStaffDependents(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: STAFF_QUERY_KEY }),
    client.invalidateQueries({ queryKey: ['service-assignments'] }),
    client.invalidateQueries({ queryKey: ['calendar'] }),
    client.invalidateQueries({ queryKey: ['available-staff'] }),
  ])
}

export function useStaff() {
  return useQuery({ queryKey: STAFF_QUERY_KEY, queryFn: listStaff })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (command: StaffCommand) => createStaff(command),
    onSuccess: () => invalidateStaffDependents(qc),
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: StaffCommand }) =>
      updateStaff(id, command),
    onSuccess: () => invalidateStaffDependents(qc),
  })
}

export function useAssignStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, staffId }: { serviceId: string; staffId: string }) =>
      assignStaffToService(serviceId, staffId),
    onSuccess: () => invalidateStaffDependents(qc),
  })
}

export function useUnassignStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, staffId }: { serviceId: string; staffId: string }) =>
      unassignStaffFromService(serviceId, staffId),
    onSuccess: () => invalidateStaffDependents(qc),
  })
}

/** Read persisted service assignments rather than inferring them from a slot. */
export function useAssignments(serviceId: string) {
  const query = useQuery({
    queryKey: ['service-assignments', serviceId],
    queryFn: () => listAssignedStaff(serviceId),
    enabled: !!serviceId,
  })
  return {
    assignments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

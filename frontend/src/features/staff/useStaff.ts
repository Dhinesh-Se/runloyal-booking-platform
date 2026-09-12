import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listStaff, createStaff, updateStaff, listAssignedStaff,
  assignStaffToService, unassignStaffFromService,
} from '@/api/staff'
import type { StaffCommand } from '@/api/types'

export const STAFF_QUERY_KEY = ['staff'] as const

export function useStaff() {
  return useQuery({ queryKey: STAFF_QUERY_KEY, queryFn: listStaff })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (command: StaffCommand) => createStaff(command),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY }),
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: StaffCommand }) =>
      updateStaff(id, command),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY }),
  })
}

export function useAssignStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, staffId }: { serviceId: string; staffId: string }) =>
      assignStaffToService(serviceId, staffId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
      qc.invalidateQueries({ queryKey: ['service-assignments', variables.serviceId] })
    },
  })
}

export function useUnassignStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, staffId }: { serviceId: string; staffId: string }) =>
      unassignStaffFromService(serviceId, staffId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
      qc.invalidateQueries({ queryKey: ['service-assignments', variables.serviceId] })
    },
  })
}

/** Read persisted service assignments rather than inferring them from a slot. */
export function useAssignments(serviceId: string) {
  const query = useQuery({
    queryKey: ['service-assignments', serviceId],
    queryFn: () => listAssignedStaff(serviceId),
    enabled: !!serviceId,
  })
  return { assignments: query.data ?? [], isLoading: query.isLoading }
}

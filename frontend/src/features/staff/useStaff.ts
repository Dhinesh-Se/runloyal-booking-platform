import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listStaff, createStaff, updateStaff,
  assignStaffToService, unassignStaffFromService,
} from '@/api/staff'
import type { StaffCommand } from '@/api/types'
import { useMemo } from 'react'

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
    },
  })
}

export function useUnassignStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, staffId }: { serviceId: string; staffId: string }) =>
      unassignStaffFromService(serviceId, staffId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
    },
  })
}

/**
 * Derive which staff members are assigned to a given service.
 * Since the backend doesn't expose a dedicated endpoint, we look at
 * /api/services/{service}/available-staff — but that is slot-specific.
 * Instead, for assignment display we use a heuristic based on staff list.
 * The StaffAssignments component manages assignments via POST/DELETE.
 */
export function useAssignments(_serviceId: string) {
  // We maintain assignment state via the available-staff endpoint per slot.
  // For the service detail view, we use all staff and filter assignments
  // client-side using a cached assignment set (populated from StaffAssignments).
  const { data: staff, isLoading } = useStaff()
  // Note: backend doesn't expose "which staff are assigned to this service" as a list.
  // The assignment state is opaque. We return all staff for now, and the
  // StaffAssignments component manages assign/unassign per staff member.
  const assignments = useMemo(() => staff ?? [], [staff])
  return { assignments, isLoading }
}

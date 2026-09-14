import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { listAssignedStaff } from '@/api/staff'
import { useServices } from '@/features/services/useServices'
import { useAssignStaff, useUnassignStaff } from './useStaff'
import { useStaffPermissions } from './useStaffPermissions'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'

interface StaffAssignmentsProps {
  staffId: string
  /** @deprecated Persisted queries are authoritative; local sets are not used. */
  assignedServiceIds?: Set<string>
  onAssignmentChange?: (serviceId: string, assigned: boolean) => void
}

export function StaffAssignments({ staffId, onAssignmentChange }: StaffAssignmentsProps) {
  const { canManage } = useStaffPermissions()
  const servicesQuery = useServices()
  const { data: services } = servicesQuery
  const assignmentQueries = useQueries({
    queries: (services ?? []).map(service => ({
      queryKey: ['service-assignments', service.id],
      queryFn: () => listAssignedStaff(service.id),
      enabled: servicesQuery.isSuccess && !servicesQuery.isError,
    })),
  })
  const assignStaff = useAssignStaff()
  const unassignStaff = useUnassignStaff()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleToggle = async (serviceId: string, currentlyAssigned: boolean) => {
    const query = assignmentQueries[services?.findIndex(service => service.id === serviceId) ?? -1]
    if (!canManage || !staffId || pendingId !== null || servicesQuery.isError || servicesQuery.isFetching
      || !query?.isSuccess || query.isError || query.isFetching) return
    setPendingId(serviceId)
    try {
      if (currentlyAssigned) {
        await unassignStaff.mutateAsync({ serviceId, staffId })
        onAssignmentChange?.(serviceId, false)
        toast.success('Staff unassigned from service')
      } else {
        await assignStaff.mutateAsync({ serviceId, staffId })
        onAssignmentChange?.(serviceId, true)
        toast.success('Staff assigned to service')
      }
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  if (servicesQuery.isError) return (
    <ErrorState title="Services unavailable" message={extractErrorMessage(servicesQuery.error)}
      onRetry={() => servicesQuery.refetch()} />
  )
  if (servicesQuery.isLoading || services === undefined) return <SkeletonCard lines={3} />

  if (services.length === 0) {
    return <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>No services available.</p>
  }

  return (
    <ul className="assignment-list" aria-label="Service assignments">
      {services.map((svc, index) => {
        const query = assignmentQueries[index]
        if (query.isError) return (
          <li key={svc.id}>
            <ErrorState title={`Assignments unavailable for ${svc.name}`} message={extractErrorMessage(query.error)}
              onRetry={() => query.refetch()} />
          </li>
        )
        if (query.isPending || query.data === undefined) return (
          <li key={svc.id}><p role="status">Loading assignments for {svc.name}…</p></li>
        )
        const assigned = query.data.some(member => member.id === staffId)
        return (
          <li key={svc.id} className="assignment-item">
            <label className="assignment-item__label" htmlFor={`assign-${svc.id}`}>
              <input
                id={`assign-${svc.id}`}
                type="checkbox"
                checked={assigned}
                disabled={!canManage || !staffId || pendingId !== null || query.isFetching || servicesQuery.isFetching}
                onChange={() => handleToggle(svc.id, assigned)}
                className="assignment-item__checkbox"
                aria-label={canManage ? `${assigned ? 'Unassign' : 'Assign'} ${svc.name}` : `${svc.name} assignment`}
              />
              <span className="assignment-item__name">{svc.name}</span>
              <span className="assignment-item__meta">{svc.category} · {svc.durationMinutes} min</span>
            </label>
            {query.isFetching && <span role="status">Refreshing assignments…</span>}
            {pendingId === svc.id && <span role="status">Saving assignment…</span>}
          </li>
        )
      })}
    </ul>
  )
}

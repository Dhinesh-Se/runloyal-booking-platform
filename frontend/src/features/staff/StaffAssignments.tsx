import { useState } from 'react'
import toast from 'react-hot-toast'
import { useServices } from '@/features/services/useServices'
import { useAssignStaff, useUnassignStaff } from './useStaff'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { extractErrorMessage } from '@/utils/errors'

interface StaffAssignmentsProps {
  staffId: string
  /** Set of serviceIds currently assigned to this staff (managed locally) */
  assignedServiceIds: Set<string>
  onAssignmentChange: (serviceId: string, assigned: boolean) => void
}

export function StaffAssignments({ staffId, assignedServiceIds, onAssignmentChange }: StaffAssignmentsProps) {
  const { data: services, isLoading } = useServices()
  const assignStaff = useAssignStaff()
  const unassignStaff = useUnassignStaff()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleToggle = async (serviceId: string, currentlyAssigned: boolean) => {
    setPendingId(serviceId)
    try {
      if (currentlyAssigned) {
        await unassignStaff.mutateAsync({ serviceId, staffId })
        onAssignmentChange(serviceId, false)
        toast.success('Staff unassigned from service')
      } else {
        await assignStaff.mutateAsync({ serviceId, staffId })
        onAssignmentChange(serviceId, true)
        toast.success('Staff assigned to service')
      }
    } catch (err) {
      toast.error(extractErrorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  if (isLoading) return <SkeletonCard lines={3} />

  if (!services || services.length === 0) {
    return <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>No services available.</p>
  }

  return (
    <ul className="assignment-list" aria-label="Service assignments">
      {services.map((svc) => {
        const assigned = assignedServiceIds.has(svc.id)
        const isPending = pendingId === svc.id
        return (
          <li key={svc.id} className="assignment-item">
            <label className="assignment-item__label" htmlFor={`assign-${svc.id}`}>
              <input
                id={`assign-${svc.id}`}
                type="checkbox"
                checked={assigned}
                disabled={isPending}
                onChange={() => handleToggle(svc.id, assigned)}
                className="assignment-item__checkbox"
                aria-label={`${assigned ? 'Unassign' : 'Assign'} ${svc.name}`}
              />
              <span className="assignment-item__name">{svc.name}</span>
              <span className="assignment-item__meta">{svc.category} · {svc.durationMinutes} min</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

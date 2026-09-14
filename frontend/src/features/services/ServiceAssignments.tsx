import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAssignments, useAssignStaff, useUnassignStaff, useStaff } from '@/features/staff/useStaff'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import { invalidateServiceDependents } from './serviceCache'
import { useServicePermissions } from './useServicePermissions'

export function ServiceAssignments({ serviceId }: { serviceId: string }) {
  const { isAdmin } = useServicePermissions()
  const { assignments, isLoading, isError, error, refetch } = useAssignments(serviceId)
  const staffQuery = useStaff()
  const assign = useAssignStaff()
  const unassign = useUnassignStaff()
  const client = useQueryClient()
  const [staffId, setStaffId] = useState('')
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<unknown>(null)
  const [notice, setNotice] = useState('')

  const candidates = (staffQuery.data ?? []).filter(staff => staff.status === 'ACTIVE'
    && !assignments.some(assigned => assigned.id === staff.id))
  const pending = saving || assign.isPending || unassign.isPending
  const blocked = !isAdmin || isLoading || isError || pending

  const changeAssignment = async (id: string, remove: boolean) => {
    if (blocked || (!remove && (staffQuery.isError || staffQuery.isFetching
      || !candidates.some(staff => staff.id === id)))) return
    setSaving(true)
    setMutationError(null)
    setNotice('')
    try {
      const command = { serviceId, staffId: id }
      if (remove) await unassign.mutateAsync(command)
      else await assign.mutateAsync(command)
      await invalidateServiceDependents(client)
      setStaffId('')
      setNotice(remove ? 'Staff unassigned.' : 'Staff assigned.')
    } catch (err) {
      setMutationError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="service-assignments-title">
      <h2 id="service-assignments-title" className="card-section-title">Assigned Staff</h2>
      {isLoading ? <p role="status">Loading assignments…</p> : isError ? (
        <ErrorState title="Assignments unavailable" message={extractErrorMessage(error)} onRetry={() => refetch()} />
      ) : <>
        {assignments.length === 0 ? <p className="text-muted">No staff assigned to this service yet.</p> : (
          <ul className="staff-chip-list">
            {assignments.map(staff => (
              <li key={staff.id} className="flex items-center gap-3">
                <Link to={`/staff/${staff.id}`} className="staff-chip">
                  {staff.name} <StatusBadge status={staff.status} />
                </Link>
                {isAdmin && <Button variant="ghost" size="sm" disabled={blocked}
                  aria-label={`Unassign ${staff.name}`} onClick={() => changeAssignment(staff.id, true)}>
                  Unassign
                </Button>}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <div style={{ marginTop: 16 }}>
          {staffQuery.isError ? (
            <ErrorState title="Staff list unavailable" message={extractErrorMessage(staffQuery.error)}
              onRetry={() => staffQuery.refetch()} />
          ) : staffQuery.isLoading || staffQuery.isFetching ? <p role="status">Loading staff…</p>
            : candidates.length === 0 ? <p className="text-muted">No unassigned active staff available.</p> : (
              <form className="form" onSubmit={event => { event.preventDefault(); void changeAssignment(staffId, false) }}>
                <label className="form__label" htmlFor="service-assignment-staff">Assign active staff</label>
                <select id="service-assignment-staff" className="form__select" value={staffId}
                  disabled={blocked} onChange={event => setStaffId(event.target.value)}>
                  <option value="">Select staff</option>
                  {candidates.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
                <Button type="submit" loading={pending} disabled={blocked || !candidates.some(staff => staff.id === staffId)}>
                  Assign Staff
                </Button>
              </form>
            )}
        </div>}
      </>}
      {mutationError != null && <p role="alert">{extractErrorMessage(mutationError)}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
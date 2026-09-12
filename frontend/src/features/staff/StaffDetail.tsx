import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStaff, useUpdateStaff } from './useStaff'
import { StaffForm, type StaffFormValues } from './StaffForm'
import { StaffAssignments } from './StaffAssignments'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import { useAvailabilityForStaff } from '@/features/availability/useAvailability'
import { AvailabilityTypeBadge } from '@/components/ui/Badge'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

export function StaffDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: staff, isLoading, isError, error } = useStaff()
  const updateStaff = useUpdateStaff()
  const { data: availability, isLoading: avLoading } = useAvailabilityForStaff(id ?? '')
  const [editOpen, setEditOpen] = useState(false)
  const [mutationError, setMutationError] = useState<unknown>(null)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())

  const member = staff?.find((s) => s.id === id)

  if (isLoading) return <div className="page"><SkeletonCard lines={4} /></div>
  if (isError) return <div className="page"><ErrorState message={extractErrorMessage(error)} /></div>
  if (!member) return (
    <div className="page">
      <ErrorState title="Staff member not found" message="This staff member does not exist." />
      <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => navigate('/staff')} style={{ marginTop: 16 }}>
        Back to Staff
      </Button>
    </div>
  )

  const handleEdit = async (values: StaffFormValues) => {
    setMutationError(null)
    try {
      await updateStaff.mutateAsync({ id: member.id, command: values })
      setEditOpen(false)
      toast.success('Staff member updated')
    } catch (err) {
      setMutationError(err)
    }
  }

  const sortedAvailability = [...(availability ?? [])].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)
  )

  return (
    <div className="page">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/staff" className="icon-btn" aria-label="Back to staff">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="staff-avatar staff-avatar--lg" aria-hidden="true">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="page-title">{member.name}</h1>
              <div style={{ marginTop: 4 }}><StatusBadge status={member.status} /></div>
            </div>
          </div>
        </div>
        <Button
          id="edit-staff-detail-btn"
          variant="secondary"
          icon={<Edit2 size={15} />}
          onClick={() => { setMutationError(null); setEditOpen(true) }}
        >
          Edit
        </Button>
      </div>

      <div className="detail-grid">
        {/* Service Assignments */}
        <div className="card">
          <h2 className="card-section-title">Service Assignments</h2>
          <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
            Check a service to assign this staff member to it.
          </p>
          <StaffAssignments
            staffId={member.id}
            assignedServiceIds={assignedIds}
            onAssignmentChange={(svcId, assigned) => {
              setAssignedIds((prev) => {
                const next = new Set(prev)
                if (assigned) next.add(svcId)
                else next.delete(svcId)
                return next
              })
            }}
          />
        </div>

        {/* Availability */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
            <h2 className="card-section-title" style={{ marginBottom: 0 }}>Availability</h2>
            <Link to="/availability" className="btn btn--ghost btn--sm" style={{ fontSize: 'var(--font-size-sm)' }}>
              <Clock size={14} /> Manage
            </Link>
          </div>
          {avLoading ? (
            <SkeletonCard lines={3} />
          ) : sortedAvailability.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              No availability windows set. <Link to="/availability">Add availability →</Link>
            </p>
          ) : (
            <table className="table" aria-label={`Availability for ${member.name}`}>
              <thead>
                <tr><th>Day</th><th>Start</th><th>End</th><th>Type</th></tr>
              </thead>
              <tbody>
                {sortedAvailability.map((w) => (
                  <tr key={w.id} className="table__row">
                    <td>{DAY_LABELS[w.dayOfWeek]}</td>
                    <td>{w.startTime.substring(0, 5)}</td>
                    <td>{w.endTime.substring(0, 5)}</td>
                    <td><AvailabilityTypeBadge type={w.type} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${member.name}`} size="md">
        <StaffForm
          defaultValues={{ name: member.name, status: member.status }}
          onSubmit={handleEdit}
          onCancel={() => setEditOpen(false)}
          submitLabel="Save Changes"
          serverError={mutationError}
        />
      </Modal>
    </div>
  )
}

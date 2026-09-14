import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Edit2, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStaff, useCreateStaff, useUpdateStaff } from './useStaff'
import { useStaffPermissions } from './useStaffPermissions'
import { StaffForm, type StaffFormValues } from './StaffForm'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import type { StaffResponse } from '@/api/types'

export function StaffPage() {
  const { canManage } = useStaffPermissions()
  const { data: staff, isLoading, isError, error, refetch } = useStaff()
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffResponse | null>(null)
  const [mutationError, setMutationError] = useState<unknown>(null)

  const handleCreate = async (values: StaffFormValues) => {
    if (!canManage) return
    setMutationError(null)
    try {
      await createStaff.mutateAsync(values)
      setCreateOpen(false)
      toast.success(`Staff member "${values.name}" created`)
    } catch (err) {
      setMutationError(err)
    }
  }

  const handleEdit = async (values: StaffFormValues) => {
    if (!canManage || !editTarget) return
    setMutationError(null)
    try {
      await updateStaff.mutateAsync({ id: editTarget.id, command: values })
      setEditTarget(null)
      toast.success(`Staff member "${values.name}" updated`)
    } catch (err) {
      setMutationError(err)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-subtitle">{canManage ? 'Manage your team members' : 'View your team members · Read-only'}</p>
        </div>
        {canManage && <Button
          id="create-staff-btn"
          icon={<Plus size={16} />}
          onClick={() => { setMutationError(null); setCreateOpen(true) }}
        >
          Add Staff
        </Button>}
      </div>

      {isLoading && <SkeletonTable rows={5} cols={4} />}
      {isError && <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />}

      {!isLoading && !isError && staff && staff.length === 0 && (
        <EmptyState
          icon={<span style={{ fontSize: 40 }}>👤</span>}
          title="No staff members yet"
          description={canManage ? 'Add your first team member to start managing their availability.' : 'There are no team members to view.'}
          action={canManage ? { label: 'Add Staff', onClick: () => setCreateOpen(true) } : undefined}
        />
      )}

      {!isLoading && !isError && staff && staff.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" aria-label="Staff list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="table__row">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="staff-avatar" aria-hidden="true">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <Link to={`/staff/${member.id}`} className="table__link" id={`staff-row-${member.id}`}>
                        {member.name}
                      </Link>
                    </div>
                  </td>
                  <td><StatusBadge status={member.status} /></td>
                  <td>
                    <div className="table__actions">
                      {canManage && <button
                        className="icon-btn"
                        aria-label={`Edit ${member.name}`}
                        id={`edit-staff-${member.id}`}
                        onClick={() => { setMutationError(null); setEditTarget(member) }}
                      >
                        <Edit2 size={15} />
                      </button>}
                      <Link to={`/staff/${member.id}`} className="icon-btn" aria-label={`View ${member.name}`}>
                        <ChevronRight size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={canManage && createOpen} onClose={() => setCreateOpen(false)} title="Add Staff Member" size="md">
        <StaffForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Add Staff"
          serverError={mutationError}
        />
      </Modal>

      <Modal isOpen={canManage && !!editTarget} onClose={() => setEditTarget(null)} title={`Edit — ${editTarget?.name}`} size="md">
        {editTarget && (
          <StaffForm
            defaultValues={{ name: editTarget.name, status: editTarget.status }}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
            submitLabel="Save Changes"
            serverError={mutationError}
          />
        )}
      </Modal>
    </div>
  )
}

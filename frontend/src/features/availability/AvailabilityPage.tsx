import { useState, useMemo } from 'react'
import { Plus, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStaff } from '@/features/staff/useStaff'
import {
  useAvailabilityForStaff,
  useCreateAvailability,
  useUpdateAvailability,
  useDeleteAvailability,
} from './useAvailability'
import { AvailabilityForm, availabilityToFormValues, type AvailabilityFormValues } from './AvailabilityForm'
import { StaffWeekView } from './StaffWeekView'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import type { AvailabilityResponse, DayOfWeek } from '@/api/types'

export function AvailabilityPage() {
  const { data: staffList, isLoading: staffLoading, isError: staffError, error: staffErr } = useStaff()
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')

  // Selected staff (default to first active staff or first staff)
  const activeStaff = useMemo(() => {
    if (!staffList || staffList.length === 0) return null
    if (selectedStaffId) {
      return staffList.find((s) => s.id === selectedStaffId) ?? staffList[0]
    }
    return staffList[0]
  }, [staffList, selectedStaffId])

  const staffId = activeStaff?.id ?? ''
  const {
    data: availability,
    isLoading: avLoading,
    isError: avError,
    error: avErr,
  } = useAvailabilityForStaff(staffId)

  const createAv = useCreateAvailability(staffId)
  const updateAv = useUpdateAvailability(staffId)
  const deleteAv = useDeleteAvailability(staffId)

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingWindow, setEditingWindow] = useState<AvailabilityResponse | null>(null)
  const [deletingWindow, setDeletingWindow] = useState<AvailabilityResponse | null>(null)
  const [prefilledDay, setPrefilledDay] = useState<DayOfWeek>('MONDAY')
  const [formServerError, setFormServerError] = useState<unknown>(null)

  const handleOpenAdd = (day: DayOfWeek = 'MONDAY') => {
    setPrefilledDay(day)
    setFormServerError(null)
    setIsAddOpen(true)
  }

  const handleCreate = async (values: AvailabilityFormValues) => {
    setFormServerError(null)
    try {
      await createAv.mutateAsync(values)
      toast.success('Availability window added')
      setIsAddOpen(false)
    } catch (err) {
      setFormServerError(err)
    }
  }

  const handleUpdate = async (values: AvailabilityFormValues) => {
    if (!editingWindow) return
    setFormServerError(null)
    try {
      await updateAv.mutateAsync({ id: editingWindow.id, command: values })
      toast.success('Availability window updated')
      setEditingWindow(null)
    } catch (err) {
      setFormServerError(err)
    }
  }

  const handleDelete = async () => {
    if (!deletingWindow) return
    try {
      await deleteAv.mutateAsync(deletingWindow.id)
      toast.success('Availability window deleted')
      setDeletingWindow(null)
    } catch (err) {
      toast.error(extractErrorMessage(err))
    }
  }

  if (staffLoading) {
    return (
      <div className="page">
        <div className="page-header">
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={5} />
      </div>
    )
  }

  if (staffError) {
    return (
      <div className="page">
        <ErrorState message={extractErrorMessage(staffErr)} />
      </div>
    )
  }

  if (!staffList || staffList.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Staff Availability</h1>
            <p className="page-subtitle">Manage working hours, breaks, and days off for your staff</p>
          </div>
        </div>
        <EmptyState
          icon={<User size={36} />}
          title="No staff members found"
          message="You need to add staff members before configuring their availability schedules."
          action={{
            label: 'Add Staff Member',
            href: '/staff',
          }}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Availability</h1>
          <p className="page-subtitle">Configure weekly working hours, shifts, breaks, and days off</p>
        </div>
        <Button
          id="add-availability-btn"
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => handleOpenAdd()}
          disabled={!activeStaff}
        >
          Add Window
        </Button>
      </div>

      {/* Staff Selector Bar */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <User size={16} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Select Staff Member:
          </span>
        </div>

        <select
          id="staff-availability-selector"
          className="form__select"
          style={{ maxWidth: 280 }}
          value={activeStaff?.id ?? ''}
          onChange={(e) => setSelectedStaffId(e.target.value)}
        >
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status.toLowerCase()})
            </option>
          ))}
        </select>
      </div>

      {/* Availability Schedule */}
      {avLoading ? (
        <SkeletonCard lines={6} />
      ) : avError ? (
        <ErrorState message={extractErrorMessage(avErr)} />
      ) : (
        <StaffWeekView
          availability={availability ?? []}
          onAddWindow={(day) => handleOpenAdd(day)}
          onEditWindow={(w) => {
            setFormServerError(null)
            setEditingWindow(w)
          }}
          onDeleteWindow={(w) => setDeletingWindow(w)}
        />
      )}

      {/* Add Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={`Add Availability Window — ${activeStaff?.name}`}
        size="md"
      >
        <AvailabilityForm
          defaultValues={{ dayOfWeek: prefilledDay }}
          onSubmit={handleCreate}
          onCancel={() => setIsAddOpen(false)}
          submitLabel="Add Schedule"
          serverError={formServerError}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingWindow}
        onClose={() => setEditingWindow(null)}
        title={`Edit Availability — ${activeStaff?.name}`}
        size="md"
      >
        {editingWindow && (
          <AvailabilityForm
            defaultValues={availabilityToFormValues(editingWindow)}
            onSubmit={handleUpdate}
            onCancel={() => setEditingWindow(null)}
            submitLabel="Save Changes"
            serverError={formServerError}
          />
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingWindow}
        title="Delete Availability Window"
        message={`Are you sure you want to remove this ${deletingWindow?.type} window on ${deletingWindow?.dayOfWeek.toLowerCase()}?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteAv.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeletingWindow(null)}
      />
    </div>
  )
}

import { useState } from 'react'
import { Plus, Edit2, Trash2, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useServices, useCreateService, useUpdateService, useDeleteService } from './useServices'
import { ServiceForm, serviceResponseToFormValues, type ServiceFormValues } from './ServiceForm'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import type { ServiceResponse } from '@/api/types'

export function ServicesPage() {
  const { data: services, isLoading, isError, error, refetch } = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ServiceResponse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ServiceResponse | null>(null)
  const [mutationError, setMutationError] = useState<unknown>(null)

  const handleCreate = async (values: ServiceFormValues) => {
    setMutationError(null)
    try {
      await createService.mutateAsync({
        ...values,
        price: Number(values.price),
      })
      setCreateOpen(false)
      toast.success(`Service "${values.name}" created`)
    } catch (err) {
      setMutationError(err)
    }
  }

  const handleEdit = async (values: ServiceFormValues) => {
    if (!editTarget) return
    setMutationError(null)
    try {
      await updateService.mutateAsync({ id: editTarget.id, command: { ...values, price: Number(values.price) } })
      setEditTarget(null)
      toast.success(`Service "${values.name}" updated`)
    } catch (err) {
      setMutationError(err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteService.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      toast.success(`Service "${deleteTarget.name}" deleted`)
    } catch (err) {
      toast.error(extractErrorMessage(err))
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">Manage your service offerings</p>
        </div>
        <Button
          id="create-service-btn"
          icon={<Plus size={16} />}
          onClick={() => { setMutationError(null); setCreateOpen(true) }}
        >
          New Service
        </Button>
      </div>

      {isLoading && <SkeletonTable rows={6} cols={5} />}
      {isError && (
        <ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && services && services.length === 0 && (
        <EmptyState
          icon={<span style={{ fontSize: 40 }}>🐾</span>}
          title="No services yet"
          description="Create your first service to start accepting bookings."
          action={{ label: 'Create Service', onClick: () => setCreateOpen(true) }}
        />
      )}

      {!isLoading && !isError && services && services.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table" aria-label="Services list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id} className="table__row">
                  <td>
                    <Link
                      to={`/services/${svc.id}`}
                      className="table__link"
                      id={`service-row-${svc.id}`}
                    >
                      {svc.name}
                    </Link>
                  </td>
                  <td><span className="table__category">{svc.category}</span></td>
                  <td>{svc.durationMinutes} min</td>
                  <td>${Number(svc.price).toFixed(2)}</td>
                  <td><StatusBadge status={svc.status} /></td>
                  <td>
                    <div className="table__actions">
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${svc.name}`}
                        id={`edit-service-${svc.id}`}
                        onClick={() => { setMutationError(null); setEditTarget(svc) }}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        className="icon-btn icon-btn--danger"
                        aria-label={`Delete ${svc.name}`}
                        id={`delete-service-${svc.id}`}
                        onClick={() => setDeleteTarget(svc)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <Link
                        to={`/services/${svc.id}`}
                        className="icon-btn"
                        aria-label={`View details for ${svc.name}`}
                      >
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

      {/* Create Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Service"
        size="lg"
      >
        <ServiceForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Create Service"
          serverError={mutationError}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.name}`}
        size="lg"
      >
        {editTarget && (
          <ServiceForm
            defaultValues={serviceResponseToFormValues(editTarget)}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
            submitLabel="Save Changes"
            serverError={mutationError}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Service"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteService.isPending}
      />
    </div>
  )
}

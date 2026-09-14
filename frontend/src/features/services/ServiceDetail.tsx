import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useServices, useUpdateService } from './useServices'
import { ServiceForm, serviceResponseToFormValues, type ServiceFormValues } from './ServiceForm'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'
import { ServiceAssignments } from './ServiceAssignments'
import { ServiceUpcoming } from './ServiceUpcoming'
import { useServicePermissions } from './useServicePermissions'

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useServicePermissions()
  const { data: services, isLoading, isError, error, refetch } = useServices()
  const updateService = useUpdateService()
  const [editOpen, setEditOpen] = useState(false)
  const [mutationError, setMutationError] = useState<unknown>(null)

  const service = services?.find((s) => s.id === id)

  if (isLoading) return <div className="page"><SkeletonCard lines={4} /></div>
  if (isError) return <div className="page"><ErrorState message={extractErrorMessage(error)} onRetry={() => refetch()} /></div>
  if (!service) return (
    <div className="page">
      <ErrorState title="Service not found" message="This service does not exist or was deleted." />
      <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={() => navigate('/services')} style={{ marginTop: 16 }}>
        Back to Services
      </Button>
    </div>
  )

  const handleEdit = async (values: ServiceFormValues) => {
    if (!isAdmin) return
    setMutationError(null)
    try {
      await updateService.mutateAsync({ id: service.id, command: { ...values, price: Number(values.price) } })
      setEditOpen(false)
      toast.success('Service updated')
    } catch (err) {
      setMutationError(err)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/services" className="icon-btn" aria-label="Back to services">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">{service.name}</h1>
            <p className="page-subtitle">{service.category}</p>
          </div>
        </div>
        {isAdmin && <Button
          id="edit-service-detail-btn"
          variant="secondary"
          icon={<Edit2 size={15} />}
          onClick={() => { setMutationError(null); setEditOpen(true) }}
        >
          Edit Service
        </Button>}
      </div>

      {!isAdmin && <p className="text-muted">Read-only: only tenant administrators can edit services and staff assignments.</p>}
      <div className="detail-grid">
        <div className="card">
          <h2 className="card-section-title">Details</h2>
          <dl className="detail-list">
            <div className="detail-row">
              <dt>Status</dt>
              <dd><StatusBadge status={service.status} /></dd>
            </div>
            <div className="detail-row">
              <dt>Category</dt>
              <dd>{service.category}</dd>
            </div>
            <div className="detail-row">
              <dt>Duration</dt>
              <dd>{service.durationMinutes} minutes</dd>
            </div>
            <div className="detail-row">
              <dt>Price</dt>
              <dd>${Number(service.price).toFixed(2)}</dd>
            </div>
            {service.description && (
              <div className="detail-row detail-row--full">
                <dt>Description</dt>
                <dd>{service.description}</dd>
              </div>
            )}
          </dl>
        </div>

        <ServiceAssignments key={service.id} serviceId={service.id} />
      </div>

      <ServiceUpcoming key={service.id} service={service} />

      {isAdmin && <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${service.name}`} size="lg">
        <ServiceForm
          defaultValues={serviceResponseToFormValues(service)}
          onSubmit={handleEdit}
          onCancel={() => setEditOpen(false)}
          submitLabel="Save Changes"
          serverError={mutationError}
        />
      </Modal>}
    </div>
  )
}

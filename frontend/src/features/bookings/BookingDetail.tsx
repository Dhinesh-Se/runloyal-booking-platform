import { useState } from 'react'
import { Clock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { BookingStatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useBooking, useCancelBooking } from './useBookings'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import { formatInstant } from '@/utils/dates'
import { extractErrorMessage } from '@/utils/errors'
import { SkeletonCard } from '@/components/ui/Skeleton'

interface BookingDetailProps {
  bookingId: string | null
  isOpen: boolean
  onClose: () => void
}

export function BookingDetail({ bookingId, isOpen, onClose }: BookingDetailProps) {
  const { data: booking, isLoading, isError, error } = useBooking(bookingId ?? '')
  const { data: services } = useServices()
  const { data: staffList } = useStaff()
  const cancelBookingMutation = useCancelBooking()

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

  if (!isOpen || !bookingId) return null

  const service = services?.find((s) => s.id === booking?.serviceId)
  const staff = staffList?.find((s) => s.id === booking?.staffId)

  const handleCancelBooking = async () => {
    if (!booking) return
    try {
      await cancelBookingMutation.mutateAsync(booking.id)
      toast.success('Booking cancelled successfully')
      setConfirmCancelOpen(false)
      onClose()
    } catch (err) {
      toast.error(extractErrorMessage(err))
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Booking Details" size="md">
        {isLoading ? (
          <SkeletonCard lines={4} />
        ) : isError ? (
          <div className="card" style={{ color: 'var(--color-danger)' }}>
            <p>Failed to load booking: {extractErrorMessage(error)}</p>
          </div>
        ) : !booking ? (
          <p className="text-muted">Booking not found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Status Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 'var(--space-3)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  Booking Ref
                </span>
                <p style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  {booking.id.substring(0, 8)}...
                </p>
              </div>
              <BookingStatusBadge status={booking.status} />
            </div>

            {/* Customer & Pet Details */}
            <div className="card" style={{ background: 'var(--bg-elevated)', padding: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Customer</span>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {booking.customerName}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Pet</span>
                  <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {booking.petName ? booking.petName : '— (None)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Service & Staff Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="card" style={{ padding: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Service</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {service?.name ?? booking.serviceId}
                </p>
                {service && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                    {service.durationMinutes} min • ${service.price.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="card" style={{ padding: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Staff Provider</span>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {staff?.name ?? booking.staffId}
                </p>
              </div>
            </div>

            {/* Time Details */}
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Clock size={15} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Start:</span>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                    {formatInstant(booking.startAt)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Clock size={15} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>End:</span>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                    {formatInstant(booking.endAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              {booking.status === 'CONFIRMED' ? (
                <Button
                  id="cancel-booking-btn"
                  variant="danger"
                  icon={<XCircle size={15} />}
                  onClick={() => setConfirmCancelOpen(true)}
                >
                  Cancel Booking
                </Button>
              ) : (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  This booking has been cancelled
                </span>
              )}

              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmCancelOpen}
        title="Cancel Booking"
        message={`Are you sure you want to cancel the booking for ${booking?.customerName}? This will immediately free the slot in the calendar.`}
        confirmLabel="Yes, Cancel Booking"
        variant="danger"
        loading={cancelBookingMutation.isPending}
        onConfirm={handleCancelBooking}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </>
  )
}

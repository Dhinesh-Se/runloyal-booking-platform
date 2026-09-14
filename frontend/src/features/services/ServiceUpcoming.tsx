import { useState } from 'react'
import type { ServiceResponse } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { BookingModal } from '@/features/bookings/BookingModal'
import { BookingDetail } from '@/features/bookings/BookingDetail'
import { extractErrorMessage } from '@/utils/errors'
import { useServicePermissions } from './useServicePermissions'
import { formatServiceUTC, useServiceUpcoming } from './useServiceUpcoming'

export function ServiceUpcoming({ service }: { service: ServiceResponse }) {
  const { isAdmin } = useServicePermissions()
  const [staffId, setStaffId] = useState('')
  const [selection, setSelection] = useState<{ startAt: string; staffId: string } | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const upcoming = useServiceUpcoming(service, staffId)
  const { bookingsQuery, staffQuery } = upcoming
  const selectedBooking = upcoming.bookings.find(booking => booking.id === bookingId)

  return (
    <section style={{ marginTop: 24 }} aria-labelledby="service-upcoming-title">
      <h2 id="service-upcoming-title" className="card-section-title">Next seven days (UTC)</h2>
      <p className="text-muted">{formatServiceUTC(upcoming.range.from)} to {formatServiceUTC(upcoming.range.to)} (end exclusive).</p>
      {!isAdmin && <p className="text-muted">Read-only: only tenant administrators can create or cancel bookings.</p>}
      <div className="detail-grid" style={{ marginTop: 16 }}>
        <section className="card" aria-labelledby="service-slots-title">
          <h3 id="service-slots-title" className="card-section-title">Upcoming availability (UTC)</h3>
          {service.status !== 'ACTIVE' ? <p>This service is inactive. New bookings are unavailable.</p>
            : upcoming.availabilityError ? <ErrorState title="Availability unavailable"
              message={extractErrorMessage(upcoming.availabilityError)} onRetry={() => upcoming.retryAvailability()} />
            : upcoming.availabilityLoading ? <p role="status">Loading availability…</p>
            : <>
              <label className="form__label" htmlFor="service-available-staff">Available staff</label>
              <select id="service-available-staff" className="form__select" value={staffId}
                disabled={upcoming.availabilityRefreshing} onChange={event => { setStaffId(event.target.value); setSelection(null) }}>
                <option value="">All active staff</option>
                {upcoming.activeStaff.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
              </select>
              {upcoming.availabilityRefreshing ? <p role="status">Refreshing availability…</p>
                : upcoming.activeStaff.length === 0 ? <p>No active staff available.</p>
                : upcoming.slots.length === 0 ? <p>No available slots in the next seven days for this selection.</p>
                : <ul style={{ maxHeight: 440, overflowY: 'auto', paddingLeft: 20 }}>
                  {upcoming.slots.map(slot => <li key={slot.startAt} style={{ marginTop: 16 }}>
                    <p>{formatServiceUTC(slot.startAt)} – {formatServiceUTC(slot.endAt)}</p>
                    <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                      {slot.availableStaff.map(staff => isAdmin ? (
                        <Button key={staff.id} variant="secondary" size="sm"
                          aria-label={`Book ${staff.name} at ${formatServiceUTC(slot.startAt)}`}
                          onClick={() => {
                            if (isAdmin && !upcoming.availabilityBlocked && Date.parse(slot.startAt) >= Date.now()) {
                              setSelection({ startAt: slot.startAt, staffId: staff.id })
                            }
                          }}>Book with {staff.name}</Button>
                      ) : <span key={staff.id}>{staff.name}</span>)}
                    </div>
                  </li>)}
                </ul>}
            </>}
        </section>
        <section className="card" aria-labelledby="service-bookings-title">
          <h3 id="service-bookings-title" className="card-section-title">Upcoming bookings (UTC)</h3>
          <p className="text-muted">Confirmed bookings only, including those in progress.</p>
          {bookingsQuery.isError ? <ErrorState title="Bookings unavailable" message={extractErrorMessage(bookingsQuery.error)}
            onRetry={() => bookingsQuery.refetch()} />
            : bookingsQuery.isLoading ? <p role="status">Loading bookings…</p>
            : <>
              {bookingsQuery.isFetching && <p role="status">Refreshing bookings…</p>}
              {upcoming.bookings.length === 0 ? <p>No upcoming bookings for this service.</p>
                : <ul style={{ maxHeight: 440, overflowY: 'auto', paddingLeft: 20 }}>
                  {upcoming.bookings.map(booking => <li key={booking.id} style={{ marginTop: 16 }}>
                    <Button variant="ghost" onClick={() => setBookingId(booking.id)}
                      aria-label={`View booking for ${booking.customerName}`}>
                      {booking.customerName}{booking.petName ? ` — ${booking.petName}` : ''}
                    </Button>
                    <p>{formatServiceUTC(booking.startAt)} – {formatServiceUTC(booking.endAt)}</p>
                    <p className="text-muted">Staff: {staffQuery.data?.find(staff => staff.id === booking.staffId)?.name ?? booking.staffId}</p>
                  </li>)}
                </ul>}
            </>}
        </section>
      </div>

      {/* Keep the draft through slot refreshes/conflicts. BookingModal independently
          revalidates available staff and blocks submission until eligibility is known. */}
      {isAdmin && selection && <BookingModal
        isOpen onClose={() => setSelection(null)} initialServiceId={service.id}
        initialStartAt={selection.startAt} initialStaffId={selection.staffId} />}

      {/* Do not mount the shared cancellation-capable component for read-only users.
          This boundary stays safe even before shared BookingDetail adds role checks. */}
      {selectedBooking && (isAdmin ? <BookingDetail bookingId={selectedBooking.id} isOpen onClose={() => setBookingId(null)} /> : (
        <Modal isOpen onClose={() => setBookingId(null)} title="Booking Details (read-only)">
          <dl className="detail-list">
            <div className="detail-row"><dt>Customer</dt><dd>{selectedBooking.customerName}</dd></div>
            <div className="detail-row"><dt>Pet</dt><dd>{selectedBooking.petName ?? '—'}</dd></div>
            <div className="detail-row"><dt>Service</dt><dd>{service.name}</dd></div>
            <div className="detail-row"><dt>Staff</dt><dd>{staffQuery.data?.find(staff => staff.id === selectedBooking.staffId)?.name ?? selectedBooking.staffId}</dd></div>
            <div className="detail-row"><dt>Status</dt><dd>{selectedBooking.status}</dd></div>
            <div className="detail-row"><dt>Start (UTC)</dt><dd>{formatServiceUTC(selectedBooking.startAt)}</dd></div>
            <div className="detail-row"><dt>End (UTC)</dt><dd>{formatServiceUTC(selectedBooking.endAt)}</dd></div>
          </dl>
          <Button variant="ghost" onClick={() => setBookingId(null)}>Close</Button>
        </Modal>
      ))}
    </section>
  )
}
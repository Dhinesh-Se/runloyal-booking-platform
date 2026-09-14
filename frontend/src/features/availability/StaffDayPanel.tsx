import type { AvailabilityResponse, BookingResponse, StaffResponse } from '@/api/types'
import { AvailabilityTypeBadge, BookingStatusBadge } from '@/components/ui/Badge'
import { ErrorState } from '@/components/ui/EmptyState'
import { formatInstant } from '@/utils/dates'
import { extractErrorMessage } from '@/utils/errors'
import { bookingsOnTenantDay, dayWindows, nominalDateLabel, scheduleTimeRange, tenantInstantLabel } from './availabilityDates'

interface StaffDayPanelProps {
  staff: StaffResponse
  date: Date
  timezone: string
  availability: AvailabilityResponse[]
  bookings: BookingResponse[]
  scheduleLoading?: boolean
  scheduleError?: unknown
  bookingsLoading?: boolean
  bookingsError?: unknown
}

export function StaffDayPanel({ staff, date, timezone, availability, bookings,
  scheduleLoading, scheduleError, bookingsLoading, bookingsError }: StaffDayPanelProps) {
  const windows = dayWindows(availability, date)
  const confirmed = bookingsOnTenantDay(bookings, staff.id, date, timezone)
  return (
    <section className="card" aria-labelledby="staff-day-title" style={{ marginTop: 16 }}>
      <h3 id="staff-day-title">{staff.name} — {nominalDateLabel(date)}</h3>
      <p>Local schedule and booking times: {timezone}. Booking instants are also shown in UTC.</p>
      {staff.status !== 'ACTIVE' && <p><strong>Inactive — not available for new bookings.</strong> Recurring rules below are retained, not bookable hours.</p>}
      <h4>Recurring working / BREAK / OFF periods</h4>
      <p className="text-muted">Working rules are not free slots; breaks, OFF periods and confirmed bookings block them.</p>
      {scheduleError ? <ErrorState title="Schedule unavailable" message={extractErrorMessage(scheduleError)} />
        : scheduleLoading ? <p role="status">Loading schedule…</p>
        : windows.length === 0 ? <p>No schedule configured for this day — not available.</p>
        : <ul aria-label="Day schedule periods">
          {windows.map(window => <li key={window.id} style={{ marginTop: 8 }}>
            <AvailabilityTypeBadge type={window.type} /> {scheduleTimeRange(window)} ({timezone}, local)
          </li>)}
        </ul>}
      <h4>CONFIRMED booking periods</h4>
      {bookingsError ? <ErrorState title="Bookings unavailable" message={extractErrorMessage(bookingsError)} />
        : bookingsLoading ? <p role="status">Loading bookings…</p>
        : confirmed.length === 0 ? <p>No confirmed bookings overlap this day.</p>
        : <ul aria-label="Day confirmed bookings">
          {confirmed.map(booking => <li key={booking.id} style={{ marginTop: 12 }}>
            <BookingStatusBadge status={booking.status} /> <strong>{booking.customerName}</strong>{booking.petName ? ` — ${booking.petName}` : ''}
            <p>{tenantInstantLabel(booking.startAt, timezone)} – {tenantInstantLabel(booking.endAt, timezone)}</p>
            <p className="text-muted">{formatInstant(booking.startAt)} – {formatInstant(booking.endAt)}</p>
          </li>)}
        </ul>}
    </section>
  )
}
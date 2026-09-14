import type { AvailabilityResponse, BookingResponse, ServiceResponse, StaffResponse } from '@/api/types'
import { instantIntervalsOverlap, formatInstantTime } from '@/utils/dates'
import { scheduleOverlays } from '@/utils/schedule'
import { CalendarBlock } from './CalendarBlock'
import type { CalendarAvailableSlot } from './useCalendar'

export interface CalendarCellProps {
  startAt: string
  endAt: string
  bookings: BookingResponse[]
  staffAvailabilities: Record<string, AvailabilityResponse[]>
  staffList?: StaffResponse[]
  services?: ServiceResponse[]
  availableSlots?: CalendarAvailableSlot[]
  selectedStaffId?: string
  selectedServiceId?: string
  timezone?: string
  canBook?: boolean
  onSelectSlot: (startAtInstant: string, staffId?: string, serviceId?: string) => void
  onSelectBooking?: (bookingId: string) => void
}

/** Booking blocks, authoritative starts and schedule annotations can coexist. */
export function CalendarCell({
  startAt, endAt, bookings, staffAvailabilities, staffList = [], services = [],
  availableSlots = [], selectedStaffId, selectedServiceId, timezone, canBook = false,
  onSelectSlot, onSelectBooking,
}: CalendarCellProps) {
  const visibleBookings = bookings.filter(booking => booking.status === 'CONFIRMED'
    && (!selectedStaffId || booking.staffId === selectedStaffId)
    && instantIntervalsOverlap(booking.startAt, booking.endAt, startAt, endAt))
  const staff = staffList.filter(person => person.status === 'ACTIVE'
    && (!selectedStaffId || person.id === selectedStaffId))
  const choiceMap = new Map<string, { slot: CalendarAvailableSlot; service: ServiceResponse; person: StaffResponse }>()
  for (const slot of availableSlots) {
    const service = services.find(item => item.id === slot.serviceId && item.status === 'ACTIVE')
    const start = Date.parse(slot.startAt)
    if (!service || (selectedServiceId && service.id !== selectedServiceId)
      || !Number.isFinite(start) || start < Date.parse(startAt) || start >= Date.parse(endAt)) continue
    for (const person of slot.availableStaff) {
      if (!staff.some(item => item.id === person.id)) continue
      // DST gap resolution can return the same instant for two local starts.
      // Merge duplicate choices, not simultaneous bookings or different staff.
      choiceMap.set(`${service.id}-${person.id}-${start}`, { slot, service, person })
    }
  }
  const choices = [...choiceMap.values()]
  const overlays = timezone ? staff.flatMap(person =>
    scheduleOverlays(staffAvailabilities[person.id] ?? [], startAt, endAt, timezone)
      .map(rule => ({ person, rule }))) : []

  return (
    <div style={{ padding: 3, display: 'flex', flexDirection: 'column', gap: 3,
      borderBottom: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
      {visibleBookings.map(booking => (
        <CalendarBlock key={booking.id} type="BOOKED"
          title={`${booking.customerName}${booking.petName ? ` (${booking.petName})` : ''}`}
          subtitle={`${services.find(service => service.id === booking.serviceId)?.name ?? 'Service'} • ${staffList.find(person => person.id === booking.staffId)?.name ?? 'Staff'}`}
          booking={booking} onClick={onSelectBooking ? () => onSelectBooking(booking.id) : undefined} />
      ))}
      {choices.map(({ slot, service, person }) => (
        <CalendarBlock key={`${service.id}-${person.id}-${slot.startAt}`} type="AVAILABLE" title="Available"
          subtitle={`${service.name} • ${person.name} • ${formatInstantTime(slot.startAt)} – ${formatInstantTime(slot.endAt)} (${service.durationMinutes} min)`}
          onClick={canBook ? () => onSelectSlot(slot.startAt, person.id, service.id) : undefined} />
      ))}
      {overlays.map(({ person, rule }) => (
        <CalendarBlock key={`${person.id}-${rule.id}`} type={rule.type === 'OFF' ? 'OFF' : 'BREAK'}
          title={rule.type === 'OFF' ? 'Off' : 'Break'}
          subtitle={`${person.name} • ${rule.startTime} – ${rule.endTime} ${timezone}`} />
      ))}
      {!visibleBookings.length && !choices.length && !overlays.length && <CalendarBlock type="EMPTY" />}
    </div>
  )
}
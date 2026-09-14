import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { WeekView } from '@/features/calendar/WeekView'
import { DayView } from '@/features/calendar/DayView'
import type { CalendarCellProps } from '@/features/calendar/CalendarCell'
import type { AvailabilityResponse, BookingResponse, ServiceResponse, StaffResponse } from '@/api/types'
import { getWeekDays } from '@/utils/dates'

const monday = new Date('2026-09-14T00:00:00Z')
const alice: StaffResponse = { id: 'alice', tenantId: 't', userId: null, name: 'Alice', status: 'ACTIVE' }
const bob: StaffResponse = { ...alice, id: 'bob', name: 'Bob' }
const short: ServiceResponse = { id: 'short', tenantId: 't', name: 'Quick wash', description: null,
  category: 'Wash', durationMinutes: 30, price: 30, status: 'ACTIVE' }
const long: ServiceResponse = { ...short, id: 'long', name: 'Full groom', durationMinutes: 90 }
const booking: BookingResponse = { id: 'booking-1', tenantId: 't', staffId: alice.id, serviceId: long.id,
  startAt: '2026-09-14T09:00:00Z', endAt: '2026-09-14T09:30:00Z',
  customerName: 'First customer', petName: null, status: 'CONFIRMED' }
const working: AvailabilityResponse = { id: 'work', tenantId: 't', staffId: alice.id,
  dayOfWeek: 'MONDAY', startTime: '08:00:00', endTime: '18:00:00', type: 'WORKING' }
const timeSlots = [
  { timeLabel: '09:00', minutes: 540 }, { timeLabel: '09:30', minutes: 570 },
  { timeLabel: '10:00', minutes: 600 },
]

function draw(view: 'week' | 'day', overrides: Partial<CalendarCellProps> = {}) {
  const props = {
    bookings: [], staffList: [alice, bob], services: [short, long],
    staffAvailabilities: { [alice.id]: [working], [bob.id]: [{ ...working, staffId: bob.id }] },
    availableSlots: [], timezone: 'UTC', canBook: true,
    onSelectSlot: vi.fn(), onSelectBooking: vi.fn(), ...overrides, timeSlots,
  }
  const result = render(view === 'week'
    ? <WeekView {...props} weekDays={getWeekDays(monday)} />
    : <DayView {...props} currentDate={monday} />)
  return { ...result, ...props }
}

describe.each(['week', 'day'] as const)('%s authoritative eligibility', view => {
  it('does not infer a start for a too-long service or unassigned staff from WORKING rules', () => {
    const { container, onSelectSlot } = draw(view, { selectedServiceId: long.id, availableSlots: [] })
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.click(container.querySelector('.calendar-block')!)
    expect(onSelectSlot).not.toHaveBeenCalled()
  })

  it('honors service duration by showing a 30-minute backend slot but not inventing a 90-minute one', () => {
    draw(view, { availableSlots: [{ serviceId: short.id,
      startAt: '2026-09-14T09:00:00Z', endAt: '2026-09-14T09:30:00Z', availableStaff: [alice] }] })
    expect(screen.getAllByText('Available')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Quick wash.*30 min/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Full groom/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bob/ })).not.toBeInTheDocument()
  })

  it('prefills the exact backend start, eligible staff, and service in All Services mode', () => {
    const { onSelectSlot } = draw(view, { availableSlots: [{ serviceId: long.id,
      startAt: '2026-09-14T09:15:00Z', endAt: '2026-09-14T10:45:00Z', availableStaff: [bob] }] })
    // Non-half-hour UTC starts can occur in tenant zones with quarter-hour offsets.
    fireEvent.click(screen.getByRole('button', { name: /Full groom.*Bob.*09:15 UTC.*90 min/ }))
    expect(onSelectSlot).toHaveBeenCalledWith('2026-09-14T09:15:00Z', bob.id, long.id)
  })

  it('shows every simultaneous booking while a free second staff member remains selectable', () => {
    const { onSelectSlot, onSelectBooking } = draw(view, {
      bookings: [booking, { ...booking, id: 'booking-2', customerName: 'Second customer',
        startAt: '2026-09-14T09:10:00Z', endAt: '2026-09-14T09:20:00Z' }],
      availableSlots: [{ serviceId: short.id, startAt: '2026-09-14T09:00:00Z',
        endAt: '2026-09-14T09:30:00Z', availableStaff: [bob] }],
      selectedServiceId: short.id,
    })
    fireEvent.click(screen.getByRole('button', { name: /First customer/ }))
    fireEvent.click(screen.getByRole('button', { name: /Second customer/ }))
    expect(onSelectBooking).toHaveBeenNthCalledWith(1, booking.id)
    expect(onSelectBooking).toHaveBeenNthCalledWith(2, 'booking-2')
    fireEvent.click(screen.getByRole('button', { name: /Available.*Bob/ }))
    expect(onSelectSlot).toHaveBeenCalledWith('2026-09-14T09:00:00Z', bob.id, short.id)
    // Both bookings are for the other service and must remain visible.
    expect(screen.getAllByText(/Full groom • Alice/)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Available.*Alice/ })).not.toBeInTheDocument()
  })

  it('applies service/staff filters only to matching eligible choices', () => {
    draw(view, {
      selectedServiceId: short.id, selectedStaffId: bob.id,
      availableSlots: [short, long].map(service => ({ serviceId: service.id,
        startAt: '2026-09-14T09:00:00Z', endAt: new Date(Date.parse('2026-09-14T09:00:00Z')
          + service.durationMinutes * 60_000).toISOString(), availableStaff: [alice, bob] })),
    })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Quick wash.*Bob/ })).toBeInTheDocument()
  })

  it('deduplicates equivalent eligible instants without losing another eligible staff member', () => {
    draw(view, { availableSlots: [
      { serviceId: short.id, startAt: '2026-09-14T09:00:00Z', endAt: '2026-09-14T09:30:00Z', availableStaff: [alice] },
      { serviceId: short.id, startAt: '2026-09-14T05:00:00-04:00', endAt: '2026-09-14T05:30:00-04:00', availableStaff: [alice, bob] },
    ] })
    expect(screen.getAllByRole('button', { name: /^Available/ })).toHaveLength(2)
  })

  it('only marks the partial OFF interval, not the entire day', () => {
    const { container } = draw(view, {
      selectedStaffId: alice.id,
      staffAvailabilities: { [alice.id]: [{ ...working, type: 'OFF', startTime: '09:10:00', endTime: '09:20:00' }] },
    })
    expect(screen.getAllByText('Off')).toHaveLength(1)
    const grid = container.querySelector('.calendar-grid')!
    const headers = view === 'week' ? 8 : 2
    const firstCell = grid.children[headers].children[1] as HTMLElement
    const nextCell = grid.children[headers + 1].children[1] as HTMLElement
    expect(within(firstCell).getByText('Off')).toBeInTheDocument()
    expect(within(nextCell).queryByText('Off')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    ['America/New_York', '05:00:00', '05:30:00'],
    ['Asia/Kolkata', '14:30:00', '15:00:00'],
  ])('displays tenant-local breaks at the correct UTC row for %s', (timezone, startTime, endTime) => {
    const { container } = draw(view, { timezone, selectedStaffId: alice.id,
      staffAvailabilities: { [alice.id]: [{ ...working, type: 'BREAK', startTime, endTime }] } })
    const grid = container.querySelector('.calendar-grid')!
    const firstCell = grid.children[view === 'week' ? 8 : 2].children[1] as HTMLElement
    expect(within(firstCell).getByText('Break')).toBeInTheDocument()
    expect(screen.getAllByText('Break')).toHaveLength(1)
    expect(within(firstCell).getByText(new RegExp(timezone))).toBeInTheDocument()
  })

  it('renders STAFF availability read-only without button roles or click handlers', () => {
    const { onSelectSlot } = draw(view, { canBook: false,
      availableSlots: [{ serviceId: short.id, startAt: '2026-09-14T09:00:00Z',
        endAt: '2026-09-14T09:30:00Z', availableStaff: [alice] }] })
    fireEvent.click(screen.getByText('Available'))
    expect(onSelectSlot).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
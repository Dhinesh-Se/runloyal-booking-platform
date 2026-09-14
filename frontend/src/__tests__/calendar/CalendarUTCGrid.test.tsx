import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { WeekView } from '@/features/calendar/WeekView'
import { DayView } from '@/features/calendar/DayView'
import { getWeekDays, getWeekStart } from '@/utils/dates'
import type { BookingResponse, StaffResponse, ServiceResponse } from '@/api/types'

const staff: StaffResponse = {
  id: 'staff-1', tenantId: 't-1', userId: null, name: 'Alice', status: 'ACTIVE',
}
const service: ServiceResponse = {
  id: 'svc-1', tenantId: 't-1', name: 'Grooming', description: null,
  category: 'Grooming', durationMinutes: 30, price: 50, status: 'ACTIVE',
}
const availableSlots = [{
  serviceId: service.id, startAt: '2026-09-13T09:30:00.000Z',
  endAt: '2026-09-13T10:00:00.000Z', availableStaff: [staff],
}]
const booking: BookingResponse = {
  id: 'booking-1', tenantId: 't-1', staffId: staff.id, serviceId: 'svc-1',
  startAt: '2026-09-13T09:00:00Z', endAt: '2026-09-13T09:30:00Z',
  status: 'CONFIRMED', customerName: 'September customer', petName: null,
}
const days = getWeekDays(getWeekStart(new Date('2026-09-13T23:00:00Z')))

describe('UTC calendar grid regression', () => {
  it('places the September 13 booking beneath Sunday 13, and clicks prefill that same date', () => {
    const onSelectBooking = vi.fn()
    const onSelectSlot = vi.fn()
    const { container } = render(<WeekView weekDays={days}
      timeSlots={[{ timeLabel: '09:00', minutes: 540 }, { timeLabel: '09:30', minutes: 570 }]}
      bookings={[booking]} staffList={[staff]} selectedStaffId={staff.id}
      services={[service]} availableSlots={availableSlots} canBook
      staffAvailabilities={{ [staff.id]: [{ id: 'a-1', tenantId: 't-1', staffId: staff.id,
        dayOfWeek: 'SUNDAY', type: 'WORKING', startTime: '09:00', endTime: '10:00' }] }}
      onSelectBooking={onSelectBooking} onSelectSlot={onSelectSlot} />)
    const grid = container.querySelector('.calendar-grid')!
    const headers = Array.from(grid.children).slice(1, 8)
    expect(headers.map(header => header.textContent)).toEqual([
      'Mon7 Sep', 'Tue8 Sep', 'Wed9 Sep', 'Thu10 Sep', 'Fri11 Sep', 'Sat12 Sep', 'Sun13 Sep',
    ])
    // Row children: time label, Monday ... Sunday. Assert placement, not just presence.
    const sundayCell = grid.children[8].children[7] as HTMLElement
    expect(within(sundayCell).getByText('September customer')).toBeInTheDocument()
    fireEvent.click(within(sundayCell).getByRole('button'))
    expect(onSelectBooking).toHaveBeenCalledWith('booking-1')
    fireEvent.click(screen.getByText('Available'))
    expect(onSelectSlot).toHaveBeenCalledWith('2026-09-13T09:30:00.000Z', 'staff-1', 'svc-1')
  })

  it.each(['week', 'day'] as const)('%s renders offset, partial-slot and midnight-spanning instants', view => {
    const onSelectBooking = vi.fn()
    const onSelectSlot = vi.fn()
    const props = {
      timeSlots: [{ timeLabel: '00:00', minutes: 0 }, { timeLabel: '00:30', minutes: 30 },
        { timeLabel: '09:00', minutes: 540 }, { timeLabel: '09:30', minutes: 570 }],
      bookings: [
        { ...booking, id: 'overnight', customerName: 'Overnight',
          startAt: '2026-09-12T23:45:00Z', endAt: '2026-09-13T00:15:00Z' },
        { ...booking, id: 'offset', customerName: 'Offset',
          startAt: '2026-09-12T21:15:00-12:00', endAt: '2026-09-12T21:20:00-12:00' },
        { ...booking, id: 'cancelled', customerName: 'Cancelled', status: 'CANCELLED' as const,
          startAt: '2026-09-13T09:30:00Z', endAt: '2026-09-13T10:00:00Z' },
      ],
      staffList: [staff], staffAvailabilities: {}, onSelectBooking, onSelectSlot,
      services: [service], availableSlots, canBook: true,
    }
    const { container } = render(view === 'week'
      ? <WeekView {...props} weekDays={days} />
      : <DayView {...props} currentDate={days[6]} />)
    const grid = container.querySelector('.calendar-grid')!
    const headerCount = view === 'week' ? 8 : 2
    const column = view === 'week' ? 7 : 1
    const cell = (row: number) => grid.children[headerCount + row].children[column] as HTMLElement
    expect(within(cell(0)).getByText('Overnight')).toBeInTheDocument()
    expect(within(cell(1)).queryByText('Overnight')).not.toBeInTheDocument()
    expect(within(cell(2)).getByText('Offset')).toBeInTheDocument()
    expect(within(cell(3)).queryByText('Offset')).not.toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
    fireEvent.click(within(cell(2)).getByRole('button'))
    expect(onSelectBooking).toHaveBeenCalledWith('offset')
    fireEvent.click(within(cell(3)).getByRole('button'))
    expect(onSelectSlot).toHaveBeenCalledWith('2026-09-13T09:30:00.000Z', staff.id, service.id)
  })

  it.each(['week', 'day'] as const)('%s excludes touching boundaries and fills partially occupied slots', view => {
    const props = {
      timeSlots: [{ timeLabel: '08:30', minutes: 510 }, { timeLabel: '09:00', minutes: 540 },
        { timeLabel: '09:30', minutes: 570 }],
      bookings: [{ ...booking, startAt: '2026-09-13T09:00:00Z', endAt: '2026-09-13T09:30:00Z' }],
      staffList: [staff], staffAvailabilities: {}, onSelectBooking: vi.fn(), onSelectSlot: vi.fn(),
    }
    render(view === 'week' ? <WeekView {...props} weekDays={days} />
      : <DayView {...props} currentDate={days[6]} />)
    expect(screen.getAllByText('September customer')).toHaveLength(1)
  })
})
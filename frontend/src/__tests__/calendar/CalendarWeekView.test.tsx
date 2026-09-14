import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekView } from '@/features/calendar/WeekView'
import { getWeekDays } from '@/utils/dates'
import type { BookingResponse, AvailabilityResponse, StaffResponse, ServiceResponse } from '@/api/types'

describe('Calendar WeekView', () => {
  const baseDate = new Date('2026-09-14T00:00:00Z') // A Monday
  const weekDays = getWeekDays(baseDate)

  const timeSlots = [
    { timeLabel: '09:00', minutes: 540 },
    { timeLabel: '09:30', minutes: 570 },
    { timeLabel: '10:00', minutes: 600 },
  ]

  const mockServices: ServiceResponse[] = [
    {
      id: 'svc-1',
      tenantId: 't-1',
      name: 'Dog Grooming',
      description: null,
      category: 'Grooming',
      durationMinutes: 30,
      price: 50,
      status: 'ACTIVE',
    },
  ]

  const mockStaff: StaffResponse[] = [
    {
      id: 'staff-1',
      tenantId: 't-1',
      userId: null,
      name: 'Alice Walker',
      status: 'ACTIVE',
    },
  ]

  const mockBookings: BookingResponse[] = [
    {
      id: 'book-1',
      tenantId: 't-1',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      startAt: '2026-09-14T09:00:00Z',
      endAt: '2026-09-14T09:30:00Z',
      status: 'CONFIRMED',
      customerName: 'John Smith',
      petName: 'Rex',
    },
  ]

  const mockAvailabilities: Record<string, AvailabilityResponse[]> = {
    'staff-1': [
      {
        id: 'av-1',
        tenantId: 't-1',
        staffId: 'staff-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:00:00',
        endTime: '17:00:00',
        type: 'WORKING',
      },
    ],
  }

  it('renders all 7 day headers and time slots', () => {
    render(
      <WeekView
        weekDays={weekDays}
        timeSlots={timeSlots}
        bookings={[]}
        staffAvailabilities={{}}
        onSelectSlot={vi.fn()}
        onSelectBooking={vi.fn()}
      />
    )

    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Tue')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('09:30')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('renders booked appointment block and triggers onSelectBooking on click', async () => {
    const handleSelectBooking = vi.fn()
    const user = userEvent.setup()

    render(
      <WeekView
        weekDays={weekDays}
        timeSlots={timeSlots}
        bookings={mockBookings}
        staffAvailabilities={mockAvailabilities}
        staffList={mockStaff}
        services={mockServices}
        onSelectSlot={vi.fn()}
        onSelectBooking={handleSelectBooking}
      />
    )

    const bookedBlock = screen.getByText(/John Smith \(Rex\)/i)
    expect(bookedBlock).toBeInTheDocument()

    await user.click(bookedBlock)
    expect(handleSelectBooking).toHaveBeenCalledWith('book-1')
  })

  it('renders only starts explicitly returned by backend eligibility', async () => {
    const handleSelectSlot = vi.fn()
    const user = userEvent.setup()

    render(
      <WeekView
        weekDays={weekDays}
        timeSlots={timeSlots}
        bookings={mockBookings} // has booking at 09:00-09:30
        availableSlots={[{
          serviceId: 'svc-1', startAt: '2026-09-14T09:30:00.000Z',
          endAt: '2026-09-14T10:00:00.000Z', availableStaff: mockStaff,
        }]}
        canBook
        staffAvailabilities={mockAvailabilities}
        staffList={mockStaff}
        services={mockServices}
        onSelectSlot={handleSelectSlot}
        onSelectBooking={vi.fn()}
      />
    )

    // 10:00 is also inside WORKING, but no backend slot means it is not available.
    const availableBlocks = screen.getAllByText('Available')
    expect(availableBlocks).toHaveLength(1)

    await user.click(availableBlocks[0])
    expect(handleSelectSlot).toHaveBeenCalledWith('2026-09-14T09:30:00.000Z', 'staff-1', 'svc-1')
  })
})

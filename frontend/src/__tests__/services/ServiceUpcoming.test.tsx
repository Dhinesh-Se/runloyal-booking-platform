import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { listStaff } from '@/api/staff'
import { listBookings } from '@/api/bookings'
import { getAvailableSlots } from '@/features/calendar/availableSlots'
import { BookingModal } from '@/features/bookings/BookingModal'
import { BookingDetail } from '@/features/bookings/BookingDetail'
import { ServiceUpcoming } from '@/features/services/ServiceUpcoming'
import { futureSevenDays, formatServiceUTC, upcomingServiceBookings, upcomingServiceSlots } from '@/features/services/useServiceUpcoming'
import { admin, alice, bob, booking, inactiveStaff, NOW, renderServiceView, service, slot } from './fixtures'

vi.mock('@/api/auth', () => ({ getMe: vi.fn() }))
vi.mock('@/api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('@/api/bookings', () => ({ listBookings: vi.fn() }))
vi.mock('@/features/calendar/availableSlots', () => ({ getAvailableSlots: vi.fn() }))
vi.mock('@/features/bookings/BookingModal', () => ({
  BookingModal: vi.fn(({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="New Booking">
    <button onClick={onClose}>Close booking form</button>
  </div>),
}))
vi.mock('@/features/bookings/BookingDetail', () => ({
  // Deliberately unsafe: the services boundary must never mount this for STAFF.
  BookingDetail: vi.fn(() => <div role="dialog" aria-label="Shared Booking Details"><button>Cancel Booking</button></div>),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listStaff).mockResolvedValue([alice, bob, inactiveStaff])
  vi.mocked(listBookings).mockResolvedValue([booking])
  vi.mocked(getAvailableSlots).mockResolvedValue([slot])
  vi.mocked(BookingModal).mockImplementation(({ onClose }) => <div role="dialog" aria-label="New Booking">
    <button onClick={onClose}>Close booking form</button>
  </div>)
  vi.mocked(BookingDetail).mockImplementation(() => <div role="dialog" aria-label="Shared Booking Details"><button>Cancel Booking</button></div>)
})
afterEach(() => vi.restoreAllMocks())

describe('service UTC range and filters', () => {
  it('uses seven elapsed UTC days across DST and formats offset instants in UTC', () => {
    const range = futureSevenDays(Date.parse('2026-10-31T23:45:00Z'))
    expect(range).toEqual({ from: '2026-10-31T23:45:00.000Z', to: '2026-11-07T23:45:00.000Z' })
    expect(formatServiceUTC('2026-09-15T14:30:00+05:30')).toBe('2026-09-15 09:00 UTC')
  })

  it('excludes cancelled, ended, other-service, invalid and upper-bound bookings; includes in-progress', () => {
    const { from, to } = futureSevenDays(NOW)
    const ongoing = { ...booking, id: 'ongoing', startAt: '2026-09-14T12:00:00Z', endAt: '2026-09-14T13:00:00Z' }
    const result = upcomingServiceBookings([
      booking, ongoing,
      { ...booking, id: 'cancelled', status: 'CANCELLED' },
      { ...booking, id: 'ended', startAt: '2026-09-14T11:00:00Z', endAt: from },
      { ...booking, id: 'other', serviceId: 'another-service' },
      { ...booking, id: 'boundary', startAt: to, endAt: '2026-09-21T13:15:00Z' },
      { ...booking, id: 'invalid', startAt: 'invalid' },
    ], service.id, from, to)
    expect(result.map(item => item.id)).toEqual(['ongoing', booking.id])
  })

  it('filters inactive staff from both sources, selected staff and out-of-range slots', () => {
    const { from, to } = futureSevenDays(NOW)
    const nearBoundary = { ...slot, startAt: '2026-09-21T12:00:00Z', endAt: '2026-09-21T13:00:00Z' }
    const result = upcomingServiceSlots([
      nearBoundary, slot,
      { ...slot, startAt: '2026-09-14T12:00:00Z' },
      { ...slot, startAt: to, endAt: '2026-09-21T13:15:00Z' },
      { ...slot, startAt: 'invalid' },
      { ...slot, availableStaff: [inactiveStaff] },
    ], [alice, bob, inactiveStaff], from, to, alice.id)
    expect(result.map(item => item.startAt)).toEqual([slot.startAt, nearBoundary.startAt])
    expect(result.every(item => item.availableStaff.length === 1 && item.availableStaff[0].id === alice.id)).toBe(true)
    expect(upcomingServiceSlots([slot], [{ ...alice, status: 'INACTIVE' }], from, to)).toEqual([])
  })
})

describe('ServiceUpcoming', () => {
  it('queries UTC bounds with end padding and prefills the existing modal with service, instant and chosen staff', async () => {
    const user = userEvent.setup()
    renderServiceView(<ServiceUpcoming service={service} />)
    await user.click(await screen.findByRole('button', { name: 'Book Bob at 2026-09-15 09:00 UTC' }))
    expect(listBookings).toHaveBeenCalledWith('2026-09-14T12:15:00.000Z', '2026-09-21T12:15:00.000Z')
    expect(getAvailableSlots).toHaveBeenCalledWith(service.id, '2026-09-14T12:15:00.000Z', '2026-09-21T13:15:00.000Z')
    expect(screen.getByRole('heading', { name: 'Upcoming availability (UTC)' })).toBeInTheDocument()
    expect(vi.mocked(BookingModal).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      isOpen: true, initialServiceId: service.id, initialStartAt: slot.startAt, initialStaffId: bob.id,
    }))
    await user.click(screen.getByRole('button', { name: 'Close booking form' }))
    expect(screen.queryByRole('dialog', { name: 'New Booking' })).not.toBeInTheDocument()
  })

  it.each([
    { durationMinutes: 1, paddingMinutes: 1 },
    // Do not impose a 24-hour duration cap: a local day can be longer at DST end.
    { durationMinutes: 25 * 60, paddingMinutes: 25 * 60 },
    { durationMinutes: 24 * 24 * 60, paddingMinutes: 24 * 24 * 60 },
    { durationMinutes: 24 * 24 * 60 + 1, paddingMinutes: 0 },
    { durationMinutes: 31 * 24 * 60, paddingMinutes: 0 },
    { durationMinutes: 2_147_483_647, paddingMinutes: 0 },
    { durationMinutes: Number.MAX_VALUE, paddingMinutes: 0 },
    { durationMinutes: Number.NaN, paddingMinutes: 0 },
  ])('bounds slot requests for duration $durationMinutes without changing the service', async ({ durationMinutes, paddingMinutes }) => {
    vi.mocked(getAvailableSlots).mockResolvedValue([])
    const longService = { ...service, durationMinutes }
    renderServiceView(<ServiceUpcoming service={longService} />)
    await screen.findByText('No available slots in the next seven days for this selection.')
    const { from, to } = futureSevenDays(NOW)
    const paddedTo = new Date(Date.parse(to) + paddingMinutes * 60_000).toISOString()
    expect(getAvailableSlots).toHaveBeenCalledWith(service.id, from, paddedTo)
    expect(Date.parse(paddedTo) - Date.parse(from)).toBeLessThanOrEqual(31 * 24 * 60 * 60_000)
    expect(listBookings).toHaveBeenCalledWith(from, to)
    expect(longService.durationMinutes).toBe(durationMinutes)
  })

  it('shows only active staff in availability and filters selectable slots without filtering bookings', async () => {
    const user = userEvent.setup()
    renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: /Book Alice at/ })
    expect(screen.queryByRole('option', { name: inactiveStaff.name })).not.toBeInTheDocument()
    expect(screen.queryByText('Book with Inactive Staff')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Available staff'), bob.id)
    expect(screen.queryByRole('button', { name: /Book Alice at/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Book Bob at/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View booking for Jane' })).toBeInTheDocument()
  })

  it('opens shared BookingDetail for an admin', async () => {
    const user = userEvent.setup()
    renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: /Book Alice at/ })
    await user.click(screen.getByRole('button', { name: 'View booking for Jane' }))
    expect(vi.mocked(BookingDetail).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ bookingId: booking.id, isOpen: true }))
  })

  it.each(['staff', 'loading', 'error', 'inactive-admin'] as const)('fails closed for %s and never mounts unsafe cancellation', async mode => {
    const user = userEvent.setup()
    if (mode === 'staff') vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    if (mode === 'loading') vi.mocked(getMe).mockReturnValue(new Promise(() => {}))
    if (mode === 'error') vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    if (mode === 'inactive-admin') vi.mocked(getMe).mockResolvedValue({ ...admin, status: 'INACTIVE' })
    renderServiceView(<ServiceUpcoming service={service} />)
    await user.click(await screen.findByRole('button', { name: 'View booking for Jane' }))
    expect(screen.getByText('Booking Details (read-only)')).toBeInTheDocument()
    expect(screen.getByText('Start (UTC)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument()
    expect(BookingDetail).not.toHaveBeenCalled()
    expect(BookingModal).not.toHaveBeenCalled()
  })

  it('unmounts an open creation form if identity becomes unknown', async () => {
    const user = userEvent.setup()
    const { client } = renderServiceView(<ServiceUpcoming service={service} />)
    await user.click(await screen.findByRole('button', { name: /Book Alice at/ }))
    expect(screen.getByRole('dialog', { name: 'New Booking' })).toBeInTheDocument()
    vi.mocked(getMe).mockRejectedValue(new Error('Identity expired'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['me'] }) })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Booking' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
  })

  it('replaces an open cancellation-capable detail with read-only details after role loss', async () => {
    const user = userEvent.setup()
    const { client } = renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: /Book Alice at/ })
    await user.click(screen.getByRole('button', { name: 'View booking for Jane' }))
    expect(screen.getByRole('button', { name: 'Cancel Booking' })).toBeInTheDocument()
    await act(async () => { client.setQueryData(['me'], { ...admin, role: 'STAFF' }) })
    expect(await screen.findByText('Booking Details (read-only)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Shared Booking Details' })).not.toBeInTheDocument()
  })

  it('shows independent errors, not empty data, and retries availability', async () => {
    const user = userEvent.setup()
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('Slots offline'))
    vi.mocked(listBookings).mockRejectedValue(new Error('Bookings offline'))
    renderServiceView(<ServiceUpcoming service={service} />)
    const availability = screen.getByRole('region', { name: 'Upcoming availability (UTC)' })
    const bookings = screen.getByRole('region', { name: 'Upcoming bookings (UTC)' })
    expect(await within(availability).findByRole('alert')).toHaveTextContent('Slots offline')
    expect(await within(bookings).findByRole('alert')).toHaveTextContent('Bookings offline')
    expect(screen.queryByText(/No available slots/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No upcoming bookings/)).not.toBeInTheDocument()
    vi.mocked(getAvailableSlots).mockResolvedValue([slot])
    await user.click(within(availability).getByRole('button', { name: 'Try Again' }))
    expect(await screen.findByRole('button', { name: /Book Alice at/ })).toBeInTheDocument()
    expect(within(bookings).getByRole('alert')).toHaveTextContent('Bookings offline')
  })

  it('reports staff lookup failure honestly and does not offer slots from stale staff', async () => {
    const { client } = renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: /Book Alice at/ })
    vi.mocked(listStaff).mockRejectedValue(new Error('Staff offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['staff'] }) })
    expect(await screen.findByText('Staff offline')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View booking for Jane' })).toBeInTheDocument()
  })

  it('shows genuine empty results separately from loading and inactive services', async () => {
    vi.mocked(getAvailableSlots).mockResolvedValue([])
    vi.mocked(listBookings).mockResolvedValue([])
    renderServiceView(<ServiceUpcoming service={service} />)
    expect(await screen.findByText('No upcoming bookings for this service.')).toBeInTheDocument()
    expect(await screen.findByText('No available slots in the next seven days for this selection.')).toBeInTheDocument()
  })

  it('does not request slots for an inactive service or an empty active-staff roster', async () => {
    const first = renderServiceView(<ServiceUpcoming service={{ ...service, status: 'INACTIVE' }} />)
    await screen.findByRole('button', { name: 'View booking for Jane' })
    expect(screen.getByText('This service is inactive. New bookings are unavailable.')).toBeInTheDocument()
    expect(getAvailableSlots).not.toHaveBeenCalled()
    first.unmount()
    vi.mocked(listStaff).mockResolvedValue([inactiveStaff])
    renderServiceView(<ServiceUpcoming service={service} />)
    expect(await screen.findByText('No active staff available.')).toBeInTheDocument()
    expect(getAvailableSlots).not.toHaveBeenCalled()
  })

  it('shows pending loading, never a false empty result', async () => {
    vi.mocked(getAvailableSlots).mockReturnValue(new Promise(() => {}))
    vi.mocked(listBookings).mockReturnValue(new Promise(() => {}))
    renderServiceView(<ServiceUpcoming service={service} />)
    expect(await screen.findByText('Loading availability…')).toBeInTheDocument()
    expect(screen.getByText('Loading bookings…')).toBeInTheDocument()
    expect(screen.queryByText(/No upcoming bookings/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
  })

  it('keys both reads under calendar and refreshes them on parent invalidation; hides stale availability on failure', async () => {
    const { client } = renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: /Book Alice at/ })
    const keys = client.getQueryCache().getAll().map(query => query.queryKey)
    expect(keys.filter(key => key.includes('service-upcoming'))).toHaveLength(2)
    expect(keys.filter(key => key.includes('service-upcoming')).every(key => key[0] === 'calendar')).toBe(true)
    expect(keys.filter(key => key[0] === 'bookings')).toHaveLength(0)
    const slotCalls = vi.mocked(getAvailableSlots).mock.calls.length
    const bookingCalls = vi.mocked(listBookings).mock.calls.length
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('Refresh failed'))
    vi.mocked(listBookings).mockResolvedValue([{ ...booking, status: 'CANCELLED' }])
    await act(async () => { await client.invalidateQueries({ queryKey: ['calendar'] }) })
    await waitFor(() => expect(getAvailableSlots).toHaveBeenCalledTimes(slotCalls + 1))
    expect(listBookings).toHaveBeenCalledTimes(bookingCalls + 1)
    expect(await screen.findByText('Refresh failed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View booking for Jane' })).not.toBeInTheDocument()
  })

  it('removes ended, cancelled and other service bookings from the visible list', async () => {
    vi.mocked(listBookings).mockResolvedValue([
      booking,
      { ...booking, id: 'cancelled', customerName: 'Cancelled Customer', status: 'CANCELLED' },
      { ...booking, id: 'other', customerName: 'Other Customer', serviceId: 'other' },
      { ...booking, id: 'ended', customerName: 'Ended Customer', startAt: '2026-09-14T10:00:00Z', endAt: '2026-09-14T11:00:00Z' },
    ])
    renderServiceView(<ServiceUpcoming service={service} />)
    await screen.findByRole('button', { name: 'View booking for Jane' })
    expect(screen.queryByRole('button', { name: /View booking for (Cancelled|Other|Ended)/ })).not.toBeInTheDocument()
  })
})
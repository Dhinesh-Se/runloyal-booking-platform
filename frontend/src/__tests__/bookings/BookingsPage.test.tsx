import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingsPage } from '@/features/bookings/BookingsPage'
import { listBookings } from '@/api/bookings'
import type { BookingResponse, UserResponse } from '@/api/types'
import { activeAdmin, booking, renderBooking, services, staff } from './bookingTestUtils'

let meResult: { data: UserResponse | undefined; isPending: boolean; isError: boolean }
let bookings: BookingResponse[]
const cancelMutation = vi.fn()
const bookingsQuery = vi.fn()

vi.mock('@/hooks/useMe', () => ({ useMe: () => meResult }))
vi.mock('@/features/services/useServices', () => ({ useServices: () => ({ data: services, isLoading: false }) }))
vi.mock('@/features/staff/useStaff', () => ({ useStaff: () => ({ data: staff }) }))
vi.mock('@/api/staff', () => ({ getAvailableStaffForSlot: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/bookings', () => ({
  listBookings: vi.fn(), getBooking: vi.fn(), createBooking: vi.fn(), cancelBooking: vi.fn(),
}))
vi.mock('@/features/bookings/useBookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/bookings/useBookings')>()
  return {
    useBookings: (...args: Parameters<typeof actual.useBookings>) => {
      bookingsQuery(...args)
      return actual.useBookings(...args)
    },
    useBooking: (id: string) => ({ data: id ? booking : undefined, isLoading: false, isError: false }),
    useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCancelBooking: () => ({ mutateAsync: cancelMutation, isPending: false }),
  }
})

describe('BookingsPage role gates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-14T23:30:00Z'))
    meResult = { data: activeAdmin, isPending: false, isError: false }
    bookings = []
    vi.mocked(listBookings).mockReset().mockImplementation(async () => bookings)
    cancelMutation.mockClear()
    bookingsQuery.mockClear()
  })

  afterEach(() => { vi.useRealTimers() })

  it('shows both create entry points for an active tenant administrator', async () => {
    renderBooking(<BookingsPage />)
    expect(screen.getByRole('button', { name: 'New Booking' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Create First Booking' })).toBeInTheDocument()
  })

  it.each([
    ['STAFF', { ...activeAdmin, role: 'STAFF' as const }, false, false],
    ['inactive admin', { ...activeAdmin, status: 'INACTIVE' as const }, false, false],
    ['unresolved identity', undefined, true, false],
    ['failed identity with cached admin data', activeAdmin, false, true],
  ])('hides both create entry points for %s', async (_label, data, isPending, isError) => {
    meResult = { data, isPending, isError }
    renderBooking(<BookingsPage />)
    expect(await screen.findByText('No bookings found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Booking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create First Booking' })).not.toBeInTheDocument()
  })

  it('lets STAFF open shared booking details from the list without cancellation controls', async () => {
    bookings = [booking]
    meResult = { ...meResult, data: { ...activeAdmin, role: 'STAFF' } }
    const user = userEvent.setup()
    renderBooking(<BookingsPage />)
    await user.click(await screen.findByRole('button', { name: 'View' }))
    const details = screen.getByRole('dialog')
    expect(within(details).getByRole('heading', { name: 'Booking Details' })).toBeInTheDocument()
    expect(within(details).getByText(booking.customerName)).toBeInTheDocument()
    expect(within(details).getByText('Booked duration: 45 min')).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: /Cancel Booking/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Booking' })).not.toBeInTheDocument()
    expect(cancelMutation).not.toHaveBeenCalled()
  })

  it('closes an open create dialog if the user loses the admin role', async () => {
    const user = userEvent.setup()
    const { rerender } = renderBooking(<BookingsPage />)
    await user.click(screen.getByRole('button', { name: 'New Booking' }))
    expect(screen.getByRole('heading', { name: 'New Booking' })).toBeInTheDocument()
    meResult = { ...meResult, data: { ...activeAdmin, role: 'STAFF' } }
    rerender(<BookingsPage />)
    expect(screen.queryByRole('heading', { name: 'New Booking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Booking' })).not.toBeInTheDocument()
  })

  it('defaults to UTC today through today + 30 inclusive and never requests more than 31 days', async () => {
    renderBooking(<BookingsPage />)
    expect(screen.getByLabelText('Bookings from date (UTC)')).toHaveValue('2026-09-14')
    expect(screen.getByLabelText('Bookings to date (UTC)')).toHaveValue('2026-10-14')
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith('2026-09-14T00:00:00Z', '2026-10-15T00:00:00.000Z'))
    for (const [from, to] of vi.mocked(listBookings).mock.calls) {
      expect(Date.parse(to) - Date.parse(from)).toBeLessThanOrEqual(31 * 86_400_000)
    }
  })

  it('blocks a 32-day inclusive range with a visible hint and no API fetch, then allows 31 days', async () => {
    bookings = [booking]
    const { queryClient } = renderBooking(<BookingsPage />)
    await screen.findByRole('table', { name: 'Bookings list' })
    vi.mocked(listBookings).mockClear()
    fireEvent.change(screen.getByLabelText('Bookings to date (UTC)'), { target: { value: '2026-10-15' } })
    expect(bookingsQuery).toHaveBeenLastCalledWith('2026-09-14T00:00:00Z', '2026-10-16T00:00:00.000Z', { enabled: false })
    expect(screen.getByRole('alert')).toHaveTextContent(/maximum of 31 days, including both dates/i)
    expect(screen.getByLabelText('Bookings to date (UTC)')).toHaveAccessibleDescription('Maximum 31 days, including both dates.')
    expect(screen.queryByRole('table', { name: 'Bookings list' })).not.toBeInTheDocument()
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['bookings'] }) })
    expect(listBookings).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Bookings to date (UTC)'), { target: { value: '2026-10-14' } })
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith('2026-09-14T00:00:00Z', '2026-10-15T00:00:00.000Z'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses an inclusive UTC date range with an exclusive next-midnight API bound', () => {
    renderBooking(<BookingsPage />)
    fireEvent.change(screen.getByLabelText('Bookings from date (UTC)'), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText('Bookings to date (UTC)'), { target: { value: '2026-09-15' } })
    expect(bookingsQuery).toHaveBeenLastCalledWith('2026-09-15T00:00:00Z', '2026-09-16T00:00:00.000Z', { enabled: true })
  })

  it('disables the list query and shows validation rather than cached results for an invalid range', async () => {
    bookings = [booking]
    renderBooking(<BookingsPage />)
    await screen.findByRole('table', { name: 'Bookings list' })
    fireEvent.change(screen.getByLabelText('Bookings from date (UTC)'), { target: { value: '2026-09-16' } })
    fireEvent.change(screen.getByLabelText('Bookings to date (UTC)'), { target: { value: '2026-09-15' } })
    expect(bookingsQuery).toHaveBeenLastCalledWith('2026-09-16T00:00:00Z', '2026-09-16T00:00:00.000Z', { enabled: false })
    expect(screen.getByText(/Enter valid dates/i)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Bookings list' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Bookings from date (UTC)'), { target: { value: '' } })
    expect(bookingsQuery).toHaveBeenLastCalledWith('', '2026-09-16T00:00:00.000Z', { enabled: false })
  })
})
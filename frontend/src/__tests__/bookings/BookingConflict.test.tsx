import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingModal } from '@/features/bookings/BookingModal'
import { createBooking } from '@/api/bookings'
import { getAvailableStaffForSlot } from '@/api/staff'
import type { StaffResponse } from '@/api/types'
import { activeAdmin, booking, deferred, renderBooking, services, staff } from './bookingTestUtils'

vi.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: activeAdmin, isPending: false, isError: false }),
}))
vi.mock('@/features/services/useServices', () => ({
  useServices: () => ({ data: services, isLoading: false }),
}))
vi.mock('@/api/staff', () => ({ getAvailableStaffForSlot: vi.fn() }))
vi.mock('@/api/bookings', () => ({
  createBooking: vi.fn(), listBookings: vi.fn(), getBooking: vi.fn(), cancelBooking: vi.fn(),
}))

describe('Booking Conflict Handling', () => {
  beforeEach(() => {
    vi.mocked(createBooking).mockReset().mockRejectedValue({ status: 409, message: 'Slot already taken' })
    vi.mocked(getAvailableStaffForSlot).mockReset().mockResolvedValue([staff[0]])
  })

  it('keeps the form open on 409, invalidates all booking views and refreshes eligibility before retry', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const refresh = deferred<StaffResponse[]>()
    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce([staff[0]]).mockReturnValueOnce(refresh.promise)
    const { queryClient } = renderBooking(
      <BookingModal isOpen onClose={onClose} initialServiceId="svc-1" initialStartAt={booking.startAt} />
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await waitFor(() => expect(screen.getByLabelText(/Staff Member/i)).toHaveValue('staff-1'))
    await user.type(screen.getByLabelText(/Customer Name/i), 'Concurrent Customer')
    await user.type(screen.getByLabelText(/Pet Name/i), 'Spot')
    await user.click(screen.getByRole('button', { name: 'Confirm Booking' }))
    expect(await screen.findByText(/That slot was just booked by someone else/i)).toBeInTheDocument()
    for (const key of ['bookings', 'calendar', 'available-staff']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] })
    }
    expect(screen.getByRole('button', { name: 'Confirm Booking' })).toBeDisabled()
    expect(screen.getByLabelText(/Staff Member/i)).toBeDisabled()
    await act(async () => { refresh.resolve([]) })
    expect(await screen.findByText(/No staff members are scheduled/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Staff Member/i)).toHaveValue('')
    expect(screen.getByLabelText(/Customer Name/i)).toHaveValue('Concurrent Customer')
    expect(screen.getByLabelText(/Pet Name/i)).toHaveValue('Spot')
    expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-09-15')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('09:00')
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an eligibility refresh failure alongside the booking conflict, never as no staff', async () => {
    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce([staff[0]]).mockRejectedValueOnce(new Error('Offline'))
    const user = userEvent.setup()
    renderBooking(<BookingModal isOpen onClose={vi.fn()} initialServiceId="svc-1" initialStartAt={booking.startAt} />)
    await waitFor(() => expect(screen.getByLabelText(/Staff Member/i)).toHaveValue('staff-1'))
    await user.type(screen.getByLabelText(/Customer Name/i), 'Concurrent Customer')
    await user.click(screen.getByRole('button', { name: 'Confirm Booking' }))
    expect(await screen.findByText(/That slot was just booked by someone else/i)).toBeInTheDocument()
    expect(await screen.findByText(/Unable to check staff availability/i)).toBeInTheDocument()
    expect(screen.queryByText(/No staff members are scheduled/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Booking' })).toBeDisabled()
  })
})

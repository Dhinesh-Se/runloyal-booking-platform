import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingDetail } from '@/features/bookings/BookingDetail'
import { renderWithProviders } from '../testUtils'
import type { UserResponse } from '@/api/types'
import { activeAdmin, renderBooking } from './bookingTestUtils'

let meResult: { data: UserResponse | undefined; isPending: boolean; isError: boolean }
vi.mock('@/hooks/useMe', () => ({ useMe: () => meResult }))

const mockBooking = {
  id: 'b-cancel-1',
  tenantId: 't-1',
  serviceId: 'svc-1',
  staffId: 'staff-1',
  startAt: '2026-09-16T10:00:00Z',
  endAt: '2026-09-16T10:45:00Z',
  status: 'CONFIRMED' as const,
  customerName: 'Carol Danvers',
  petName: 'Chewie',
}

const mockCancelMutate = vi.fn().mockResolvedValue({
  ...mockBooking,
  status: 'CANCELLED' as const,
})

vi.mock('@/features/bookings/useBookings', () => ({
  useBooking: () => ({
    data: mockBooking,
    isLoading: false,
    isError: false,
  }),
  useCancelBooking: () => ({
    mutateAsync: (...args: unknown[]) => mockCancelMutate(...args),
    isPending: false,
  }),
}))

vi.mock('@/features/services/useServices', () => ({
  useServices: () => ({
    data: [
      {
        id: 'svc-1',
        tenantId: 't-1',
        name: 'Deluxe Bath',
        description: null,
        category: 'Grooming',
        durationMinutes: 90,
        price: 60,
        status: 'ACTIVE' as const,
      },
    ],
  }),
}))

vi.mock('@/features/staff/useStaff', () => ({
  useStaff: () => ({
    data: [
      {
        id: 'staff-1',
        tenantId: 't-1',
        userId: null,
        name: 'Bruce Wayne',
        status: 'ACTIVE' as const,
      },
    ],
  }),
}))

describe('Booking Cancellation', () => {
  beforeEach(() => {
    meResult = { data: activeAdmin, isPending: false, isError: false }
    mockCancelMutate.mockClear()
  })

  it('uses the stored booking interval rather than current catalog duration and labels current pricing', () => {
    renderWithProviders(<BookingDetail bookingId="b-cancel-1" isOpen onClose={vi.fn()} />)
    expect(screen.getByText('Booked duration: 45 min')).toBeInTheDocument()
    expect(screen.queryByText(/90 min/)).not.toBeInTheDocument()
    expect(screen.getByText('Current catalog price: $60.00 (not a historical sale price)')).toBeInTheDocument()
  })

  it.each([
    ['STAFF', { ...activeAdmin, role: 'STAFF' as const }, false, false],
    ['inactive administrator', { ...activeAdmin, status: 'INACTIVE' as const }, false, false],
    ['unresolved identity', undefined, true, false],
    ['failed identity with cached admin data', activeAdmin, false, true],
  ])('lets %s read booking details without exposing cancellation', (_label, data, isPending, isError) => {
    meResult = { data, isPending, isError }
    renderWithProviders(<BookingDetail bookingId="b-cancel-1" isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Booking Details' })).toBeInTheDocument()
    expect(screen.getByText('Carol Danvers')).toBeInTheDocument()
    expect(screen.getByText('Chewie')).toBeInTheDocument()
    expect(screen.getByText('Deluxe Bath')).toBeInTheDocument()
    expect(screen.getByText('Bruce Wayne')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel Booking/i })).not.toBeInTheDocument()
    expect(screen.queryByText('This booking has been cancelled')).not.toBeInTheDocument()
    expect(mockCancelMutate).not.toHaveBeenCalled()
  })

  it('closes pending confirmation if the admin becomes STAFF, retaining read access', async () => {
    const user = userEvent.setup()
    const props = { bookingId: 'b-cancel-1', isOpen: true, onClose: vi.fn() }
    const { rerender } = renderBooking(<BookingDetail {...props} />)
    await user.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    expect(screen.getByRole('button', { name: 'Yes, Cancel Booking' })).toBeInTheDocument()
    meResult = { ...meResult, data: { ...activeAdmin, role: 'STAFF' } }
    rerender(<BookingDetail {...props} />)
    expect(screen.queryByRole('button', { name: /Cancel Booking/i })).not.toBeInTheDocument()
    expect(screen.getByText('Carol Danvers')).toBeInTheDocument()
    expect(mockCancelMutate).not.toHaveBeenCalled()
    meResult = { ...meResult, data: activeAdmin }
    rerender(<BookingDetail {...props} />)
    expect(screen.queryByRole('button', { name: 'Yes, Cancel Booking' })).not.toBeInTheDocument()
  })

  it('does not retain cancellation confirmation when the details modal is reopened', async () => {
    const user = userEvent.setup()
    const props = { bookingId: 'b-cancel-1', isOpen: true, onClose: vi.fn() }
    const { rerender } = renderBooking(<BookingDetail {...props} />)
    await user.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    rerender(<BookingDetail {...props} isOpen={false} />)
    rerender(<BookingDetail {...props} />)
    expect(screen.queryByRole('button', { name: 'Yes, Cancel Booking' })).not.toBeInTheDocument()
    expect(mockCancelMutate).not.toHaveBeenCalled()
  })

  it('displays booking details and handles cancellation flow with confirmation', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <BookingDetail
        bookingId="b-cancel-1"
        isOpen={true}
        onClose={handleClose}
      />
    )

    expect(screen.getByText('Carol Danvers')).toBeInTheDocument()
    expect(screen.getByText('Chewie')).toBeInTheDocument()
    expect(screen.getByText('Deluxe Bath')).toBeInTheDocument()
    expect(screen.getByText('Bruce Wayne')).toBeInTheDocument()

    // Click "Cancel Booking" button
    const cancelBtn = screen.getByRole('button', { name: /Cancel Booking/i })
    await user.click(cancelBtn)

    // Confirm dialog opens
    expect(screen.getByText(/Are you sure you want to cancel the booking for Carol Danvers/i)).toBeInTheDocument()

    // Click confirmation button in dialog
    const confirmBtn = screen.getByRole('button', { name: /Yes, Cancel Booking/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockCancelMutate).toHaveBeenCalledWith('b-cancel-1')
      expect(handleClose).toHaveBeenCalled()
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingDetail } from '@/features/bookings/BookingDetail'
import { renderWithProviders } from '../testUtils'

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
        durationMinutes: 45,
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

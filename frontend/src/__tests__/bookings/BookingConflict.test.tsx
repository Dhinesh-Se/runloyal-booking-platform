import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingModal } from '@/features/bookings/BookingModal'
import { renderWithProviders } from '../testUtils'

const { mockServices, mockStaff, mockCreateMutate } = vi.hoisted(() => ({
  mockServices: [
    {
      id: 'svc-1',
      tenantId: 't-1',
      name: 'Standard Dog Wash',
      description: null,
      category: 'Wash',
      durationMinutes: 30,
      price: 30,
      status: 'ACTIVE' as const,
    },
  ],
  mockStaff: [
    {
      id: 'staff-1',
      tenantId: 't-1',
      userId: null,
      name: 'Sarah Connor',
      status: 'ACTIVE' as const,
    },
  ],
  mockCreateMutate: vi.fn(),
}))

vi.mock('@/features/services/useServices', () => ({
  useServices: () => ({
    data: mockServices,
    isLoading: false,
  }),
}))

vi.mock('@/api/staff', () => ({
  getAvailableStaffForSlot: vi.fn().mockResolvedValue(mockStaff),
}))

vi.mock('@/features/bookings/useBookings', () => ({
  useCreateBooking: () => ({
    mutateAsync: (...args: unknown[]) => mockCreateMutate(...args),
  }),
}))

describe('Booking Conflict Handling', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    const conflictError = {
      response: {
        status: 409,
        statusText: 'Conflict',
        data: { message: 'Booking conflict: slot already taken' },
      },
      status: 409,
    }
    mockCreateMutate.mockRejectedValue(conflictError)
  })

  it('displays user-friendly 409 conflict message when slot is double-booked', async () => {
    const handleClose = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <BookingModal
        isOpen={true}
        onClose={handleClose}
        initialServiceId="svc-1"
        initialStartAt="2026-09-15T09:00:00Z"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/Customer Name/i), 'Concurrent Customer')

    const confirmBtn = screen.getByRole('button', { name: /Confirm Booking/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText(/That slot was just booked by someone else/i)).toBeInTheDocument()
    })

    // Modal should remain open to allow choosing another slot
    expect(handleClose).not.toHaveBeenCalled()
  })
})

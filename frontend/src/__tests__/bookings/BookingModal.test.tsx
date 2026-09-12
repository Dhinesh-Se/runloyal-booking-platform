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

describe('BookingModal', () => {
  beforeEach(() => {
    mockCreateMutate.mockReset()
    mockCreateMutate.mockResolvedValue({
      id: 'new-book-id',
      tenantId: 't-1',
      serviceId: 'svc-1',
      staffId: 'staff-1',
      startAt: '2026-09-15T09:00:00Z',
      endAt: '2026-09-15T09:30:00Z',
      status: 'CONFIRMED',
      customerName: 'Bob Vance',
      petName: 'Spot',
    })
  })

  it('renders booking fields with prefilled service and date', async () => {
    renderWithProviders(
      <BookingModal
        isOpen={true}
        onClose={vi.fn()}
        initialServiceId="svc-1"
        initialStartAt="2026-09-15T09:00:00Z"
      />
    )

    expect(screen.getByLabelText(/Service/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Customer Name/i)).toBeInTheDocument()

    // Staff selector populates with available staff
    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })
  })

  it('creates booking on valid submission', async () => {
    const handleSuccess = vi.fn()
    const handleClose = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <BookingModal
        isOpen={true}
        onClose={handleClose}
        initialServiceId="svc-1"
        initialStartAt="2026-09-15T09:00:00Z"
        onSuccess={handleSuccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/Customer Name/i), 'Bob Vance')
    await user.type(screen.getByLabelText(/Pet Name/i), 'Spot')

    const confirmBtn = screen.getByRole('button', { name: /Confirm Booking/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'svc-1',
          staffId: 'staff-1',
          customerName: 'Bob Vance',
          petName: 'Spot',
        })
      )
      expect(handleSuccess).toHaveBeenCalled()
      expect(handleClose).toHaveBeenCalled()
    })
  })
})

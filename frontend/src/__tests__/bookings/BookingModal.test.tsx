import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingModal } from '@/features/bookings/BookingModal'
import { getAvailableStaffForSlot } from '@/api/staff'
import type { ServiceResponse, StaffResponse, UserResponse } from '@/api/types'
import { activeAdmin, booking, deferred, renderBooking, services, staff } from './bookingTestUtils'

let servicesResult: { data: ServiceResponse[] | undefined; isLoading: boolean }
let meResult: { data: UserResponse | undefined; isPending: boolean; isError: boolean }
const mockCreateMutate = vi.fn()

vi.mock('@/hooks/useMe', () => ({ useMe: () => meResult }))
vi.mock('@/features/services/useServices', () => ({ useServices: () => servicesResult }))
vi.mock('@/api/staff', () => ({ getAvailableStaffForSlot: vi.fn() }))
vi.mock('@/features/bookings/useBookings', () => ({
  useCreateBooking: () => ({ mutateAsync: mockCreateMutate, isPending: false }),
}))

const initialProps = {
  isOpen: true, onClose: vi.fn(), initialServiceId: 'svc-1', initialStartAt: '2026-09-15T09:00:00Z',
}
const staffSelect = () => screen.getByLabelText(/Staff Member/i)
const confirmButton = () => screen.getByRole('button', { name: /Confirm Booking/i })
const customerInput = () => screen.getByLabelText(/Customer Name/i)
const submitForm = () => fireEvent.submit(customerInput().closest('form')!)
const availabilityKey = ['available-staff', 'svc-1', initialProps.initialStartAt]

async function expectReady() {
  await waitFor(() => expect(staffSelect()).toBeEnabled())
}

describe('BookingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    servicesResult = { data: services, isLoading: false }
    meResult = { data: activeAdmin, isPending: false, isError: false }
    vi.mocked(getAvailableStaffForSlot).mockReset().mockResolvedValue([staff[0]])
    mockCreateMutate.mockReset().mockResolvedValue(booking)
  })

  it('renders prefilled fields and fetches eligibility exactly once, including automatic staff selection', async () => {
    const { queryClient } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    expect(screen.getByLabelText(/^Service/i)).toHaveValue('svc-1')
    expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-09-15')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('09:00')
    expect(staffSelect()).toHaveValue('staff-1')
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(availabilityKey)).toEqual([staff[0]])
  })

  it('submits trimmed names and the UTC Instant as an active admin', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderBooking(<BookingModal {...initialProps} onSuccess={onSuccess} />)
    await expectReady()
    await user.type(customerInput(), '  Bob Vance  ')
    await user.type(screen.getByLabelText(/Pet Name/i), '  Spot  ')
    await user.click(confirmButton())
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledWith({
      serviceId: 'svc-1', staffId: 'staff-1', startAt: initialProps.initialStartAt,
      customerName: 'Bob Vance', petName: 'Spot',
    }))
    expect(onSuccess).toHaveBeenCalledWith(booking)
    expect(initialProps.onClose).toHaveBeenCalled()
  })

  it('rejects a whitespace-only customer before invoking the mutation', async () => {
    const user = userEvent.setup()
    renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.type(customerInput(), '   ')
    await user.click(confirmButton())
    expect(await screen.findByText('Customer name is required')).toBeInTheDocument()
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it.each([
    ['STAFF', { ...activeAdmin, role: 'STAFF' as const }, false, false],
    ['inactive admin', { ...activeAdmin, status: 'INACTIVE' as const }, false, false],
    ['unresolved identity', undefined, true, false],
    ['failed identity with cached admin data', activeAdmin, false, true],
  ])('blocks %s even when the form is submitted directly', async (_label, data, isPending, isError) => {
    meResult = { data, isPending, isError }
    const user = userEvent.setup()
    renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.type(customerInput(), 'Bob Vance')
    expect(confirmButton()).toBeDisabled()
    await act(async () => { submitForm() })
    expect(mockCreateMutate).not.toHaveBeenCalled()
    expect(screen.getAllByText('Only active tenant administrators can create bookings.').length).toBeGreaterThan(0)
  })

  it('rechecks permission when an open form loses the admin role', async () => {
    const user = userEvent.setup()
    const { rerender } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.type(customerInput(), 'Bob Vance')
    meResult = { ...meResult, data: { ...activeAdmin, role: 'STAFF' } }
    rerender(<BookingModal {...initialProps} />)
    await act(async () => { submitForm() })
    expect(confirmButton()).toBeDisabled()
    expect(mockCreateMutate).not.toHaveBeenCalled()
  })

  it('does not query a closed modal or invalid Instant prefill', () => {
    const { rerender } = renderBooking(<BookingModal {...initialProps} isOpen={false} />)
    expect(getAvailableStaffForSlot).not.toHaveBeenCalled()
    rerender(<BookingModal {...initialProps} initialStartAt="not-an-instant" />)
    expect(getAvailableStaffForSlot).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Date/i)).toHaveValue('')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('')
    expect(confirmButton()).toBeDisabled()
    expect(screen.queryByText(/No staff members are scheduled/i)).not.toBeInTheDocument()
  })

  it('does not requery an edited slot before resetting its prefill on reopen', async () => {
    const { rerender } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '10:00' } })
    await expectReady()
    rerender(<BookingModal {...initialProps} isOpen={false} />)
    vi.mocked(getAvailableStaffForSlot).mockClear()
    rerender(<BookingModal {...initialProps} />)
    await expectReady()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
    expect(getAvailableStaffForSlot).toHaveBeenCalledWith('svc-1', initialProps.initialStartAt)
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('09:00')
  })

  it('blocks invalid prefill changes on an open modal without reusing cached eligibility', async () => {
    const { rerender, queryClient } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    vi.mocked(getAvailableStaffForSlot).mockClear()
    rerender(<BookingModal {...initialProps} initialStartAt="not-an-instant" />)
    expect(confirmButton()).toBeDisabled()
    expect(staffSelect()).toBeDisabled()
    expect(screen.getByLabelText(/Date/i)).toHaveValue('')
    expect(screen.queryByText(/Ends at/i)).not.toBeInTheDocument()
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['available-staff'] }) })
    expect(getAvailableStaffForSlot).not.toHaveBeenCalled()
  })

  it('does not query or submit a selected inactive service', async () => {
    servicesResult = { data: [{ ...services[0], status: 'INACTIVE' }], isLoading: false }
    renderBooking(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    fireEvent.change(customerInput(), { target: { value: 'Bob Vance' } })
    await act(async () => { submitForm() })
    expect(getAvailableStaffForSlot).not.toHaveBeenCalled()
    expect(mockCreateMutate).not.toHaveBeenCalled()
    expect(confirmButton()).toBeDisabled()
    expect(screen.getByText('Please select an active service.')).toBeInTheDocument()
  })

  it('blocks stale eligibility when the selected service becomes inactive during refresh', async () => {
    const { rerender } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    servicesResult = { data: [{ ...services[0], status: 'INACTIVE' }], isLoading: false }
    rerender(<BookingModal {...initialProps} />)
    expect(confirmButton()).toBeDisabled()
    expect(staffSelect()).toBeDisabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
  })

  it('distinguishes request failure from empty eligibility and supports retry', async () => {
    vi.mocked(getAvailableStaffForSlot).mockRejectedValueOnce(new Error('Network unavailable'))
    const user = userEvent.setup()
    renderBooking(<BookingModal {...initialProps} />)
    expect(await screen.findByText(/Unable to check staff availability/i)).toBeInTheDocument()
    expect(screen.queryByText(/No staff members are scheduled/i)).not.toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry availability' }))
    await expectReady()
    expect(staffSelect()).toHaveValue('staff-1')
    expect(confirmButton()).toBeEnabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
  })

  it('shows no eligible staff only after a successful empty response', async () => {
    vi.mocked(getAvailableStaffForSlot).mockResolvedValue([])
    renderBooking(<BookingModal {...initialProps} />)
    expect(await screen.findByText(/No staff members are scheduled/i)).toBeInTheDocument()
    expect(screen.queryByText(/Unable to check staff availability/i)).not.toBeInTheDocument()
    expect(confirmButton()).toBeDisabled()
  })

  it('keeps manual staff selection without fetching again or reapplying the initial staff', async () => {
    vi.mocked(getAvailableStaffForSlot).mockResolvedValue(staff)
    const user = userEvent.setup()
    const { queryClient } = renderBooking(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    await expectReady()
    await user.selectOptions(staffSelect(), 'staff-2')
    expect(staffSelect()).toHaveValue('staff-2')
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['available-staff'] }) })
    await expectReady()
    expect(staffSelect()).toHaveValue('staff-2')
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
  })

  it('fails closed during a background refresh, then preserves an eligible choice and customer', async () => {
    const pending = deferred<StaffResponse[]>()
    const user = userEvent.setup()
    const { queryClient } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.type(customerInput(), 'Customer survives')
    vi.mocked(getAvailableStaffForSlot).mockReturnValueOnce(pending.promise)
    act(() => { void queryClient.invalidateQueries({ queryKey: ['available-staff'] }) })
    await waitFor(() => expect(confirmButton()).toBeDisabled())
    expect(staffSelect()).toBeDisabled()
    await act(async () => { submitForm() })
    expect(mockCreateMutate).not.toHaveBeenCalled()
    await act(async () => { pending.resolve([staff[0]]) })
    await expectReady()
    expect(confirmButton()).toBeEnabled()
    expect(staffSelect()).toHaveValue('staff-1')
    expect(customerInput()).toHaveValue('Customer survives')
  })

  it('fails closed on background errors even when eligible staff remain cached', async () => {
    const { queryClient } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    vi.mocked(getAvailableStaffForSlot).mockRejectedValueOnce(new Error('Refresh failed'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['available-staff'] }) })
    expect(await screen.findByText(/Unable to check staff availability/i)).toBeInTheDocument()
    expect(queryClient.getQueryData(availabilityKey)).toEqual([staff[0]])
    expect(confirmButton()).toBeDisabled()
    expect(staffSelect()).toBeDisabled()
    expect(screen.queryByText(/No staff members are scheduled/i)).not.toBeInTheDocument()
  })

  it('clears an invalid selection after refresh without selecting a different member or looping', async () => {
    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce(staff).mockResolvedValue([staff[1]])
    const { queryClient } = renderBooking(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    await expectReady()
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['available-staff'] }) })
    await expectReady()
    expect(staffSelect()).toHaveValue('')
    expect(confirmButton()).toBeDisabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
  })

  it('reconciles a changed staff prefill using the current cache without making another request', async () => {
    vi.mocked(getAvailableStaffForSlot).mockResolvedValue(staff)
    const { rerender } = renderBooking(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    await expectReady()
    rerender(<BookingModal {...initialProps} initialStaffId="staff-2" />)
    expect(staffSelect()).toHaveValue('staff-2')
    rerender(<BookingModal {...initialProps} initialStaffId="unavailable-staff" />)
    await waitFor(() => expect(staffSelect()).toHaveValue(''))
    expect(confirmButton()).toBeDisabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
  })

  it('uses separate service caches and clears a provider that is ineligible for the new service', async () => {
    servicesResult = { data: [...services, { ...services[0], id: 'svc-2', name: 'Deluxe Bath' }], isLoading: false }
    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce([staff[0]]).mockResolvedValueOnce([staff[1]])
    const user = userEvent.setup()
    const { queryClient } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.selectOptions(screen.getByLabelText(/^Service/i), 'svc-2')
    await expectReady()
    expect(staffSelect()).toHaveValue('')
    expect(confirmButton()).toBeDisabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
    expect(getAvailableStaffForSlot).toHaveBeenLastCalledWith('svc-2', initialProps.initialStartAt)
    expect(queryClient.getQueryData(availabilityKey)).toEqual([staff[0]])
    expect(queryClient.getQueryData(['available-staff', 'svc-2', initialProps.initialStartAt])).toEqual([staff[1]])
    await user.selectOptions(staffSelect(), 'staff-2')
    expect(confirmButton()).toBeEnabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(2)
  })

  it('uses separate service/time caches and ignores a late response from the previous slot', async () => {
    const oldSlot = deferred<StaffResponse[]>()
    const newSlot = deferred<StaffResponse[]>()
    vi.mocked(getAvailableStaffForSlot).mockReturnValueOnce(oldSlot.promise).mockReturnValueOnce(newSlot.promise)
    const { queryClient } = renderBooking(<BookingModal {...initialProps} initialStaffId="staff-2" />)
    fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '10:00' } })
    await waitFor(() => expect(getAvailableStaffForSlot).toHaveBeenCalledWith('svc-1', '2026-09-15T10:00:00Z'))
    expect(confirmButton()).toBeDisabled()
    await act(async () => { newSlot.resolve([staff[1]]) })
    await expectReady()
    expect(staffSelect()).toHaveValue('staff-2')
    await act(async () => { oldSlot.resolve([staff[0]]) })
    expect(staffSelect()).toHaveValue('staff-2')
    expect(screen.queryByRole('option', { name: 'Sarah Connor' })).not.toBeInTheDocument()
    expect(queryClient.getQueryData(availabilityKey)).toEqual([staff[0]])
    expect(queryClient.getQueryData(['available-staff', 'svc-1', '2026-09-15T10:00:00Z'])).toEqual([staff[1]])
  })

  it.each([
    '2026-09-15T00:15:00+05:30', '2026-09-15T00:15:59.999+05:30',
  ])('normalizes offset prefill %s to the UTC minute before fetching and submitting', async (initialStartAt) => {
    const user = userEvent.setup()
    renderBooking(<BookingModal {...initialProps} initialStartAt={initialStartAt} />)
    await expectReady()
    expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-09-14')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('18:45')
    expect(getAvailableStaffForSlot).toHaveBeenCalledWith('svc-1', '2026-09-14T18:45:00Z')
    await user.type(customerInput(), 'Bob Vance')
    await user.click(confirmButton())
    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalledWith(expect.objectContaining({ startAt: '2026-09-14T18:45:00Z' })))
  })

  it('defaults to the first ACTIVE service on delayed initial load without resetting typed fields', async () => {
    servicesResult = { data: undefined, isLoading: true }
    const user = userEvent.setup()
    const props = { ...initialProps, initialServiceId: undefined }
    const { rerender } = renderBooking(<BookingModal {...props} />)
    await user.type(customerInput(), 'Customer survives')
    await user.type(screen.getByLabelText(/Pet Name/i), 'Spot')
    fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '13:00' } })
    servicesResult = { data: [{ ...services[0], id: 'inactive', status: 'INACTIVE' }, ...services], isLoading: false }
    rerender(<BookingModal {...props} />)
    await expectReady()
    expect(screen.getByLabelText(/^Service/i)).toHaveValue('svc-1')
    expect(customerInput()).toHaveValue('Customer survives')
    expect(screen.getByLabelText(/Pet Name/i)).toHaveValue('Spot')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('13:00')
    expect(getAvailableStaffForSlot).toHaveBeenCalledWith('svc-1', '2026-09-15T13:00:00Z')
  })

  it('preserves the whole edited form across services refetches', async () => {
    const user = userEvent.setup()
    vi.mocked(getAvailableStaffForSlot).mockResolvedValue(staff)
    const { rerender } = renderBooking(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    await expectReady()
    await user.type(customerInput(), 'Customer survives')
    await user.type(screen.getByLabelText(/Pet Name/i), 'Spot')
    await user.selectOptions(staffSelect(), 'staff-2')
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-09-16' } })
    fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '14:30' } })
    await expectReady()
    const requestCount = vi.mocked(getAvailableStaffForSlot).mock.calls.length
    servicesResult = { data: [{ ...services[0], price: 80 }], isLoading: false }
    rerender(<BookingModal {...initialProps} initialStaffId="staff-1" />)
    expect(customerInput()).toHaveValue('Customer survives')
    expect(screen.getByLabelText(/Pet Name/i)).toHaveValue('Spot')
    expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-09-16')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('14:30')
    expect(staffSelect()).toHaveValue('staff-2')
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(requestCount)
  })

  it('resets on prefill change and reopening, and refreshes rather than trusting the old cache', async () => {
    const user = userEvent.setup()
    const { rerender } = renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    await user.type(customerInput(), 'Old customer')
    const newProps = { ...initialProps, initialStartAt: '2026-09-16T23:45:00-07:00' }
    rerender(<BookingModal {...newProps} />)
    await expectReady()
    expect(customerInput()).toHaveValue('')
    expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-09-17')
    expect(screen.getByLabelText(/Start Time/i)).toHaveValue('06:45')
    await user.type(customerInput(), 'Discard on close')
    rerender(<BookingModal {...newProps} isOpen={false} />)
    const pending = deferred<StaffResponse[]>()
    vi.mocked(getAvailableStaffForSlot).mockReturnValueOnce(pending.promise)
    rerender(<BookingModal {...newProps} />)
    expect(customerInput()).toHaveValue('')
    expect(confirmButton()).toBeDisabled()
    await act(async () => { pending.resolve([staff[0]]) })
    await expectReady()
  })

  it('disables eligibility and avoids unsafe date formatting while date/time are cleared or invalid', async () => {
    renderBooking(<BookingModal {...initialProps} />)
    await expectReady()
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '' } })
    expect(confirmButton()).toBeDisabled()
    expect(screen.queryByText(/Ends at/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-02-30' } })
    fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '' } })
    expect(confirmButton()).toBeDisabled()
    expect(getAvailableStaffForSlot).toHaveBeenCalledTimes(1)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { createBooking, listBookings } from '@/api/bookings'
import { listServices } from '@/api/services'
import { getAvailableStaffForSlot, listStaff } from '@/api/staff'
import type { AvailableSlotResponse, StaffResponse } from '@/api/types'
import { getAvailableSlots } from '@/features/calendar/availableSlots'
import { ServiceUpcoming } from '@/features/services/ServiceUpcoming'
import { admin, alice, bob, booking, NOW, renderServiceView, service, slot } from './fixtures'

// Keep the real BookingModal, eligibility query, and booking mutation/invalidation.
vi.mock('@/api/auth', () => ({ getMe: vi.fn() }))
vi.mock('@/api/bookings', () => ({
  createBooking: vi.fn(), listBookings: vi.fn(), getBooking: vi.fn(), cancelBooking: vi.fn(),
}))
vi.mock('@/api/services', () => ({
  listServices: vi.fn(), createService: vi.fn(), updateService: vi.fn(), deleteService: vi.fn(),
}))
vi.mock('@/api/staff', () => ({ listStaff: vi.fn(), getAvailableStaffForSlot: vi.fn() }))
vi.mock('@/features/calendar/availableSlots', () => ({ getAvailableSlots: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listServices).mockResolvedValue([service])
  vi.mocked(listStaff).mockResolvedValue([alice, bob])
  vi.mocked(listBookings).mockResolvedValue([])
  vi.mocked(getAvailableSlots).mockResolvedValue([slot])
  vi.mocked(getAvailableStaffForSlot).mockResolvedValue([alice, bob])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function openDraft() {
  const user = userEvent.setup()
  const { client } = renderServiceView(<ServiceUpcoming service={service} />)
  await user.click(await screen.findByRole('button', { name: /Book Bob at/ }))
  const dialog = screen.getByRole('dialog')
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeEnabled())
  await user.type(within(dialog).getByLabelText(/Customer Name/), 'Draft Customer')
  await user.type(within(dialog).getByLabelText(/Pet Name/), 'Draft Pet')
  return { user, client, dialog }
}

function expectDraft(dialog: HTMLElement) {
  // Identity as well as values detects an unmount/remount that resets the form.
  expect(screen.getByRole('dialog')).toBe(dialog)
  expect(within(dialog).getByLabelText(/Customer Name/)).toHaveValue('Draft Customer')
  expect(within(dialog).getByLabelText(/Pet Name/)).toHaveValue('Draft Pet')
  expect(within(dialog).getByLabelText(/^Service/)).toHaveValue(service.id)
  expect(within(dialog).getByLabelText(/Date \(UTC\)/)).toHaveValue('2026-09-15')
  expect(within(dialog).getByLabelText(/Start Time/)).toHaveValue('09:00')
}

describe('ServiceUpcoming with the real booking draft', () => {
  it('preserves the draft during the minute range change and after the selected slot disappears', async () => {
    // Leave RTL/user-event timeouts real; only drive the page's minute interval.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { user, dialog } = await openDraft()
    const refresh = deferred<AvailableSlotResponse[]>()
    vi.mocked(getAvailableSlots).mockReturnValueOnce(refresh.promise)

    await act(async () => {
      vi.mocked(Date.now).mockReturnValue(NOW + 60_000)
      vi.advanceTimersByTime(60_000)
    })
    await waitFor(() => expect(getAvailableSlots).toHaveBeenLastCalledWith(
      service.id, '2026-09-14T12:16:00.000Z', '2026-09-21T13:16:00.000Z',
    ))
    expect(screen.getByText('Loading availability…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expectDraft(dialog)

    await act(async () => { refresh.resolve([]) })
    expect(await screen.findByText('No available slots in the next seven days for this selection.')).toBeInTheDocument()
    expectDraft(dialog)
    // The modal's independent staff query, not membership in the list, is authoritative.
    expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeEnabled()
    expect(within(dialog).getByLabelText(/Staff Member/)).toHaveValue(bob.id)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('preserves the draft through a slot refetch error and fails closed on an independent eligibility error', async () => {
    const { user, client, dialog } = await openDraft()
    const slotsRefresh = deferred<AvailableSlotResponse[]>()
    vi.mocked(getAvailableSlots).mockReturnValueOnce(slotsRefresh.promise)
    await act(async () => { void client.invalidateQueries({ queryKey: ['calendar'] }) })
    expect(await screen.findByText('Refreshing availability…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expectDraft(dialog)

    await act(async () => { slotsRefresh.reject(new Error('Slots offline')) })
    expect(await screen.findByText('Slots offline')).toBeInTheDocument()
    expectDraft(dialog)

    const staffRefresh = deferred<StaffResponse[]>()
    vi.mocked(getAvailableStaffForSlot).mockReturnValueOnce(staffRefresh.promise)
    await act(async () => { void client.invalidateQueries({ queryKey: ['available-staff'] }) })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeDisabled())
    expect(within(dialog).getByLabelText(/Staff Member/)).toBeDisabled()
    expectDraft(dialog)

    await act(async () => { staffRefresh.reject(new Error('Staff eligibility offline')) })
    expect(await within(dialog).findByText(/Unable to check staff availability: Staff eligibility offline/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeDisabled()
    expectDraft(dialog)

    // Even a form submit bypassing the disabled button must recheck eligibility.
    fireEvent.submit(within(dialog).getByLabelText(/Customer Name/).closest('form')!)
    expect(await within(dialog).findByText(/Please wait for availability to be checked/)).toBeInTheDocument()
    expect(createBooking).not.toHaveBeenCalled()

    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce([alice, bob])
    await user.click(within(dialog).getByRole('button', { name: 'Retry availability' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeEnabled())
    expectDraft(dialog)
    // Calendar failure does not discard a draft that can revalidate independently.
    expect(screen.getByText('Slots offline')).toBeInTheDocument()
  })

  it('preserves the draft on 409 calendar invalidation and allows correction only after staff revalidation', async () => {
    const { user, client, dialog } = await openDraft()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const slotsRefresh = deferred<AvailableSlotResponse[]>()
    const staffRefresh = deferred<StaffResponse[]>()
    vi.mocked(getAvailableSlots).mockReturnValueOnce(slotsRefresh.promise)
    vi.mocked(getAvailableStaffForSlot).mockReturnValueOnce(staffRefresh.promise)
    vi.mocked(createBooking).mockRejectedValueOnce({ status: 409, message: 'Slot already taken' })

    await user.click(within(dialog).getByRole('button', { name: 'Confirm Booking' }))
    expect(await within(dialog).findByText(/That slot was just booked by someone else/)).toBeInTheDocument()
    expect(createBooking).toHaveBeenCalledWith({
      serviceId: service.id, staffId: bob.id, startAt: slot.startAt,
      customerName: 'Draft Customer', petName: 'Draft Pet',
    })
    for (const key of ['bookings', 'calendar', 'available-staff']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] })
    }
    expect(await screen.findByText('Refreshing availability…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Book .* at/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeDisabled()
    expectDraft(dialog)

    await act(async () => { slotsRefresh.resolve([]); staffRefresh.resolve([]) })
    expect(await screen.findByText('No available slots in the next seven days for this selection.')).toBeInTheDocument()
    expect(await within(dialog).findByText(/No staff members are scheduled and available/)).toBeInTheDocument()
    expectDraft(dialog)
    expect(within(dialog).getByLabelText(/Staff Member/)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeDisabled()
    expect(createBooking).toHaveBeenCalledTimes(1)

    vi.mocked(getAvailableStaffForSlot).mockResolvedValueOnce([alice])
    fireEvent.change(within(dialog).getByLabelText(/Start Time/), { target: { value: '10:30' } })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Confirm Booking' })).toBeEnabled())
    expect(getAvailableStaffForSlot).toHaveBeenLastCalledWith(service.id, '2026-09-15T10:30:00Z')
    expect(within(dialog).getByLabelText(/Staff Member/)).toHaveValue(alice.id)
    vi.mocked(createBooking).mockResolvedValueOnce({
      ...booking, startAt: '2026-09-15T10:30:00Z', endAt: '2026-09-15T11:30:00Z',
      customerName: 'Draft Customer', petName: 'Draft Pet',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Booking' }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(2))
    expect(createBooking).toHaveBeenLastCalledWith({
      serviceId: service.id, staffId: alice.id, startAt: '2026-09-15T10:30:00Z',
      customerName: 'Draft Customer', petName: 'Draft Pet',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
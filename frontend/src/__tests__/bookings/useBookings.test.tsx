import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCancelBooking, useCreateBooking } from '@/features/bookings/useBookings'
import { cancelBooking, createBooking } from '@/api/bookings'
import { booking, bookingProviders } from './bookingTestUtils'

vi.mock('@/api/bookings', () => ({
  createBooking: vi.fn(), cancelBooking: vi.fn(), listBookings: vi.fn(), getBooking: vi.fn(),
}))

const command = {
  serviceId: booking.serviceId, staffId: booking.staffId, startAt: booking.startAt,
  customerName: booking.customerName,
}

function setup() {
  const providers = bookingProviders()
  const keys = [
    ['bookings', { from: '2026-09-01', to: '2026-10-01' }],
    ['calendar', 'week'],
    ['available-staff', 'svc-1', booking.startAt],
    ['available-staff', 'svc-2', booking.startAt],
  ]
  keys.forEach((queryKey) => providers.queryClient.setQueryData(queryKey, []))
  providers.queryClient.setQueryData(['booking', booking.id], booking)
  providers.queryClient.setQueryData(['services'], [])
  const hook = renderHook(() => ({ create: useCreateBooking(), cancel: useCancelBooking() }), providers)
  return { ...providers, ...hook, keys }
}

describe('booking mutation cache invalidation', () => {
  beforeEach(() => {
    vi.mocked(createBooking).mockReset().mockResolvedValue(booking)
    vi.mocked(cancelBooking).mockReset().mockResolvedValue({ ...booking, status: 'CANCELLED' })
  })

  it.each(['create', 'cancel'] as const)('%s success invalidates all booking, calendar and eligibility keys', async (operation) => {
    const { result, queryClient, keys } = setup()
    await act(async () => {
      if (operation === 'create') await result.current.create.mutateAsync(command)
      else await result.current.cancel.mutateAsync(booking.id)
    })
    keys.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true))
    expect(queryClient.getQueryState(['services'])?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(['booking', booking.id])?.isInvalidated).toBe(operation === 'cancel')
  })

  it.each([
    ['create', { status: 409 }], ['create', { response: { status: 409 } }],
    ['cancel', { status: 409 }], ['cancel', { response: { status: 409 } }],
  ] as const)('%s HTTP 409 refreshes the same caches without swallowing the mutation error', async (operation, error) => {
    vi.mocked(createBooking).mockRejectedValue(error)
    vi.mocked(cancelBooking).mockRejectedValue(error)
    const { result, queryClient, keys } = setup()
    await act(async () => {
      const mutation = operation === 'create'
        ? result.current.create.mutateAsync(command)
        : result.current.cancel.mutateAsync(booking.id)
      await expect(mutation).rejects.toEqual(error)
    })
    keys.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true))
    expect(queryClient.getQueryState(['booking', booking.id])?.isInvalidated).toBe(operation === 'cancel')
  })

  it.each(['create', 'cancel'] as const)('%s ordinary errors do not cause unrelated refreshes', async (operation) => {
    const error = { status: 500, message: 'Unavailable' }
    vi.mocked(createBooking).mockRejectedValue(error)
    vi.mocked(cancelBooking).mockRejectedValue(error)
    const { result, queryClient, keys } = setup()
    await act(async () => {
      const mutation = operation === 'create'
        ? result.current.create.mutateAsync(command)
        : result.current.cancel.mutateAsync(booking.id)
      await expect(mutation).rejects.toEqual(error)
    })
    keys.forEach((key) => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false))
  })
})
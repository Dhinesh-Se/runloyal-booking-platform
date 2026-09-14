import type { ComponentProps, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { listBookings } from '@/api/bookings'
import { listAvailability } from '@/api/availability'
import { listServices } from '@/api/services'
import { listStaff } from '@/api/staff'
import { getMe } from '@/api/auth'
import { getAvailableSlots } from '@/features/calendar/availableSlots'
import type { AvailabilityResponse, BookingResponse, ServiceResponse, StaffResponse } from '@/api/types'
import type { BookingModal } from '@/features/bookings/BookingModal'
import type { BookingDetail } from '@/features/bookings/BookingDetail'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { useCalendarData } from '@/features/calendar/useCalendar'
import { createTestQueryClient } from '../testUtils'

// Keep useCalendarData, service/staff query hooks, date helpers and both grids real.
vi.mock('@/api/bookings', () => ({ listBookings: vi.fn() }))
vi.mock('@/api/availability', () => ({ listAvailability: vi.fn() }))
vi.mock('@/api/services', () => ({ listServices: vi.fn() }))
vi.mock('@/api/staff', () => ({ listStaff: vi.fn() }))
vi.mock('@/api/auth', () => ({ getMe: vi.fn() }))
vi.mock('@/features/calendar/availableSlots', () => ({ getAvailableSlots: vi.fn() }))

vi.mock('@/features/bookings/BookingModal', () => ({
  BookingModal: ({ isOpen, onClose, initialStartAt, initialServiceId, initialStaffId }: ComponentProps<typeof BookingModal>) =>
    isOpen ? (
      <div role="dialog" aria-label="Booking prefill">
        <output data-testid="initial-start-at">{initialStartAt ?? ''}</output>
        <output data-testid="initial-service-id">{initialServiceId ?? ''}</output>
        <output data-testid="initial-staff-id">{initialStaffId ?? ''}</output>
        <button onClick={onClose}>Close booking</button>
      </div>
    ) : null,
}))

vi.mock('@/features/bookings/BookingDetail', () => ({
  BookingDetail: ({ isOpen, bookingId, onClose }: ComponentProps<typeof BookingDetail>) =>
    isOpen ? (
      <div role="dialog" aria-label="Booking detail">
        <output data-testid="detail-booking-id">{bookingId}</output>
        <button onClick={onClose}>Close detail</button>
      </div>
    ) : null,
}))

const services: ServiceResponse[] = [{
  id: 'svc-1', tenantId: 'tenant-1', name: 'Grooming', description: null,
  category: 'Grooming', durationMinutes: 30, price: 50, status: 'ACTIVE',
}]
const staff: StaffResponse[] = [{
  id: 'staff-1', tenantId: 'tenant-1', userId: null, name: 'Alice', status: 'ACTIVE',
}]
const sundayWindow: AvailabilityResponse = {
  id: 'availability-1', tenantId: 'tenant-1', staffId: 'staff-1',
  dayOfWeek: 'SUNDAY', startTime: '09:00:00', endTime: '09:30:00', type: 'WORKING',
}
const queryClients: ReturnType<typeof createTestQueryClient>[] = []

function createWrapper() {
  const client = createTestQueryClient()
  queryClients.push(client)
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function renderCalendar() {
  const user = userEvent.setup()
  render(<CalendarPage />, { wrapper: createWrapper() })
  // This header appears only after bookings, services, staff and availability settle.
  await screen.findByText('Time (UTC)', { exact: true })
  return user
}

function expectPrefill(startAt: string, serviceId = '', staffId = '') {
  const dialog = within(screen.getByRole('dialog', { name: 'Booking prefill' }))
  expect(dialog.getByTestId('initial-start-at').textContent).toBe(startAt)
  expect(dialog.getByTestId('initial-service-id').textContent).toBe(serviceId)
  expect(dialog.getByTestId('initial-staff-id').textContent).toBe(staffId)
}

async function expectNewBookingAt(user: ReturnType<typeof userEvent.setup>, startAt: string) {
  await user.click(screen.getByRole('button', { name: 'New Booking' }))
  expectPrefill(startAt)
  await user.click(screen.getByRole('button', { name: 'Close booking' }))
  expect(screen.queryByRole('dialog', { name: 'Booking prefill' })).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.resetAllMocks()
  // Freeze only Date: React Query, waitFor and userEvent retain real timers.
  // Each runner process supplies its own TZ; tests never change the environment.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-13T00:30:00.000Z'))
  vi.mocked(listBookings).mockResolvedValue([])
  vi.mocked(listServices).mockResolvedValue(services)
  vi.mocked(listStaff).mockResolvedValue(staff)
  vi.mocked(listAvailability).mockResolvedValue([sundayWindow])
  vi.mocked(getMe).mockResolvedValue({
    id: 'user-1', tenantId: 'tenant-1', oktaSubject: 'subject',
    role: 'TENANT_ADMIN', status: 'ACTIVE', timezone: 'America/New_York',
  })
  // Explicit backend fixture; the local WORKING rule above does not grant a slot.
  vi.mocked(getAvailableSlots).mockResolvedValue([{
    startAt: '2026-09-13T09:00:00.000Z', endAt: '2026-09-13T09:30:00.000Z', availableStaff: staff,
  }])
})

afterEach(() => {
  cleanup()
  queryClients.splice(0).forEach((client) => client.clear())
  vi.useRealTimers()
})

describe('useCalendarData UTC query bounds', () => {
  const septemberDays = [
    '2026-09-07T00:00:00.000Z', '2026-09-08T00:00:00.000Z',
    '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z',
    '2026-09-11T00:00:00.000Z', '2026-09-12T00:00:00.000Z',
    '2026-09-13T00:00:00.000Z',
  ]
  const springDays = [
    '2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z',
    '2026-03-04T00:00:00.000Z', '2026-03-05T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z', '2026-03-07T00:00:00.000Z',
    '2026-03-08T00:00:00.000Z',
  ]
  const fallDays = [
    '2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z',
    '2026-10-28T00:00:00.000Z', '2026-10-29T00:00:00.000Z',
    '2026-10-30T00:00:00.000Z', '2026-10-31T00:00:00.000Z',
    '2026-11-01T00:00:00.000Z',
  ]

  it.each([
    { now: '2026-09-13T00:30:00.000Z', from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z', days: septemberDays },
    { now: '2026-09-13T23:30:00.000Z', from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z', days: septemberDays },
    { now: '2026-03-08T00:30:00.000Z', from: '2026-03-02T00:00:00.000Z', to: '2026-03-09T00:00:00.000Z', days: springDays },
    { now: '2026-03-08T23:30:00.000Z', from: '2026-03-02T00:00:00.000Z', to: '2026-03-09T00:00:00.000Z', days: springDays },
    { now: '2026-11-01T00:30:00.000Z', from: '2026-10-26T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z', days: fallDays },
    { now: '2026-11-01T23:30:00.000Z', from: '2026-10-26T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z', days: fallDays },
  ])('requests a half-open Monday-to-Monday UTC week at $now', async ({ now, from, to, days }) => {
    vi.setSystemTime(new Date(now))
    const currentDate = new Date()
    const { result } = renderHook(() => useCalendarData(currentDate), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(listBookings).toHaveBeenCalledTimes(1)
    expect(listBookings).toHaveBeenCalledWith(from, to)
    expect(result.current.weekStart.toISOString()).toBe(from)
    expect(result.current.weekDays.map((day) => day.toISOString())).toEqual(days)
    expect(result.current.timeSlots).toHaveLength(48)
    expect(result.current.timeSlots[0]).toEqual({ timeLabel: '00:00', minutes: 0 })
    expect(result.current.timeSlots[47]).toEqual({ timeLabel: '23:30', minutes: 1410 })
    // Exclusive next Monday, never Sunday 23:59:59.999 or a 167/169-hour DST week.
    expect(Date.parse(to) - Date.parse(from)).toBe(168 * 60 * 60 * 1000)
    expect(currentDate.toISOString()).toBe(now)
    expect(listServices).toHaveBeenCalledTimes(1)
    expect(listStaff).toHaveBeenCalledTimes(1)
    expect(listAvailability).toHaveBeenCalledWith('staff-1')
    expect(result.current.staffAvailabilities).toEqual({ 'staff-1': [sundayWindow] })
  })
})

describe('calendar authoritative queries and failure handling', () => {
  const currentDate = new Date('2026-09-13T00:00:00Z')
  const longService: ServiceResponse = { ...services[0], id: 'svc-90', name: 'Long service', durationMinutes: 90 }
  const secondStaff: StaffResponse = { ...staff[0], id: 'staff-2', name: 'Bob' }

  it('fetches each active service with duration-padded range, aggregates, and excludes out-of-grid starts', async () => {
    vi.mocked(listServices).mockResolvedValue([...services, longService,
      { ...services[0], id: 'inactive', status: 'INACTIVE' }])
    vi.mocked(getAvailableSlots).mockImplementation(async serviceId => [
      { startAt: '2026-09-13T23:30:00Z',
        endAt: serviceId === longService.id ? '2026-09-14T01:00:00Z' : '2026-09-14T00:00:00Z', availableStaff: staff },
      { startAt: '2026-09-14T00:00:00Z', endAt: '2026-09-14T00:30:00Z', availableStaff: staff },
    ])
    const { result } = renderHook(() => useCalendarData(currentDate), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.availableSlots).toHaveLength(2))
    expect(getAvailableSlots).toHaveBeenCalledTimes(2)
    expect(getAvailableSlots).toHaveBeenCalledWith('svc-1', '2026-09-07T00:00:00.000Z', '2026-09-14T00:30:00.000Z')
    expect(getAvailableSlots).toHaveBeenCalledWith('svc-90', '2026-09-07T00:00:00.000Z', '2026-09-14T01:30:00.000Z')
    expect(result.current.availableSlots.map(slot => slot.serviceId)).toEqual(['svc-1', 'svc-90'])
    expect(result.current.availableSlots.every(slot => slot.startAt === '2026-09-13T23:30:00Z')).toBe(true)
  })

  it('fetches only the selected active service and filters the returned eligible staff', async () => {
    vi.mocked(listServices).mockResolvedValue([...services, longService])
    vi.mocked(listStaff).mockResolvedValue([...staff, secondStaff])
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { startAt: '2026-09-13T09:00:00Z', endAt: '2026-09-13T10:30:00Z', availableStaff: [...staff, secondStaff] },
      { startAt: '2026-09-13T10:00:00Z', endAt: '2026-09-13T11:30:00Z', availableStaff: staff },
    ])
    const { result } = renderHook(() => useCalendarData(currentDate, longService.id, secondStaff.id), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.availableSlots).toHaveLength(1))
    expect(getAvailableSlots).toHaveBeenCalledTimes(1)
    expect(getAvailableSlots).toHaveBeenCalledWith(longService.id, '2026-09-07T00:00:00.000Z', '2026-09-14T01:30:00.000Z')
    expect(result.current.availableSlots[0].availableStaff).toEqual([secondStaff])
    expect(listAvailability).toHaveBeenCalledWith(secondStaff.id)
    expect(listAvailability).not.toHaveBeenCalledWith(staff[0].id)
  })

  it('retains confirmed other-service bookings when a service is selected', async () => {
    const conflict: BookingResponse = { id: 'conflict', tenantId: 'tenant-1', serviceId: longService.id,
      staffId: staff[0].id, startAt: '2026-09-13T09:00:00Z', endAt: '2026-09-13T10:30:00Z',
      customerName: 'Conflict', petName: null, status: 'CONFIRMED' }
    vi.mocked(listBookings).mockResolvedValue([conflict])
    vi.mocked(getAvailableSlots).mockResolvedValue([])
    const { result } = renderHook(() => useCalendarData(currentDate, services[0].id), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bookings).toEqual([conflict])
    expect(result.current.availableSlots).toEqual([])
  })

  it('uses per-service/range keys under the existing calendar invalidation prefix', async () => {
    const wrapper = createWrapper()
    const client = queryClients[queryClients.length - 1]
    const { result } = renderHook(() => useCalendarData(currentDate), { wrapper })
    await waitFor(() => expect(result.current.availableSlots).toHaveLength(1))
    const keys = client.getQueryCache().findAll({ queryKey: ['calendar', 'available-slots'] }).map(query => query.queryKey)
    expect(keys).toEqual([['calendar', 'available-slots', 'svc-1',
      '2026-09-07T00:00:00.000Z', '2026-09-14T00:00:00.000Z', '2026-09-14T00:30:00.000Z']])
    await act(async () => { await client.invalidateQueries({ queryKey: ['calendar'] }) })
    await waitFor(() => expect(getAvailableSlots).toHaveBeenCalledTimes(2))
  })

  it('shows a loading state and no clickable availability while a slot request is pending', async () => {
    vi.mocked(getAvailableSlots).mockImplementation(() => new Promise(() => {}))
    render(<CalendarPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(getAvailableSlots).toHaveBeenCalled())
    expect(screen.getByRole('status', { name: 'Loading calendar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it('does not leave a loading spinner when there is no active staff to enable dependent queries', async () => {
    vi.mocked(listStaff).mockResolvedValue([{ ...staff[0], status: 'INACTIVE' }])
    const user = await renderCalendar()
    expect(getAvailableSlots).not.toHaveBeenCalled()
    expect(listAvailability).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: 'Loading calendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Day' }))
    expect(screen.getByText(/No active staff members/)).toBeInTheDocument()
  })

  it('settles without slots when there are no active services', async () => {
    vi.mocked(listServices).mockResolvedValue([{ ...services[0], status: 'INACTIVE' }])
    await renderCalendar()
    expect(getAvailableSlots).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it.each([
    ['services', listServices], ['staff', listStaff], ['bookings', listBookings],
    ['schedule', listAvailability], ['slots', getAvailableSlots], ['me', getMe],
  ] as const)('visibly fails closed on a %s request error', async (_name, request) => {
    vi.mocked(request).mockRejectedValue(new Error('Request failed'))
    render(<CalendarPage />, { wrapper: createWrapper() })
    expect(await screen.findByRole('alert')).toHaveTextContent('Calendar data could not be loaded')
    expect(screen.getByRole('button', { name: 'Retry calendar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it('removes stale green choices and shows an error when a refresh fails', async () => {
    await renderCalendar()
    expect(screen.getByRole('button', { name: /^Available/ })).toBeInTheDocument()
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('Refresh failed'))
    await act(async () => {
      await queryClients[0].invalidateQueries({ queryKey: ['calendar'] })
    })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it('suppresses stale choices while eligibility is refreshing', async () => {
    await renderCalendar()
    vi.mocked(getAvailableSlots).mockImplementation(() => new Promise(() => {}))
    act(() => { void queryClients[0].invalidateQueries({ queryKey: ['calendar', 'available-slots'] }) })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Refreshing calendar'))
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it.each([undefined, 'Not/AZone'])('fails closed for missing/invalid tenant timezone %s', async timezone => {
    vi.mocked(getMe).mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', oktaSubject: 'subject',
      role: 'TENANT_ADMIN', status: 'ACTIVE', timezone })
    render(<CalendarPage />, { wrapper: createWrapper() })
    expect(await screen.findByRole('alert')).toHaveTextContent('timezone is missing or invalid')
    expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
  })

  it('uses /me STAFF membership to hide New Booking and make slots read-only in both views', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', oktaSubject: 'subject',
      role: 'STAFF', status: 'ACTIVE', timezone: 'Asia/Kolkata' })
    const user = await renderCalendar()
    for (const view of ['Week', 'Day']) {
      await user.click(screen.getByRole('button', { name: view }))
      expect(screen.queryByRole('button', { name: 'New Booking' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
      const grid = document.querySelector('.calendar-grid') as HTMLElement
      fireEvent.click(within(grid).getByText('Available'))
      expect(screen.queryByRole('dialog', { name: 'Booking prefill' })).not.toBeInTheDocument()
    }
    expect(screen.getByText(/All grid times and navigation are UTC/)).toBeInTheDocument()
    expect(screen.getByText(/Asia\/Kolkata/)).toBeInTheDocument()
  })

  it('lets STAFF open and close booking details in both views without permitting creation', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', oktaSubject: 'subject',
      role: 'STAFF', status: 'ACTIVE', timezone: 'UTC' })
    vi.mocked(listBookings).mockResolvedValue([{ id: 'read-only-booking', tenantId: 'tenant-1',
      serviceId: services[0].id, staffId: staff[0].id, startAt: '2026-09-13T08:00:00Z',
      endAt: '2026-09-13T08:30:00Z', status: 'CONFIRMED', customerName: 'Read-only customer', petName: null }])
    const user = await renderCalendar()
    for (const view of ['Week', 'Day']) {
      await user.click(screen.getByRole('button', { name: view }))
      await user.click(screen.getByRole('button', { name: /Read-only customer/ }))
      const detail = screen.getByRole('dialog', { name: 'Booking detail' })
      expect(within(detail).getByTestId('detail-booking-id')).toHaveTextContent('read-only-booking')
      expect(screen.queryByRole('button', { name: 'New Booking' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Available/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Booking prefill' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Close detail' }))
      expect(screen.queryByRole('dialog', { name: 'Booking detail' })).not.toBeInTheDocument()
    }
  })

  it('prefills the authoritative service with All Services selected', async () => {
    vi.mocked(listServices).mockResolvedValue([...services, longService])
    vi.mocked(getAvailableSlots).mockImplementation(async serviceId => serviceId === longService.id ? [{
      startAt: '2026-09-13T09:00:00Z', endAt: '2026-09-13T10:30:00Z', availableStaff: staff,
    }] : [])
    const user = await renderCalendar()
    await user.click(screen.getByRole('button', { name: /^Available Long service/ }))
    expectPrefill('2026-09-13T09:00:00Z', longService.id, staff[0].id)
  })
})

describe('CalendarPage UTC navigation with real grids', () => {
  it.each(['2026-09-13T00:30:00.000Z', '2026-09-13T23:30:00.000Z'])(
    'initializes September 13 using the UTC day at %s, not the browser day', async (now) => {
      vi.setSystemTime(new Date(now))
      const user = await renderCalendar()

      expect(screen.getByText('Sep 7 – Sep 13, 2026', { exact: true })).toBeInTheDocument()
      expect(listBookings).toHaveBeenCalledWith('2026-09-07T00:00:00.000Z', '2026-09-14T00:00:00.000Z')
      await expectNewBookingAt(user, '2026-09-13T00:00:00.000Z')
      await user.click(screen.getByRole('button', { name: 'Day' }))
      expect(screen.getByText('Sep 13, 2026', { exact: true })).toBeInTheDocument()
      await expectNewBookingAt(user, '2026-09-13T00:00:00.000Z')
    },
  )

  it.each([
    {
      season: 'spring', now: '2026-03-09T00:30:00.000Z',
      previous: '2026-03-02T00:00:00.000Z', current: '2026-03-09T00:00:00.000Z',
      next: '2026-03-16T00:00:00.000Z', nextEnd: '2026-03-23T00:00:00.000Z',
      previousLabel: 'Mar 2 – Mar 8, 2026', currentLabel: 'Mar 9 – Mar 15, 2026', nextLabel: 'Mar 16 – Mar 22, 2026',
    },
    {
      season: 'fall', now: '2026-11-02T00:30:00.000Z',
      previous: '2026-10-26T00:00:00.000Z', current: '2026-11-02T00:00:00.000Z',
      next: '2026-11-09T00:00:00.000Z', nextEnd: '2026-11-16T00:00:00.000Z',
      previousLabel: 'Oct 26 – Nov 1, 2026', currentLabel: 'Nov 2 – Nov 8, 2026', nextLabel: 'Nov 9 – Nov 15, 2026',
    },
  ])('moves previous/next week across $season DST without shifting UTC midnight', async (testCase) => {
    vi.setSystemTime(new Date(testCase.now))
    const user = await renderCalendar()
    expect(screen.getByText(testCase.currentLabel, { exact: true })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(screen.getByText(testCase.previousLabel, { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith(testCase.previous, testCase.current))
    await expectNewBookingAt(user, testCase.previous)

    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByText(testCase.currentLabel, { exact: true })).toBeInTheDocument()
    await expectNewBookingAt(user, testCase.current)
    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByText(testCase.nextLabel, { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith(testCase.next, testCase.nextEnd))
    await expectNewBookingAt(user, testCase.next)
  })

  it.each([
    {
      season: 'spring', now: '2026-03-08T00:30:00.000Z',
      previous: '2026-03-07T00:00:00.000Z', current: '2026-03-08T00:00:00.000Z',
      next: '2026-03-09T00:00:00.000Z', nextEnd: '2026-03-16T00:00:00.000Z',
      previousLabel: 'Mar 7, 2026', currentLabel: 'Mar 8, 2026', nextLabel: 'Mar 9, 2026',
    },
    {
      season: 'fall', now: '2026-11-01T00:30:00.000Z',
      previous: '2026-10-31T00:00:00.000Z', current: '2026-11-01T00:00:00.000Z',
      next: '2026-11-02T00:00:00.000Z', nextEnd: '2026-11-09T00:00:00.000Z',
      previousLabel: 'Oct 31, 2026', currentLabel: 'Nov 1, 2026', nextLabel: 'Nov 2, 2026',
    },
  ])('moves previous/next day across $season DST without 23/25-hour drift', async (testCase) => {
    vi.setSystemTime(new Date(testCase.now))
    const user = await renderCalendar()
    await user.click(screen.getByRole('button', { name: 'Day' }))
    expect(screen.getByText(testCase.currentLabel, { exact: true })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(screen.getByText(testCase.previousLabel, { exact: true })).toBeInTheDocument()
    await expectNewBookingAt(user, testCase.previous)
    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByText(testCase.currentLabel, { exact: true })).toBeInTheDocument()
    await expectNewBookingAt(user, testCase.current)
    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByText(testCase.nextLabel, { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith(testCase.next, testCase.nextEnd))
    await expectNewBookingAt(user, testCase.next)
  })

  it.each(['Week', 'Day'] as const)('Today reads the new UTC day after midnight in %s mode', async (view) => {
    vi.setSystemTime(new Date('2026-09-13T23:30:00.000Z'))
    const user = await renderCalendar()
    await user.click(screen.getByRole('button', { name: view }))
    await user.click(screen.getByRole('button', { name: 'Previous period' }))

    vi.setSystemTime(new Date('2026-09-14T00:30:00.000Z'))
    await user.click(screen.getByRole('button', { name: 'Today' }))

    const label = view === 'Week' ? 'Sep 14 – Sep 20, 2026' : 'Sep 14, 2026'
    expect(screen.getByText(label, { exact: true })).toBeInTheDocument()
    await waitFor(() => expect(listBookings).toHaveBeenCalledWith('2026-09-14T00:00:00.000Z', '2026-09-21T00:00:00.000Z'))
    await expectNewBookingAt(user, '2026-09-14T00:00:00.000Z')
  })

  it.each(['Week', 'Day'] as const)('passes the real %s slot UTC instant and staff/service prefill to the modal', async (view) => {
    const user = await renderCalendar()
    await user.click(screen.getByRole('button', { name: view }))
    const [serviceFilter, staffFilter] = screen.getAllByRole('combobox')
    await user.selectOptions(serviceFilter, 'svc-1')
    // Both views supply the authoritative slot's staff, service and exact UTC start.
    // Only Sunday 09:00 is returned by the backend fixture.
    if (view === 'Week') await user.selectOptions(staffFilter, 'staff-1')

    await user.click(await screen.findByRole('button', { name: /^Available Grooming • Alice/ }))
    expectPrefill('2026-09-13T09:00:00.000Z', 'svc-1', 'staff-1')
    await user.click(screen.getByRole('button', { name: 'Close booking' }))

    // New Booking must replace the clicked slot time, not retain its prefill.
    await user.click(screen.getByRole('button', { name: 'New Booking' }))
    expectPrefill('2026-09-13T00:00:00.000Z', 'svc-1', view === 'Week' ? 'staff-1' : '')
  })

  it.each(['Week', 'Day'] as const)('opens and closes booking detail from the real %s grid', async (view) => {
    const booking: BookingResponse = {
      id: 'booking-1', tenantId: 'tenant-1', serviceId: 'svc-1', staffId: 'staff-1',
      startAt: '2026-09-13T09:00:00.000Z', endAt: '2026-09-13T09:30:00.000Z',
      status: 'CONFIRMED', customerName: 'John Smith', petName: 'Rex',
    }
    vi.mocked(listBookings).mockResolvedValue([booking])
    vi.mocked(getAvailableSlots).mockResolvedValue([])
    const user = await renderCalendar()
    await user.click(screen.getByRole('button', { name: view }))
    await user.click(screen.getByRole('button', { name: /John Smith \(Rex\)/ }))

    const detail = screen.getByRole('dialog', { name: 'Booking detail' })
    expect(within(detail).getByTestId('detail-booking-id').textContent).toBe('booking-1')
    expect(screen.queryByRole('dialog', { name: 'Booking prefill' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close detail' }))
    expect(screen.queryByRole('dialog', { name: 'Booking detail' })).not.toBeInTheDocument()
  })
})
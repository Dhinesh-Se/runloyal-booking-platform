import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { listBookings } from '@/api/bookings'
import { listServices } from '@/api/services'
import { listStaff } from '@/api/staff'
import type { BookingResponse } from '@/api/types'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { admin, member, renderStaff as renderDashboard, services } from '../staff/fixtures'

vi.mock('@/api/auth')
vi.mock('@/api/bookings')
vi.mock('@/api/services')
vi.mock('@/api/staff')

function booking(id: string, startAt: string, endAt: string, status: BookingResponse['status'] = 'CONFIRMED'): BookingResponse {
  return {
    id, tenantId: 't-1', serviceId: 'svc-1', staffId: member.id,
    customerName: id, petName: null, startAt, endAt, status,
  }
}

// Intentionally unsorted; includes cross-midnight, offset, cancelled and out-of-range responses.
const appointments = [
  booking('Late appointment', '2026-09-14T23:45:00Z', '2026-09-15T00:30:00Z'),
  booking('Tomorrow boundary', '2026-09-15T00:00:00Z', '2026-09-15T00:30:00Z'),
  booking('Cancelled appointment', '2026-09-14T10:00:00Z', '2026-09-14T11:00:00Z', 'CANCELLED'),
  booking('Offset appointment', '2026-09-14T10:00:00+02:00', '2026-09-14T11:00:00+02:00'),
  booking('Yesterday boundary', '2026-09-13T23:00:00Z', '2026-09-14T00:00:00Z'),
  booking('Overnight appointment', '2026-09-13T23:30:00Z', '2026-09-14T00:30:00Z'),
  booking('Outside tomorrow', '2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z'),
  booking('Midnight appointment', '2026-09-14T00:00:00Z', '2026-09-14T00:30:00Z'),
]

beforeEach(() => {
  vi.resetAllMocks()
  // Only mock Date: query notifications and user-event keep real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T00:30:00Z'))
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listBookings).mockResolvedValue(appointments)
  vi.mocked(listStaff).mockResolvedValue([member, { ...member, id: 'staff-2', status: 'INACTIVE' }])
  vi.mocked(listServices).mockResolvedValue([services[0], { ...services[1], status: 'INACTIVE' }])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function stat(label: string) {
  const region = screen.getByRole('region', { name: 'Business summary' })
  return within(region).getByText(label).closest('article')!
}

describe('Dashboard UTC data and labels', () => {
  it.each([
    ['2026-09-13T17:30:00-07:00', '2026-09-14T00:00:00.000Z', '2026-09-15T00:00:00.000Z'],
    ['2026-09-15T00:15:00+14:00', '2026-09-14T00:00:00.000Z', '2026-09-15T00:00:00.000Z'],
    ['2026-03-07T21:30:00-08:00', '2026-03-08T00:00:00.000Z', '2026-03-09T00:00:00.000Z'],
    ['2026-11-01T01:30:00-07:00', '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z'],
  ])('requests UTC bounds at %s without local-day arithmetic', async (now, from, to) => {
    vi.setSystemTime(new Date(now))
    const localHours = vi.spyOn(Date.prototype, 'setHours')
    const localDay = vi.spyOn(Date.prototype, 'setDate')
    renderDashboard(<DashboardPage />)
    await screen.findByRole('heading', { name: 'Today at a glance (UTC)' })
    expect(listBookings).toHaveBeenCalledWith(from, to)
    expect(Date.parse(to) - Date.parse(from)).toBe(24 * 60 * 60 * 1000)
    expect(localHours).not.toHaveBeenCalled()
    expect(localDay).not.toHaveBeenCalled()
    expect(screen.getByText(/All dashboard dates and times are UTC/)).toBeInTheDocument()
  })

  it('shows only confirmed bookings overlapping the UTC day, sorted by actual start instant', async () => {
    renderDashboard(<DashboardPage />)
    const schedule = await screen.findByRole('region', { name: "Today's schedule (UTC)" })
    const links = within(schedule).getAllByRole('link').filter(link => link.querySelector('time'))
    expect(links.map(link => link.querySelector('strong')?.textContent)).toEqual([
      'Overnight appointment', 'Midnight appointment', 'Offset appointment', 'Late appointment',
    ])
    expect(links[0]).toHaveTextContent('Sep 13, 2026 23:30 UTC')
    expect(links[2]).toHaveTextContent('Sep 14, 2026 08:00 UTC')
    expect(links.every(link => link.querySelector('time')?.hasAttribute('datetime'))).toBe(true)
    for (const name of ['Tomorrow boundary', 'Yesterday boundary', 'Outside tomorrow', 'Cancelled appointment']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    }
    expect(within(stat("Today's bookings (UTC)")).getByText('4')).toBeInTheDocument()
    // A sorted view must not reorder the cached API response.
    expect(appointments[0].customerName).toBe('Late appointment')
  })

  it('counts active staff, not slot availability, and preserves real service/team counts', async () => {
    renderDashboard(<DashboardPage />)
    await screen.findByRole('region', { name: 'Business summary' })
    expect(within(stat('Active staff')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Active services')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Team members')).getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('Available staff')).not.toBeInTheDocument()
  })
})

describe('Dashboard role-aware actions', () => {
  it('preserves administrator create/management navigation', async () => {
    renderDashboard(<DashboardPage />)
    expect(await screen.findByRole('link', { name: 'Create booking' })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: 'Manage services' })).toHaveAttribute('href', '/services')
  })

  it.each([
    ['STAFF', { ...admin, role: 'STAFF' as const }],
    ['inactive administrator', { ...admin, status: 'INACTIVE' as const }],
  ])('offers only viewing actions for %s, including the empty schedule', async (_label, identity) => {
    vi.mocked(getMe).mockResolvedValue(identity)
    vi.mocked(listBookings).mockResolvedValue([])
    renderDashboard(<DashboardPage />)
    await screen.findByText('No bookings scheduled')
    expect(screen.queryByRole('link', { name: /Create|Manage/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Create a booking/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View calendar' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'View services' })).toHaveAttribute('href', '/services')
    expect(within(stat("Today's bookings (UTC)")).getByText('0')).toBeInTheDocument()
  })
})

describe('Dashboard honest query states', () => {
  const sources = ['bookings', 'staff', 'services', 'identity'] as const
  const mocks = {
    bookings: vi.mocked(listBookings), staff: vi.mocked(listStaff),
    services: vi.mocked(listServices), identity: vi.mocked(getMe),
  }

  it.each(sources)('does not show false zero counts or actions while %s is loading', async source => {
    mocks[source].mockImplementation(() => new Promise<never>(() => {}))
    renderDashboard(<DashboardPage />)
    await waitFor(() => expect(mocks[source]).toHaveBeenCalled())
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Business summary' })).not.toBeInTheDocument()
    expect(screen.queryByText('No bookings scheduled')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create|Manage/ })).not.toBeInTheDocument()
  })

  it.each(sources)('shows %s failure instead of zero counts, then retries', async source => {
    mocks[source].mockRejectedValueOnce(new Error(`${source} request failed`))
    renderDashboard(<DashboardPage />)
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(`${source} request failed`)
    expect(screen.queryByRole('region', { name: 'Business summary' })).not.toBeInTheDocument()
    expect(screen.queryByText('No bookings scheduled')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create|Manage/ })).not.toBeInTheDocument()
    await userEvent.setup().click(within(error).getByRole('button', { name: 'Try Again' }))
    expect(await screen.findByRole('region', { name: 'Business summary' })).toBeInTheDocument()
    expect(mocks[source]).toHaveBeenCalledTimes(2)
  })

  it('does not hide a known failure behind another pending request', async () => {
    vi.mocked(listStaff).mockRejectedValue(new Error('Staff request failed'))
    vi.mocked(listBookings).mockImplementation(() => new Promise(() => {}))
    renderDashboard(<DashboardPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff request failed')
    expect(screen.queryByText('No bookings scheduled')).not.toBeInTheDocument()
  })

  it('shows a refresh failure rather than silently presenting stale success', async () => {
    const { client } = renderDashboard(<DashboardPage />)
    await screen.findByRole('region', { name: 'Business summary' })
    vi.mocked(listStaff).mockRejectedValue(new Error('Staff refresh failed'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['staff'] }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff refresh failed')
    expect(screen.queryByRole('region', { name: 'Business summary' })).not.toBeInTheDocument()
  })
})
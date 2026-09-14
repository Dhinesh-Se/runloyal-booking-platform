import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { listAvailability } from '@/api/availability'
import { listBookings } from '@/api/bookings'
import type { AvailabilityResponse, BookingResponse, StaffResponse } from '@/api/types'
import { StaffAvailabilityMatrix } from '@/features/availability/StaffAvailabilityMatrix'
import { renderWithProviders } from '../testUtils'

vi.mock('@/api/auth')
vi.mock('@/api/availability')
vi.mock('@/api/bookings')

const staff: StaffResponse[] = [
  { id: 's1', tenantId: 't1', userId: null, name: 'Alex', status: 'ACTIVE' },
  { id: 's2', tenantId: 't1', userId: null, name: 'Blair', status: 'INACTIVE' },
]
const windows: AvailabilityResponse[] = [
  { id: 'w1', tenantId: 't1', staffId: 's1', dayOfWeek: 'MONDAY', type: 'WORKING', startTime: '09:00:00', endTime: '17:00:00' },
  { id: 'w2', tenantId: 't1', staffId: 's1', dayOfWeek: 'MONDAY', type: 'BREAK', startTime: '12:00:00', endTime: '12:30:00' },
  { id: 'w3', tenantId: 't1', staffId: 's1', dayOfWeek: 'MONDAY', type: 'OFF', startTime: '15:00:00', endTime: '16:00:00' },
]
const bookings: BookingResponse[] = [
  { id: 'b1', tenantId: 't1', staffId: 's1', serviceId: 'svc1', customerName: 'Overnight customer', petName: 'Pip', status: 'CONFIRMED', startAt: '2026-09-14T03:30:00Z', endAt: '2026-09-14T04:30:00Z' },
  { id: 'b2', tenantId: 't1', staffId: 's1', serviceId: 'svc1', customerName: 'Cancelled customer', petName: null, status: 'CANCELLED', startAt: '2026-09-14T13:00:00Z', endAt: '2026-09-14T14:00:00Z' },
]

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T12:00:00Z'))
  vi.mocked(getMe).mockResolvedValue({ id: 'u1', tenantId: 't1', oktaSubject: 'subject', role: 'STAFF', status: 'ACTIVE', timezone: 'America/New_York' })
  vi.mocked(listAvailability).mockImplementation(async id => windows.map(w => ({ ...w, id: `${id}-${w.id}`, staffId: id })))
  vi.mocked(listBookings).mockResolvedValue(bookings)
})
afterEach(() => vi.useRealTimers())

describe('all-staff weekly matrix and dated day detail', () => {
  it('renders one row per staff across seven dated days and retains inactive staff without offering availability', async () => {
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    const table = await screen.findByRole('table', { name: 'All staff weekly availability' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getAllByRole('columnheader')).toHaveLength(8)
    const alex = within(table).getByRole('rowheader', { name: 'Alex' }).closest('tr')!
    expect(within(alex).getAllByRole('cell')).toHaveLength(7)
    expect(await within(alex).findByText('09:00 – 17:00')).toBeInTheDocument()
    expect(within(alex).getByText('Off')).toBeInTheDocument()
    expect(within(alex).getByText('15:00 – 16:00')).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Blair.*Inactive/ })).toBeInTheDocument()
    expect(screen.queryByText(/All Day/i)).not.toBeInTheDocument()
    expect(listBookings).toHaveBeenCalledWith('2026-09-13T00:00:00.000Z', '2026-09-22T00:00:00.000Z')
  })

  it('opens the selected dated day with actual local/UTC confirmed overlap and partial OFF', async () => {
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Alex, Mon, Sep 14, 2026' }))
    const panel = await screen.findByRole('region', { name: 'Alex — Mon, Sep 14, 2026' })
    expect(await within(panel).findByText('Overnight customer')).toBeInTheDocument()
    expect(within(panel).queryByText('Cancelled customer')).not.toBeInTheDocument()
    expect(within(panel).getByRole('list', { name: 'Day schedule periods' })).toHaveTextContent('Working 09:00 – 17:00 (America/New_York, local)')
    expect(within(panel).getByRole('list', { name: 'Day schedule periods' })).toHaveTextContent('Break 12:00 – 12:30')
    expect(within(panel).getByRole('list', { name: 'Day schedule periods' })).toHaveTextContent('Off 15:00 – 16:00')
    expect(within(panel).getByText(/Sep 14, 2026 03:30 UTC/)).toBeInTheDocument()
    expect(within(panel).getByText(/23:30 GMT-4/)).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Edit|Delete|Cancel booking/ })).not.toBeInTheDocument()
  })

  it('navigates whole nominal weeks and does not leak the previous day selection', async () => {
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Alex, Mon, Sep 14, 2026' }))
    await user.click(screen.getByRole('button', { name: 'Next staff week' }))
    expect(await screen.findByRole('button', { name: 'Alex, Mon, Sep 21, 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Alex — Mon, Sep 14, 2026' })).not.toBeInTheDocument()
    expect(listBookings).toHaveBeenCalledWith('2026-09-20T00:00:00.000Z', '2026-09-29T00:00:00.000Z')
  })

  it('distinguishes schedule and booking failures from empty availability', async () => {
    vi.mocked(listAvailability).mockRejectedValue(new Error('Schedule network error'))
    vi.mocked(listBookings).mockRejectedValue(new Error('Bookings network error'))
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    await screen.findByText('Bookings network error')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Alex, Mon, Sep 14, 2026' }))
    const panel = await screen.findByRole('region', { name: 'Alex — Mon, Sep 14, 2026' })
    expect(await within(panel).findByText('Schedule network error')).toBeInTheDocument()
    expect(within(panel).getByText('Bookings network error')).toBeInTheDocument()
    expect(within(panel).queryByText(/No confirmed bookings|No schedule configured/)).not.toBeInTheDocument()
  })

  it('shows pending schedules/bookings instead of zero or empty claims', async () => {
    vi.mocked(listAvailability).mockImplementation(() => new Promise(() => {}))
    vi.mocked(listBookings).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Alex, Mon, Sep 14, 2026' }))
    const panel = screen.getByRole('region', { name: 'Alex — Mon, Sep 14, 2026' })
    expect(within(panel).getByText('Loading schedule…')).toBeInTheDocument()
    expect(within(panel).getByText('Loading bookings…')).toBeInTheDocument()
    expect(within(panel).queryByText(/No confirmed bookings|No schedule configured/)).not.toBeInTheDocument()
  })

  it('requires the backend tenant timezone rather than silently using UTC', async () => {
    vi.mocked(getMe).mockResolvedValue({ id: 'u1', tenantId: 't1', oktaSubject: 'subject', role: 'STAFF', status: 'ACTIVE' })
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tenant timezone unavailable')
    expect(listBookings).not.toHaveBeenCalled()
    expect(listAvailability).not.toHaveBeenCalled()
  })

  it('reports genuine empty days separately from explicit OFF and preserves inactive bookings', async () => {
    vi.mocked(listAvailability).mockResolvedValue([])
    vi.mocked(listBookings).mockResolvedValue([{ ...bookings[0], staffId: 's2' }])
    renderWithProviders(<StaffAvailabilityMatrix staff={staff} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Alex, Tue, Sep 15, 2026' }))
    const empty = screen.getByRole('region', { name: 'Alex — Tue, Sep 15, 2026' })
    expect(await within(empty).findByText('No schedule configured for this day — not available.')).toBeInTheDocument()
    expect(await within(empty).findByText('No confirmed bookings overlap this day.')).toBeInTheDocument()
    expect(within(empty).queryByText('Off')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Blair, Mon, Sep 14, 2026' }))
    const inactive = screen.getByRole('region', { name: 'Blair — Mon, Sep 14, 2026' })
    expect(within(inactive).getByText('Inactive — not available for new bookings.')).toBeInTheDocument()
    expect(await within(inactive).findByText('Overnight customer')).toBeInTheDocument()
  })
})
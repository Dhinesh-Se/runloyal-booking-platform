import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { listStaff } from '@/api/staff'
import { listAvailability } from '@/api/availability'
import { listBookings } from '@/api/bookings'
import type { AvailabilityResponse, UserResponse } from '@/api/types'
import { StaffWeekView } from '@/features/availability/StaffWeekView'
import { AvailabilityPage } from '@/features/availability/AvailabilityPage'
import { renderWithProviders } from '../testUtils'

vi.mock('@/api/auth')
vi.mock('@/api/staff')
vi.mock('@/api/availability')
vi.mock('@/api/bookings')
const admin: UserResponse = { id: 'u1', tenantId: 't1', oktaSubject: 'subject', role: 'TENANT_ADMIN', status: 'ACTIVE', timezone: 'UTC' }
const window: AvailabilityResponse = { id: 'w1', staffId: 's1', tenantId: 't1', dayOfWeek: 'MONDAY', type: 'OFF', startTime: '13:00:00', endTime: '14:00:00' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listStaff).mockResolvedValue([{ id: 's1', tenantId: 't1', userId: null, name: 'Alex', status: 'ACTIVE' }])
  vi.mocked(listAvailability).mockResolvedValue([window])
  vi.mocked(listBookings).mockResolvedValue([])
})

describe('availability administration boundaries', () => {
  it.each(['STAFF', 'inactive', 'failed', 'pending'])('hides standalone editor mutations for %s identity', async state => {
    if (state === 'STAFF') vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    if (state === 'inactive') vi.mocked(getMe).mockResolvedValue({ ...admin, status: 'INACTIVE' })
    if (state === 'failed') vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    if (state === 'pending') vi.mocked(getMe).mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<StaffWeekView availability={[window]} onAddWindow={vi.fn()} onEditWindow={vi.fn()} onDeleteWindow={vi.fn()} />)
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('13:00 – 14:00')).toBeInTheDocument()
    expect(screen.queryByText('All Day')).not.toBeInTheDocument()
  })

  it('preserves administrator add/edit/delete callbacks', async () => {
    const onAddWindow = vi.fn(), onEditWindow = vi.fn(), onDeleteWindow = vi.fn()
    renderWithProviders(<StaffWeekView availability={[window]} {...{ onAddWindow, onEditWindow, onDeleteWindow }} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add schedule for Monday' }))
    await user.click(screen.getByRole('button', { name: 'Edit Monday schedule' }))
    await user.click(screen.getByRole('button', { name: 'Delete Monday schedule' }))
    expect(onAddWindow).toHaveBeenCalledWith('MONDAY')
    expect(onEditWindow).toHaveBeenCalledWith(window)
    expect(onDeleteWindow).toHaveBeenCalledWith(window)
  })

  it('keeps matrix and recurring schedules readable without exposing STAFF mutation controls', async () => {
    vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    renderWithProviders(<AvailabilityPage />)
    await screen.findByRole('table', { name: 'All staff weekly availability' })
    await screen.findByText('Recurring schedule editor')
    expect(screen.queryByRole('button', { name: /Add Window|Add schedule|Edit.*schedule|Delete.*schedule/ })).not.toBeInTheDocument()
  })
})
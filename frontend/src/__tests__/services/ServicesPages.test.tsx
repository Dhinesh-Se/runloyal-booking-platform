import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { createService, deleteService, listServices, updateService } from '@/api/services'
import { listAssignedStaff, listStaff } from '@/api/staff'
import { listBookings } from '@/api/bookings'
import { getAvailableSlots } from '@/features/calendar/availableSlots'
import { ServiceDetail } from '@/features/services/ServiceDetail'
import { ServicesPage } from '@/features/services/ServicesPage'
import { admin, alice, bob, NOW, renderServiceView, service } from './fixtures'

vi.mock('@/api/auth', () => ({ getMe: vi.fn() }))
vi.mock('@/api/services', () => ({ listServices: vi.fn(), createService: vi.fn(), updateService: vi.fn(), deleteService: vi.fn() }))
vi.mock('@/api/staff', () => ({ listStaff: vi.fn(), listAssignedStaff: vi.fn(), assignStaffToService: vi.fn(), unassignStaffFromService: vi.fn() }))
vi.mock('@/api/bookings', () => ({ listBookings: vi.fn() }))
vi.mock('@/features/calendar/availableSlots', () => ({ getAvailableSlots: vi.fn() }))
vi.mock('@/features/bookings/BookingModal', () => ({ BookingModal: vi.fn(() => null) }))
vi.mock('@/features/bookings/BookingDetail', () => ({ BookingDetail: vi.fn(() => null) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listServices).mockResolvedValue([service])
  vi.mocked(listStaff).mockResolvedValue([alice, bob])
  vi.mocked(listAssignedStaff).mockResolvedValue([alice])
  vi.mocked(listBookings).mockResolvedValue([])
  vi.mocked(getAvailableSlots).mockResolvedValue([])
  vi.mocked(createService).mockResolvedValue(service)
  vi.mocked(updateService).mockResolvedValue(service)
  vi.mocked(deleteService).mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('service page permissions', () => {
  it.each(['staff', 'loading', 'error', 'inactive-admin'] as const)('ServicesPage is read-only for %s', async mode => {
    if (mode === 'staff') vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    if (mode === 'loading') vi.mocked(getMe).mockReturnValue(new Promise(() => {}))
    if (mode === 'error') vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    if (mode === 'inactive-admin') vi.mocked(getMe).mockResolvedValue({ ...admin, status: 'INACTIVE' })
    renderServiceView(<ServicesPage />)
    expect(await screen.findByRole('link', { name: 'Grooming' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View details for Grooming' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New Service|Edit Grooming|Delete Grooming/ })).not.toBeInTheDocument()
    expect(createService).not.toHaveBeenCalled()
    expect(updateService).not.toHaveBeenCalled()
    expect(deleteService).not.toHaveBeenCalled()
  })

  it('does not leak the empty-state create action to STAFF', async () => {
    vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    vi.mocked(listServices).mockResolvedValue([])
    renderServiceView(<ServicesPage />)
    expect(await screen.findByText('No services yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Service|New Service/ })).not.toBeInTheDocument()
  })

  it('shows create, edit and delete for active admins and removes open dialogs after role loss', async () => {
    const user = userEvent.setup()
    const { client } = renderServiceView(<ServicesPage />)
    expect(await screen.findByRole('button', { name: 'New Service' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Delete Grooming' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Grooming' }))
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    await act(async () => { client.setQueryData(['me'], { ...admin, role: 'STAFF' }) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /New Service|Edit Grooming|Delete Grooming/ })).not.toBeInTheDocument()
    expect(updateService).not.toHaveBeenCalled()
  })

  it.each(['staff', 'loading', 'error'] as const)('ServiceDetail keeps readable details but no mutations for %s', async mode => {
    if (mode === 'staff') vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    if (mode === 'loading') vi.mocked(getMe).mockReturnValue(new Promise(() => {}))
    if (mode === 'error') vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    renderServiceView(<ServiceDetail />)
    expect(await screen.findByRole('heading', { name: 'Grooming' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Alice/ })).toBeInTheDocument()
    expect(screen.getByText('60 minutes')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next seven days (UTC)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Service|Assign Staff|Unassign|Book .* at/ })).not.toBeInTheDocument()
  })

  it('allows an active admin to edit service details and hides the form on an identity error', async () => {
    const user = userEvent.setup()
    const { client } = renderServiceView(<ServiceDetail />)
    await user.click(await screen.findByRole('button', { name: 'Edit Service' }))
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    vi.mocked(getMe).mockRejectedValue(new Error('Identity expired'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['me'] }) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Edit Service' })).not.toBeInTheDocument()
    expect(updateService).not.toHaveBeenCalled()
  })
})
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getMe } from '@/api/auth'
import { assignStaffToService, listAssignedStaff, listStaff, unassignStaffFromService } from '@/api/staff'
import { ServiceAssignments } from '@/features/services/ServiceAssignments'
import { admin, alice, bob, inactiveStaff, renderServiceView, service } from './fixtures'

vi.mock('@/api/auth', () => ({ getMe: vi.fn() }))
vi.mock('@/api/staff', () => ({
  listStaff: vi.fn(), listAssignedStaff: vi.fn(), assignStaffToService: vi.fn(), unassignStaffFromService: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listStaff).mockResolvedValue([alice, bob, inactiveStaff])
  vi.mocked(listAssignedStaff).mockResolvedValue([alice])
  vi.mocked(assignStaffToService).mockResolvedValue(undefined)
  vi.mocked(unassignStaffFromService).mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('ServiceAssignments', () => {
  it('shows persisted assignments and offers only unassigned active staff', async () => {
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    expect(await screen.findByRole('link', { name: /Alice/ })).toHaveAttribute('href', '/staff/alice')
    await screen.findByRole('option', { name: 'Bob' })
    expect(screen.queryByRole('option', { name: 'Alice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Inactive Staff' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign Staff' })).toBeDisabled()
    expect(listAssignedStaff).toHaveBeenCalledWith(service.id)
  })

  it('assigns and unassigns via existing hooks and invalidates every dependent cache family', async () => {
    const user = userEvent.setup()
    const { client } = renderServiceView(<ServiceAssignments serviceId={service.id} />)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await screen.findByRole('option', { name: 'Bob' })
    await user.selectOptions(screen.getByLabelText('Assign active staff'), bob.id)
    vi.mocked(listAssignedStaff).mockResolvedValue([alice, bob])
    await user.click(screen.getByRole('button', { name: 'Assign Staff' }))
    expect(await screen.findByText('Staff assigned.')).toBeInTheDocument()
    expect(assignStaffToService).toHaveBeenCalledWith(service.id, bob.id)
    expect(await screen.findByRole('link', { name: /Bob/ })).toBeInTheDocument()
    for (const prefix of ['calendar', 'available-staff', 'services', 'service-assignments']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [prefix] })
    }
    invalidate.mockClear()
    vi.mocked(listAssignedStaff).mockResolvedValue([alice])
    await user.click(screen.getByRole('button', { name: 'Unassign Bob' }))
    expect(await screen.findByText('Staff unassigned.')).toBeInTheDocument()
    expect(unassignStaffFromService).toHaveBeenCalledWith(service.id, bob.id)
    await waitFor(() => expect(screen.queryByRole('link', { name: /Bob/ })).not.toBeInTheDocument())
    for (const prefix of ['calendar', 'available-staff', 'services', 'service-assignments']) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [prefix] })
    }
  })

  it('does not optimistically claim a failed assignment succeeded', async () => {
    const user = userEvent.setup()
    vi.mocked(assignStaffToService).mockRejectedValue(new Error('Assignment denied'))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    await screen.findByRole('option', { name: 'Bob' })
    await user.selectOptions(screen.getByLabelText('Assign active staff'), bob.id)
    await user.click(screen.getByRole('button', { name: 'Assign Staff' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment denied')
    expect(screen.queryByText('Staff assigned.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Bob/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument()
  })

  it('keeps an assignment visible when unassignment fails', async () => {
    const user = userEvent.setup()
    vi.mocked(unassignStaffFromService).mockRejectedValue(new Error('Unassignment denied'))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    await user.click(await screen.findByRole('button', { name: 'Unassign Alice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unassignment denied')
    expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument()
    expect(screen.queryByText('Staff unassigned.')).not.toBeInTheDocument()
  })

  it('disables assignment controls while a mutation is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(assignStaffToService).mockReturnValue(new Promise(() => {}))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    await screen.findByRole('option', { name: 'Bob' })
    await user.selectOptions(screen.getByLabelText('Assign active staff'), bob.id)
    await user.click(screen.getByRole('button', { name: 'Assign Staff' }))
    expect(screen.getByRole('button', { name: 'Assign Staff' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Unassign Alice' })).toBeDisabled()
    expect(screen.getByLabelText('Assign active staff')).toBeDisabled()
  })

  it('reports assignment loading and errors rather than claiming there are no assignments; supports retry', async () => {
    const user = userEvent.setup()
    vi.mocked(listAssignedStaff).mockRejectedValue(new Error('Assignment lookup failed'))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    expect(screen.getByText('Loading assignments…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Assignment lookup failed')
    expect(screen.queryByText('No staff assigned to this service yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign Staff' })).not.toBeInTheDocument()
    vi.mocked(listAssignedStaff).mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(await screen.findByText('No staff assigned to this service yet.')).toBeInTheDocument()
  })

  it('reports staff-list failure while preserving known assignments', async () => {
    vi.mocked(listStaff).mockRejectedValue(new Error('Roster lookup failed'))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Roster lookup failed')
    expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument()
    expect(screen.queryByText('No unassigned active staff available.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign Staff' })).not.toBeInTheDocument()
  })

  it('shows a genuine empty candidate list', async () => {
    vi.mocked(listStaff).mockResolvedValue([alice, inactiveStaff])
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    expect(await screen.findByText('No unassigned active staff available.')).toBeInTheDocument()
  })

  it.each(['staff', 'loading', 'error'] as const)('hides every mutation control for %s identity', async mode => {
    if (mode === 'staff') vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    if (mode === 'loading') vi.mocked(getMe).mockReturnValue(new Promise(() => {}))
    if (mode === 'error') vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    renderServiceView(<ServiceAssignments serviceId={service.id} />)
    await screen.findByRole('link', { name: /Alice/ })
    expect(screen.queryByRole('button', { name: /Assign Staff|Unassign/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Assign active staff')).not.toBeInTheDocument()
    expect(assignStaffToService).not.toHaveBeenCalled()
    expect(unassignStaffFromService).not.toHaveBeenCalled()
  })

  it('fails closed when cached admin identity refresh fails', async () => {
    const { client } = renderServiceView(<ServiceAssignments serviceId={service.id} />)
    await screen.findByRole('button', { name: 'Unassign Alice' })
    vi.mocked(getMe).mockRejectedValue(new Error('Identity expired'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['me'] }) })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Unassign/ })).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Assign active staff')).not.toBeInTheDocument()
  })
})
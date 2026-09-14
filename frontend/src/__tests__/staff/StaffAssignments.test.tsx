import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffAssignments } from '@/features/staff/StaffAssignments'
import { getMe } from '@/api/auth'
import { listServices } from '@/api/services'
import { assignStaffToService, listAssignedStaff, unassignStaffFromService } from '@/api/staff'
import { admin, member, renderStaff, services } from './fixtures'

vi.mock('@/api/auth')
vi.mock('@/api/services')
vi.mock('@/api/staff')

let persisted: Set<string>

beforeEach(() => {
  vi.resetAllMocks()
  persisted = new Set(['svc-1'])
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listServices).mockResolvedValue(services)
  vi.mocked(listAssignedStaff).mockImplementation(async id => persisted.has(id) ? [member] : [])
  vi.mocked(assignStaffToService).mockImplementation(async id => { persisted.add(id) })
  vi.mocked(unassignStaffFromService).mockImplementation(async id => { persisted.delete(id) })
})

describe('StaffAssignments', () => {
  it('renders persisted assignments, ignoring an empty legacy local set', async () => {
    const { client } = renderStaff(
      <StaffAssignments
        staffId="staff-1"
        assignedServiceIds={new Set()}
        onAssignmentChange={vi.fn()}
      />
    )

    expect(await screen.findByRole('checkbox', { name: 'Unassign Bath & Brush' })).toBeChecked()
    expect(screen.getByText('Bath & Brush')).toBeInTheDocument()
    expect(screen.getByText('Teeth Cleaning')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Assign Teeth Cleaning' })).not.toBeChecked()
    expect(listAssignedStaff).toHaveBeenCalledWith('svc-1')
    expect(listAssignedStaff).toHaveBeenCalledWith('svc-2')
    expect(client.getQueryData(['service-assignments', 'svc-1'])).toEqual([member])
    expect(client.getQueryData(['service-assignments', 'svc-2'])).toEqual([])
  })

  it('assigns staff to service when unchecked checkbox is clicked', async () => {
    const handleAssignmentChange = vi.fn()
    const user = userEvent.setup()

    const view = renderStaff(
      <StaffAssignments
        staffId="staff-1"
        onAssignmentChange={handleAssignmentChange}
      />
    )

    const cb2 = await screen.findByRole('checkbox', { name: 'Assign Teeth Cleaning' })
    await user.click(cb2)

    await waitFor(() => {
      expect(assignStaffToService).toHaveBeenCalledWith('svc-2', 'staff-1')
      expect(handleAssignmentChange).toHaveBeenCalledWith('svc-2', true)
    })
    expect(await screen.findByRole('checkbox', { name: 'Unassign Teeth Cleaning' })).toBeChecked()
    view.unmount()
    renderStaff(<StaffAssignments staffId="staff-1" />)
    expect(await screen.findByRole('checkbox', { name: 'Unassign Teeth Cleaning' })).toBeChecked()
  })

  it('unassigns staff from service when checked checkbox is clicked', async () => {
    const handleAssignmentChange = vi.fn()
    const user = userEvent.setup()

    renderStaff(
      <StaffAssignments
        staffId="staff-1"
        onAssignmentChange={handleAssignmentChange}
      />
    )

    const cb1 = await screen.findByRole('checkbox', { name: 'Unassign Bath & Brush' })
    await user.click(cb1)

    await waitFor(() => {
      expect(unassignStaffFromService).toHaveBeenCalledWith('svc-1', 'staff-1')
      expect(handleAssignmentChange).toHaveBeenCalledWith('svc-1', false)
    })
    expect(await screen.findByRole('checkbox', { name: 'Assign Bath & Brush' })).not.toBeChecked()
  })

  it.each([
    ['STAFF', { ...admin, role: 'STAFF' as const }],
    ['inactive administrator', { ...admin, status: 'INACTIVE' as const }],
  ])('keeps persisted checkboxes read-only for %s', async (_label, identity) => {
    vi.mocked(getMe).mockResolvedValue(identity)
    const callback = vi.fn()
    renderStaff(<StaffAssignments staffId="staff-1" onAssignmentChange={callback} />)
    const assigned = await screen.findByRole('checkbox', { name: 'Bath & Brush assignment' })
    const unassigned = screen.getByRole('checkbox', { name: 'Teeth Cleaning assignment' })
    expect(assigned).toBeChecked()
    expect(assigned).toBeDisabled()
    expect(unassigned).not.toBeChecked()
    expect(unassigned).toBeDisabled()
    await userEvent.setup().click(assigned)
    await userEvent.setup().click(unassigned)
    expect(assignStaffToService).not.toHaveBeenCalled()
    expect(unassignStaffFromService).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it.each(['pending', 'error'] as const)('fails closed while identity is %s', async state => {
    if (state === 'pending') vi.mocked(getMe).mockImplementation(() => new Promise(() => {}))
    else vi.mocked(getMe).mockRejectedValue(new Error('Identity unavailable'))
    renderStaff(<StaffAssignments staffId="staff-1" />)
    expect(await screen.findByRole('checkbox', { name: 'Bath & Brush assignment' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Teeth Cleaning assignment' })).toBeDisabled()
    expect(assignStaffToService).not.toHaveBeenCalled()
    expect(unassignStaffFromService).not.toHaveBeenCalled()
  })

  it('does not present unknown assignments as unchecked while loading', async () => {
    vi.mocked(listAssignedStaff).mockImplementation(() => new Promise(() => {}))
    renderStaff(<StaffAssignments staffId="staff-1" />)
    expect(await screen.findByText('Loading assignments for Bath & Brush…')).toBeInTheDocument()
    expect(screen.getByText('Loading assignments for Teeth Cleaning…')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows per-service failures honestly and retries the persisted query', async () => {
    vi.mocked(listAssignedStaff).mockImplementation(async id => {
      if (id === 'svc-1') throw new Error('Assignment lookup failed')
      return []
    })
    renderStaff(<StaffAssignments staffId="staff-1" />)
    const error = await screen.findByRole('alert')
    expect(within(error).getByText('Assignments unavailable for Bath & Brush')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Bath & Brush/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Teeth Cleaning/ })).toBeInTheDocument()
    vi.mocked(listAssignedStaff).mockResolvedValue([member])
    await userEvent.setup().click(within(error).getByRole('button', { name: 'Try Again' }))
    expect(await screen.findByRole('checkbox', { name: 'Unassign Bath & Brush' })).toBeChecked()
  })

  it('shows service-list failure instead of a false empty state', async () => {
    vi.mocked(listServices).mockRejectedValue(new Error('Services lookup failed'))
    renderStaff(<StaffAssignments staffId="staff-1" />)
    expect(await screen.findByText('Services unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No services available.')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not change persisted state or notify callbacks on mutation failure', async () => {
    vi.mocked(assignStaffToService).mockRejectedValue(new Error('Assignment rejected'))
    const callback = vi.fn()
    renderStaff(<StaffAssignments staffId="staff-1" onAssignmentChange={callback} />)
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Assign Teeth Cleaning' }))
    expect(assignStaffToService).toHaveBeenCalledWith('svc-2', 'staff-1')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Assign Teeth Cleaning' })).toBeEnabled())
    expect(screen.getByRole('checkbox', { name: 'Assign Teeth Cleaning' })).not.toBeChecked()
    expect(callback).not.toHaveBeenCalled()
  })

  it('disables all toggles during a mutation without inventing an optimistic assignment', async () => {
    let finish!: () => void
    vi.mocked(assignStaffToService).mockImplementation(() => new Promise<void>(resolve => {
      finish = () => { persisted.add('svc-2'); resolve() }
    }))
    renderStaff(<StaffAssignments staffId="staff-1" />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: 'Assign Teeth Cleaning' }))
    const assigned = screen.getByRole('checkbox', { name: 'Unassign Bath & Brush' })
    const unassigned = screen.getByRole('checkbox', { name: 'Assign Teeth Cleaning' })
    expect(assigned).toBeDisabled()
    expect(unassigned).toBeDisabled()
    expect(unassigned).not.toBeChecked()
    expect(screen.getByText('Saving assignment…')).toBeInTheDocument()
    await user.click(assigned)
    expect(unassignStaffFromService).not.toHaveBeenCalled()
    await act(async () => { finish() })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Unassign Teeth Cleaning' })).toBeEnabled())
    expect(screen.getByRole('checkbox', { name: 'Unassign Teeth Cleaning' })).toBeChecked()
  })

  it('hides stale assignment state when a background refresh fails', async () => {
    const { client } = renderStaff(<StaffAssignments staffId="staff-1" />)
    await screen.findByRole('checkbox', { name: 'Unassign Bath & Brush' })
    vi.mocked(listAssignedStaff).mockRejectedValue(new Error('Refresh failed'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['service-assignments'] }) })
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument())
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })
})

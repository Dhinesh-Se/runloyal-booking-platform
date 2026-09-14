import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { getMe } from '@/api/auth'
import { listAvailability } from '@/api/availability'
import { listServices } from '@/api/services'
import { createStaff, listAssignedStaff, listStaff, updateStaff } from '@/api/staff'
import { StaffDetail } from '@/features/staff/StaffDetail'
import { StaffForm } from '@/features/staff/StaffForm'
import { StaffPage } from '@/features/staff/StaffPage'
import { admin, member, renderStaff, services } from './fixtures'

vi.mock('@/api/auth')
vi.mock('@/api/availability')
vi.mock('@/api/services')
vi.mock('@/api/staff')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getMe).mockResolvedValue(admin)
  vi.mocked(listStaff).mockResolvedValue([member])
  vi.mocked(listServices).mockResolvedValue(services)
  vi.mocked(listAssignedStaff).mockImplementation(async id => id === 'svc-1' ? [member] : [])
  vi.mocked(listAvailability).mockResolvedValue([])
  vi.mocked(createStaff).mockImplementation(async command => ({ ...member, id: 'staff-2', ...command }))
  vi.mocked(updateStaff).mockImplementation(async (id, command) => ({ ...member, id, ...command }))
})

function renderDetail() {
  return renderStaff(
    <Routes><Route path="/staff/:id" element={<StaffDetail />} /></Routes>,
    undefined, '/staff/staff-1',
  )
}

describe('StaffPage permissions and CRUD', () => {
  it('preserves administrator create and update commands', async () => {
    const user = userEvent.setup()
    renderStaff(<StaffPage />)
    await user.click(await screen.findByRole('button', { name: 'Add Staff' }))
    const createDialog = screen.getByRole('dialog')
    await user.type(within(createDialog).getByLabelText(/Full Name/), 'New Teammate')
    await user.click(within(createDialog).getByRole('button', { name: 'Add Staff' }))
    await waitFor(() => expect(createStaff).toHaveBeenCalledWith({ name: 'New Teammate', status: 'ACTIVE' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Edit Jane Smith' }))
    const editDialog = screen.getByRole('dialog')
    const name = within(editDialog).getByLabelText(/Full Name/)
    await user.clear(name)
    await user.type(name, 'Jane Updated')
    await user.selectOptions(within(editDialog).getByLabelText('Status'), 'INACTIVE')
    await user.click(within(editDialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith('staff-1', { name: 'Jane Updated', status: 'INACTIVE' }))
  })

  it.each([
    ['STAFF', { ...admin, role: 'STAFF' as const }],
    ['inactive administrator', { ...admin, status: 'INACTIVE' as const }],
  ])('shows view links but no mutation controls for %s', async (_label, identity) => {
    vi.mocked(getMe).mockResolvedValue(identity)
    renderStaff(<StaffPage />)
    expect(await screen.findByRole('link', { name: 'View Jane Smith' })).toHaveAttribute('href', '/staff/staff-1')
    expect(screen.queryByRole('button', { name: 'Add Staff' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
    expect(createStaff).not.toHaveBeenCalled()
    expect(updateStaff).not.toHaveBeenCalled()
  })

  it('has no management call to action in the STAFF empty state', async () => {
    vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    vi.mocked(listStaff).mockResolvedValue([])
    renderStaff(<StaffPage />)
    expect(await screen.findByText('No staff members yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Staff' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Add your first team member/)).not.toBeInTheDocument()
  })

  it.each(['pending', 'error'] as const)('fails closed for %s identity', async state => {
    if (state === 'pending') vi.mocked(getMe).mockImplementation(() => new Promise(() => {}))
    else vi.mocked(getMe).mockRejectedValue(new Error('Identity failed'))
    renderStaff(<StaffPage />)
    await screen.findByRole('link', { name: 'View Jane Smith' })
    expect(screen.queryByRole('button', { name: /Add Staff|Edit/ })).not.toBeInTheDocument()
  })

  it('closes an open editor and fails closed when cached admin identity fails to refresh', async () => {
    const { client } = renderStaff(<StaffPage />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Edit Jane Smith' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    vi.mocked(getMe).mockRejectedValue(new Error('Identity refresh failed'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['me'] }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Add Staff|Edit/ })).not.toBeInTheDocument()
    expect(updateStaff).not.toHaveBeenCalled()
  })

  it('keeps a rejected create form open and shows the server error', async () => {
    vi.mocked(createStaff).mockRejectedValue(new Error('Staff creation rejected'))
    const user = userEvent.setup()
    renderStaff(<StaffPage />)
    await user.click(await screen.findByRole('button', { name: 'Add Staff' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Full Name/), 'New Teammate')
    await user.click(within(dialog).getByRole('button', { name: 'Add Staff' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Staff creation rejected')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('StaffDetail', () => {
  it('loads persisted assignments and labels recurring windows in the tenant timezone', async () => {
    vi.mocked(listAvailability).mockResolvedValue([
      { id: 'w-2', tenantId: 't-1', staffId: member.id, dayOfWeek: 'TUESDAY', startTime: '10:00:00', endTime: '11:00:00', type: 'BREAK' },
      { id: 'w-1', tenantId: 't-1', staffId: member.id, dayOfWeek: 'MONDAY', startTime: '09:00:00', endTime: '17:00:00', type: 'WORKING' },
    ])
    renderDetail()
    expect(await screen.findByRole('checkbox', { name: 'Unassign Bath & Brush' })).toBeChecked()
    expect(screen.getByText('Recurring schedule · Tenant-local time (America/New_York)')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Availability for Jane Smith' })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Mon09:0017:00Working')
    expect(rows[2]).toHaveTextContent('Tue10:0011:00Break')
    expect(table).not.toHaveTextContent('UTC')
  })

  it('preserves administrator detail editing', async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'INACTIVE')
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith(member.id, { name: member.name, status: 'INACTIVE' }))
  })

  it.each([
    ['STAFF', { ...admin, role: 'STAFF' as const }],
    ['inactive administrator', { ...admin, status: 'INACTIVE' as const }],
  ])('keeps detail and availability actions read-only for %s', async (_label, identity) => {
    vi.mocked(getMe).mockResolvedValue(identity)
    renderDetail()
    expect(await screen.findByRole('checkbox', { name: 'Bath & Brush assignment' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Bath & Brush assignment' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Manage|Add availability/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View availability' })).toHaveAttribute('href', '/availability')
  })

  it('shows availability errors instead of pretending there are no windows, and supports retry', async () => {
    vi.mocked(listAvailability).mockRejectedValue(new Error('Availability request failed'))
    renderDetail()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Availability unavailable')
    expect(screen.queryByText(/No availability windows set/)).not.toBeInTheDocument()
    vi.mocked(listAvailability).mockResolvedValue([])
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try Again' }))
    expect(await screen.findByText(/No availability windows set/)).toBeInTheDocument()
  })

  it('does not report an empty schedule while availability is loading', async () => {
    vi.mocked(listAvailability).mockImplementation(() => new Promise(() => {}))
    renderDetail()
    await screen.findByRole('heading', { name: 'Jane Smith' })
    const availabilityCard = screen.getByRole('heading', { name: 'Availability' }).closest<HTMLDivElement>('.card')!
    expect(within(availabilityCard).getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(screen.queryByText(/No availability windows set/)).not.toBeInTheDocument()
  })

  it('does not reuse stale availability as successful data after a refresh fails', async () => {
    vi.mocked(listAvailability).mockResolvedValue([
      { id: 'w-1', tenantId: 't-1', staffId: member.id, dayOfWeek: 'MONDAY', startTime: '09:00:00', endTime: '17:00:00', type: 'WORKING' },
    ])
    const { client } = renderDetail()
    await screen.findByRole('table', { name: 'Availability for Jane Smith' })
    vi.mocked(listAvailability).mockRejectedValue(new Error('Availability refresh failed'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['availability', member.id] }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Availability refresh failed')
    expect(screen.queryByRole('table', { name: 'Availability for Jane Smith' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No availability windows set/)).not.toBeInTheDocument()
  })

  it.each([undefined, 'Not/A-Timezone'])('does not invent a schedule timezone when %s', async timezone => {
    vi.mocked(getMe).mockResolvedValue({ ...admin, timezone })
    renderDetail()
    expect(await screen.findByText('Recurring schedule · Tenant-local time (timezone unavailable)')).toBeInTheDocument()
  })
})

describe('StaffForm standalone guard', () => {
  it('disables mutations and ignores submits for STAFF', async () => {
    vi.mocked(getMe).mockResolvedValue({ ...admin, role: 'STAFF' })
    const submit = vi.fn().mockResolvedValue(undefined)
    renderStaff(<StaffForm defaultValues={{ name: member.name }} onSubmit={submit} onCancel={vi.fn()} />)
    const input = screen.getByLabelText(/Full Name/)
    expect(input).toBeDisabled()
    expect(screen.getByLabelText('Status')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await act(async () => { fireEvent.submit(input.closest('form')!) })
    expect(submit).not.toHaveBeenCalled()
  })
})
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffAssignments } from '@/features/staff/StaffAssignments'
import { renderWithProviders } from '../testUtils'

const mockServices = [
  {
    id: 'svc-1',
    tenantId: 't-1',
    name: 'Bath & Brush',
    description: null,
    category: 'Grooming',
    durationMinutes: 45,
    price: 35,
    status: 'ACTIVE' as const,
  },
  {
    id: 'svc-2',
    tenantId: 't-1',
    name: 'Teeth Cleaning',
    description: null,
    category: 'Dental',
    durationMinutes: 30,
    price: 25,
    status: 'ACTIVE' as const,
  },
]

const mockAssignMutate = vi.fn().mockResolvedValue(undefined)
const mockUnassignMutate = vi.fn().mockResolvedValue(undefined)

vi.mock('@/features/services/useServices', () => ({
  useServices: () => ({
    data: mockServices,
    isLoading: false,
  }),
}))

vi.mock('@/features/staff/useStaff', () => ({
  useAssignStaff: () => ({
    mutateAsync: (...args: unknown[]) => mockAssignMutate(...args),
  }),
  useUnassignStaff: () => ({
    mutateAsync: (...args: unknown[]) => mockUnassignMutate(...args),
  }),
}))

describe('StaffAssignments', () => {
  it('renders services list with checkboxes', () => {
    renderWithProviders(
      <StaffAssignments
        staffId="staff-1"
        assignedServiceIds={new Set(['svc-1'])}
        onAssignmentChange={vi.fn()}
      />
    )

    expect(screen.getByText('Bath & Brush')).toBeInTheDocument()
    expect(screen.getByText('Teeth Cleaning')).toBeInTheDocument()

    const cb1 = screen.getByLabelText(/Bath & Brush/i) as HTMLInputElement
    const cb2 = screen.getByLabelText(/Teeth Cleaning/i) as HTMLInputElement

    expect(cb1.checked).toBe(true)
    expect(cb2.checked).toBe(false)
  })

  it('assigns staff to service when unchecked checkbox is clicked', async () => {
    const handleAssignmentChange = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <StaffAssignments
        staffId="staff-1"
        assignedServiceIds={new Set(['svc-1'])}
        onAssignmentChange={handleAssignmentChange}
      />
    )

    const cb2 = screen.getByLabelText(/Teeth Cleaning/i)
    await user.click(cb2)

    await waitFor(() => {
      expect(mockAssignMutate).toHaveBeenCalledWith({
        serviceId: 'svc-2',
        staffId: 'staff-1',
      })
      expect(handleAssignmentChange).toHaveBeenCalledWith('svc-2', true)
    })
  })

  it('unassigns staff from service when checked checkbox is clicked', async () => {
    const handleAssignmentChange = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(
      <StaffAssignments
        staffId="staff-1"
        assignedServiceIds={new Set(['svc-1'])}
        onAssignmentChange={handleAssignmentChange}
      />
    )

    const cb1 = screen.getByLabelText(/Bath & Brush/i)
    await user.click(cb1)

    await waitFor(() => {
      expect(mockUnassignMutate).toHaveBeenCalledWith({
        serviceId: 'svc-1',
        staffId: 'staff-1',
      })
      expect(handleAssignmentChange).toHaveBeenCalledWith('svc-1', false)
    })
  })
})

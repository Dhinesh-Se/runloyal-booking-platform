import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignStaffToService, createStaff, listAssignedStaff, unassignStaffFromService, updateStaff } from '@/api/staff'
import { useAssignments, useAssignStaff, useCreateStaff, useUnassignStaff, useUpdateStaff } from '@/features/staff/useStaff'
import { createTestQueryClient } from '../testUtils'
import { member } from './fixtures'

vi.mock('@/api/staff')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createStaff).mockResolvedValue(member)
  vi.mocked(updateStaff).mockResolvedValue(member)
  vi.mocked(assignStaffToService).mockResolvedValue(undefined)
  vi.mocked(unassignStaffFromService).mockResolvedValue(undefined)
  vi.mocked(listAssignedStaff).mockResolvedValue([member])
})

const dependentKeys = [
  ['staff'],
  ['service-assignments', 'svc-1'],
  ['service-assignments', 'svc-2'],
  ['available-staff', 'svc-1', '2026-09-14T09:00:00Z'],
  ['calendar', 'available-slots', 'svc-1'],
  ['calendar', 'service-upcoming', 'bookings', 'svc-1'],
  ['calendar', 'service-upcoming', 'available-slots', 'svc-2'],
]

function wrapperFor(client: ReturnType<typeof createTestQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('staff mutation cache invalidation', () => {
  it.each(['create', 'update', 'assign', 'unassign'] as const)('%s invalidates staff, assignments, calendar/upcoming and eligible staff', async mutation => {
    const client = createTestQueryClient()
    dependentKeys.forEach(key => client.setQueryData(key, []))
    client.setQueryData(['unrelated'], 'keep')
    const { result } = renderHook(() => ({
      create: useCreateStaff(), update: useUpdateStaff(), assign: useAssignStaff(), unassign: useUnassignStaff(),
    }), { wrapper: wrapperFor(client) })
    const command = { name: member.name, status: 'ACTIVE' as const }
    const assignment = { serviceId: 'svc-1', staffId: member.id }
    await act(async () => {
      if (mutation === 'create') await result.current.create.mutateAsync(command)
      else if (mutation === 'update') await result.current.update.mutateAsync({ id: member.id, command })
      else if (mutation === 'assign') await result.current.assign.mutateAsync(assignment)
      else await result.current.unassign.mutateAsync(assignment)
    })
    for (const key of dependentKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false)
    if (mutation === 'create') expect(createStaff).toHaveBeenCalledWith(command)
    else if (mutation === 'update') expect(updateStaff).toHaveBeenCalledWith(member.id, command)
    else if (mutation === 'assign') expect(assignStaffToService).toHaveBeenCalledWith('svc-1', member.id)
    else expect(unassignStaffFromService).toHaveBeenCalledWith('svc-1', member.id)
  })

  it('does not invalidate data as though a rejected mutation succeeded', async () => {
    const client = createTestQueryClient()
    dependentKeys.forEach(key => client.setQueryData(key, []))
    vi.mocked(updateStaff).mockRejectedValue(new Error('Update rejected'))
    const { result } = renderHook(() => useUpdateStaff(), { wrapper: wrapperFor(client) })
    await act(async () => {
      await expect(result.current.mutateAsync({ id: member.id, command: { name: member.name, status: 'INACTIVE' } }))
        .rejects.toThrow('Update rejected')
    })
    for (const key of dependentKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  })
})

describe('useAssignments public query contract', () => {
  it('returns persisted data, loading/error metadata and refetch under the shared key', async () => {
    const client = createTestQueryClient()
    const { result } = renderHook(() => useAssignments('svc-1'), { wrapper: wrapperFor(client) })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.assignments).toEqual([member]))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.error).toBeNull()
    expect(client.getQueryData(['service-assignments', 'svc-1'])).toEqual([member])
    vi.mocked(listAssignedStaff).mockResolvedValue([])
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.assignments).toEqual([]))
  })

  it('exposes an error instead of claiming an empty assignment lookup succeeded, and can retry', async () => {
    const failure = new Error('Assignments request failed')
    vi.mocked(listAssignedStaff).mockRejectedValue(failure)
    const client = createTestQueryClient()
    const { result } = renderHook(() => useAssignments('svc-1'), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBe(failure)
    expect(result.current.isLoading).toBe(false)
    vi.mocked(listAssignedStaff).mockResolvedValue([member])
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.assignments).toEqual([member]))
    expect(result.current.isError).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAvailability, deleteAvailability, updateAvailability } from '@/api/availability'
import { useCreateAvailability, useDeleteAvailability, useUpdateAvailability } from '@/features/availability/useAvailability'
import { createTestQueryClient } from '../testUtils'

vi.mock('@/api/availability')
beforeEach(() => vi.resetAllMocks())

describe('schedule mutations invalidate all slot consumers', () => {
  it.each(['create', 'update', 'delete'])('%s invalidates schedule, calendar, service upcoming and eligible staff', async operation => {
    const client = createTestQueryClient()
    const dependentKeys = [
      ['availability', 's1'], ['calendar', 'slots', 'svc1'],
      ['calendar', 'service-upcoming', 'available-slots', 'svc1'],
      ['calendar', 'staff-week-bookings'], ['available-staff', 'svc1', 'instant'],
    ]
    for (const key of dependentKeys) client.setQueryData(key, [])
    client.setQueryData(['availability', 'other-staff'], [])
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => ({
      create: useCreateAvailability('s1'), update: useUpdateAvailability('s1'), delete: useDeleteAvailability('s1'),
    }), { wrapper })
    const command = { dayOfWeek: 'MONDAY' as const, type: 'OFF' as const, startTime: '13:00', endTime: '14:00' }
    await act(async () => {
      if (operation === 'create') await result.current.create.mutateAsync(command)
      if (operation === 'update') await result.current.update.mutateAsync({ id: 'w1', command })
      if (operation === 'delete') await result.current.delete.mutateAsync('w1')
    })
    for (const key of dependentKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['availability', 'other-staff'])?.isInvalidated).toBe(false)
    if (operation === 'create') expect(createAvailability).toHaveBeenCalledWith('s1', command)
    if (operation === 'update') expect(updateAvailability).toHaveBeenCalledWith('s1', 'w1', command)
    if (operation === 'delete') expect(deleteAvailability).toHaveBeenCalledWith('s1', 'w1')
  })
})
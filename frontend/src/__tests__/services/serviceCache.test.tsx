import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createService, updateService, deleteService } from '@/api/services'
import { useCreateService, useUpdateService, useDeleteService } from '@/features/services/useServices'
import { createTestQueryClient } from '../testUtils'
import { service } from './fixtures'

vi.mock('@/api/services', () => ({ createService: vi.fn(), updateService: vi.fn(), deleteService: vi.fn(), listServices: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createService).mockResolvedValue(service)
  vi.mocked(updateService).mockResolvedValue(service)
  vi.mocked(deleteService).mockResolvedValue(undefined)
})

describe('service mutation cache invalidation', () => {
  it.each(['create', 'update', 'delete'] as const)('%s invalidates calendar, eligible staff, services and assignments', async kind => {
    const client = createTestQueryClient()
    const keys = [
      ['services'], ['service-assignments', service.id],
      ['calendar', 'service-upcoming', 'bookings', service.id],
      ['calendar', 'service-upcoming', 'available-slots', service.id],
      ['calendar', 'bookings', 'week'],
      ['available-staff', service.id, '2026-09-15T09:00:00Z'],
    ]
    keys.forEach(key => client.setQueryData(key, []))
    client.setQueryData(['unrelated'], [])
    const { result } = renderHook(() => ({ create: useCreateService(), update: useUpdateService(), delete: useDeleteService() }), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    const command = { name: service.name, category: service.category, durationMinutes: 90, price: 50, status: service.status }
    await act(async () => {
      if (kind === 'create') await result.current.create.mutateAsync(command)
      if (kind === 'update') await result.current.update.mutateAsync({ id: service.id, command })
      if (kind === 'delete') await result.current.delete.mutateAsync(service.id)
    })
    keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false)
    if (kind === 'create') expect(createService).toHaveBeenCalledWith(command)
    if (kind === 'update') expect(updateService).toHaveBeenCalledWith(service.id, command)
    if (kind === 'delete') expect(deleteService).toHaveBeenCalledWith(service.id)
  })

  it('does not mark caches invalid when the mutation fails', async () => {
    const client = createTestQueryClient()
    client.setQueryData(['calendar', 'bookings'], [])
    vi.mocked(deleteService).mockRejectedValue(new Error('Delete failed'))
    const { result } = renderHook(() => useDeleteService(), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await act(async () => {
      await expect(result.current.mutateAsync(service.id)).rejects.toThrow('Delete failed')
    })
    expect(client.getQueryState(['calendar', 'bookings'])?.isInvalidated).toBe(false)
  })
})
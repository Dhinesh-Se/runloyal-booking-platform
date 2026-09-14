import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { getAvailableSlots } from '@/features/calendar/availableSlots'

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }))

beforeEach(() => vi.resetAllMocks())

describe('calendar available-slots API contract', () => {
  it('requests the service-scoped backend endpoint with ISO instant range parameters', async () => {
    const slots = [{ startAt: '2026-09-14T09:00:00Z', endAt: '2026-09-14T10:30:00Z', availableStaff: [] }]
    vi.mocked(apiClient.get).mockResolvedValue({ data: slots })
    const from = '2026-09-14T00:00:00.000Z'
    const to = '2026-09-21T01:30:00.000Z'
    await expect(getAvailableSlots('service-1', from, to)).resolves.toEqual(slots)
    expect(apiClient.get).toHaveBeenCalledWith('/services/service-1/available-slots', { params: { from, to } })
  })

  it('propagates errors instead of pretending there are no slots', async () => {
    const error = new Error('Unavailable')
    vi.mocked(apiClient.get).mockRejectedValue(error)
    await expect(getAvailableSlots('service-1', 'from', 'to')).rejects.toBe(error)
  })
})
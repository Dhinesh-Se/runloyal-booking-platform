import { apiClient } from '@/api/client'
import type { AvailableSlotResponse } from '@/api/types'

// Calendar-local adapter: the shared services module currently exposes CRUD only.
export async function getAvailableSlots(
  serviceId: string, from: string, to: string,
): Promise<AvailableSlotResponse[]> {
  const { data } = await apiClient.get<AvailableSlotResponse[]>(
    `/services/${serviceId}/available-slots`, { params: { from, to } },
  )
  return data
}
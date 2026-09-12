import { apiClient } from './client'
import type { AvailabilityCommand, AvailabilityResponse } from './types'

export async function listAvailability(staffId: string): Promise<AvailabilityResponse[]> {
  const { data } = await apiClient.get<AvailabilityResponse[]>(`/staff/${staffId}/availability`)
  return data
}

export async function createAvailability(
  staffId: string,
  command: AvailabilityCommand
): Promise<AvailabilityResponse> {
  const { data } = await apiClient.post<AvailabilityResponse>(
    `/staff/${staffId}/availability`,
    command
  )
  return data
}

export async function updateAvailability(
  staffId: string,
  id: string,
  command: AvailabilityCommand
): Promise<AvailabilityResponse> {
  const { data } = await apiClient.put<AvailabilityResponse>(
    `/staff/${staffId}/availability/${id}`,
    command
  )
  return data
}

export async function deleteAvailability(staffId: string, id: string): Promise<void> {
  await apiClient.delete(`/staff/${staffId}/availability/${id}`)
}

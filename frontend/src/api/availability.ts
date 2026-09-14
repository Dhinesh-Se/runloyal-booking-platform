import { apiClient } from './client'
import type { AvailabilityCommand, AvailabilityResponse, UnavailabilityCommand, UnavailabilityResponse } from './types'

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

export async function listUnavailability(staffId: string): Promise<UnavailabilityResponse[]> {
  const { data } = await apiClient.get<UnavailabilityResponse[]>(`/staff/${staffId}/unavailability`)
  return data
}

export async function createUnavailability(staffId: string, command: UnavailabilityCommand): Promise<UnavailabilityResponse> {
  const { data } = await apiClient.post<UnavailabilityResponse>(`/staff/${staffId}/unavailability`, command)
  return data
}

export async function updateUnavailability(staffId: string, id: string, command: UnavailabilityCommand): Promise<UnavailabilityResponse> {
  const { data } = await apiClient.put<UnavailabilityResponse>(`/staff/${staffId}/unavailability/${id}`, command)
  return data
}

export async function deleteUnavailability(staffId: string, id: string): Promise<void> {
  await apiClient.delete(`/staff/${staffId}/unavailability/${id}`)
}

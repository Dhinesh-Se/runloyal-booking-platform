import { apiClient } from './client'
import type { StaffCommand, StaffResponse } from './types'

export async function listStaff(): Promise<StaffResponse[]> {
  const { data } = await apiClient.get<StaffResponse[]>('/staff')
  return data
}

export async function createStaff(command: StaffCommand): Promise<StaffResponse> {
  const { data } = await apiClient.post<StaffResponse>('/staff', command)
  return data
}

export async function updateStaff(id: string, command: StaffCommand): Promise<StaffResponse> {
  const { data } = await apiClient.put<StaffResponse>(`/staff/${id}`, command)
  return data
}

export async function assignStaffToService(serviceId: string, staffId: string): Promise<void> {
  await apiClient.post(`/services/${serviceId}/staff/${staffId}`)
}

export async function unassignStaffFromService(serviceId: string, staffId: string): Promise<void> {
  await apiClient.delete(`/services/${serviceId}/staff/${staffId}`)
}

export async function getAvailableStaffForSlot(
  serviceId: string,
  startAt: string
): Promise<StaffResponse[]> {
  const { data } = await apiClient.get<StaffResponse[]>(
    `/services/${serviceId}/available-staff`,
    { params: { startAt } }
  )
  return data
}

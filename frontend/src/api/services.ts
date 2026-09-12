import { apiClient } from './client'
import type { ServiceCommand, ServiceResponse } from './types'

export async function listServices(): Promise<ServiceResponse[]> {
  const { data } = await apiClient.get<ServiceResponse[]>('/services')
  return data
}

export async function createService(command: ServiceCommand): Promise<ServiceResponse> {
  const { data } = await apiClient.post<ServiceResponse>('/services', command)
  return data
}

export async function updateService(id: string, command: ServiceCommand): Promise<ServiceResponse> {
  const { data } = await apiClient.put<ServiceResponse>(`/services/${id}`, command)
  return data
}

export async function deleteService(id: string): Promise<void> {
  await apiClient.delete(`/services/${id}`)
}

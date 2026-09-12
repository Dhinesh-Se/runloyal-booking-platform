import { apiClient } from './client'
import type { UserResponse } from './types'

export async function getMe(): Promise<UserResponse> {
  const { data } = await apiClient.get<UserResponse>('/me')
  return data
}

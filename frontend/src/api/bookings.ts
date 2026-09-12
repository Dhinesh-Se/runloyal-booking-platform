import { apiClient } from './client'
import type { BookingCommand, BookingResponse } from './types'

export async function listBookings(from: string, to: string): Promise<BookingResponse[]> {
  const { data } = await apiClient.get<BookingResponse[]>('/bookings', {
    params: { from, to },
  })
  return data
}

export async function createBooking(command: BookingCommand): Promise<BookingResponse> {
  const { data } = await apiClient.post<BookingResponse>('/bookings', command)
  return data
}

export async function getBooking(id: string): Promise<BookingResponse> {
  const { data } = await apiClient.get<BookingResponse>(`/bookings/${id}`)
  return data
}

export async function cancelBooking(id: string): Promise<BookingResponse> {
  const { data } = await apiClient.post<BookingResponse>(`/bookings/${id}/cancel`)
  return data
}

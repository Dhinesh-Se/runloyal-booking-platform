import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listBookings,
  createBooking,
  getBooking,
  cancelBooking,
} from '@/api/bookings'
import type { BookingCommand } from '@/api/types'

export const BOOKINGS_QUERY_KEY = (from?: string, to?: string) =>
  from && to ? (['bookings', { from, to }] as const) : (['bookings'] as const)

export const BOOKING_DETAIL_KEY = (id: string) => ['booking', id] as const

export function useBookings(from: string, to: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: BOOKINGS_QUERY_KEY(from, to),
    queryFn: () => listBookings(from, to),
    enabled: options?.enabled !== undefined ? options.enabled && !!from && !!to : !!from && !!to,
    staleTime: 30_000,
  })
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: BOOKING_DETAIL_KEY(id),
    queryFn: () => getBooking(id),
    enabled: !!id,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (command: BookingCommand) => createBooking(command),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelBooking(id),
    onSuccess: (booking) => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: BOOKING_DETAIL_KEY(booking.id) })
    },
  })
}

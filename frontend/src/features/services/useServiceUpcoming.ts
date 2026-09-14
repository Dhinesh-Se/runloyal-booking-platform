import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listBookings } from '@/api/bookings'
import type { AvailableSlotResponse, BookingResponse, ServiceResponse, StaffResponse } from '@/api/types'
import { getAvailableSlots } from '@/features/calendar/availableSlots'
import { useStaff } from '@/features/staff/useStaff'

export function futureSevenDays(now = Date.now()) {
  return { from: new Date(now).toISOString(), to: new Date(now + 7 * 24 * 60 * 60_000).toISOString() }
}

export function formatServiceUTC(instant: string) {
  return `${new Date(instant).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function upcomingServiceBookings(bookings: BookingResponse[], serviceId: string, from: string, to: string) {
  // Include in-progress bookings overlapping the future window, never ended ones.
  return bookings.filter(booking => booking.serviceId === serviceId && booking.status === 'CONFIRMED'
    && Date.parse(booking.endAt) > Date.parse(from) && Date.parse(booking.startAt) < Date.parse(to)
    && Date.parse(booking.endAt) > Date.parse(booking.startAt))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
}

export function upcomingServiceSlots(slots: AvailableSlotResponse[], staff: StaffResponse[], from: string, to: string,
  selectedStaffId = '') {
  const activeIds = new Set(staff.filter(person => person.status === 'ACTIVE'
    && (!selectedStaffId || person.id === selectedStaffId)).map(person => person.id))
  return slots.flatMap(slot => {
    const start = Date.parse(slot.startAt)
    if (!Number.isFinite(start) || start < Date.parse(from) || start >= Date.parse(to)
      || !(Date.parse(slot.endAt) > start)) return []
    const availableStaff = slot.availableStaff.filter(person => person.status === 'ACTIVE' && activeIds.has(person.id))
    return availableStaff.length ? [{ ...slot, availableStaff }] : []
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
}

export function useServiceUpcoming(service: ServiceResponse, selectedStaffId: string) {
  const [range, setRange] = useState(() => futureSevenDays())
  // Advance the window on long-lived pages, including across UTC midnight/DST.
  useEffect(() => {
    const timer = setInterval(() => setRange(futureSevenDays()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const staffQuery = useStaff()
  const activeStaff = (staffQuery.data ?? []).filter(staff => staff.status === 'ACTIVE')
  const bookingsQuery = useQuery({
    queryKey: ['calendar', 'service-upcoming', 'bookings', service.id, range.from, range.to],
    queryFn: () => listBookings(range.from, range.to),
    staleTime: 15_000,
  })
  // The API requires the full slot to fit. Pad to include starts just before the
  // exclusive seven-day boundary, then filter starts back to the visible range.
  // Keep requests within the backend's 31-day cap. Durations beyond the spare
  // 24 days cannot fit its same-local-day windows, so they need no padding.
  const paddingMinutes = Number.isSafeInteger(service.durationMinutes) && service.durationMinutes > 0
    && service.durationMinutes <= (31 - 7) * 24 * 60 ? service.durationMinutes : 0
  const slotsTo = new Date(Date.parse(range.to) + paddingMinutes * 60_000).toISOString()
  const slotsQuery = useQuery({
    queryKey: ['calendar', 'service-upcoming', 'available-slots', service.id, range.from, range.to, slotsTo],
    queryFn: () => getAvailableSlots(service.id, range.from, slotsTo),
    enabled: service.status === 'ACTIVE' && staffQuery.isSuccess && activeStaff.length > 0,
    staleTime: 15_000,
  })
  const availabilityError = staffQuery.isError ? staffQuery.error : slotsQuery.isError ? slotsQuery.error : null
  const availabilityLoading = staffQuery.isLoading || slotsQuery.isLoading
  const availabilityRefreshing = staffQuery.isFetching || slotsQuery.isFetching
  const availabilityBlocked = service.status !== 'ACTIVE' || !!availabilityError
    || availabilityLoading || availabilityRefreshing
  const currentFrom = new Date(Math.max(Date.parse(range.from), Date.now())).toISOString()

  return {
    range, staffQuery, activeStaff, bookingsQuery,
    availabilityError, availabilityLoading, availabilityRefreshing, availabilityBlocked,
    slots: availabilityBlocked ? [] : upcomingServiceSlots(slotsQuery.data ?? [], staffQuery.data ?? [], currentFrom, range.to, selectedStaffId),
    bookings: bookingsQuery.isError || bookingsQuery.isLoading ? []
      : upcomingServiceBookings(bookingsQuery.data ?? [], service.id, currentFrom, range.to),
    retryAvailability: () => Promise.all([staffQuery.refetch(), ...(service.status === 'ACTIVE' ? [slotsQuery.refetch()] : [])]),
  }
}
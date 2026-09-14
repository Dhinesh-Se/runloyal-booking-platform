import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { listBookings } from '@/api/bookings'
import { listAvailability } from '@/api/availability'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import { useMe } from '@/hooks/useMe'
import { isValidScheduleTimeZone } from '@/utils/schedule'
import { getAvailableSlots } from './availableSlots'
import {
  getWeekStart,
  getWeekDays,
  addUTCDays,
} from '@/utils/dates'
import type { AvailableSlotResponse, AvailabilityResponse } from '@/api/types'

export interface CalendarSlot {
  timeLabel: string // "09:00"
  minutes: number   // 540
}

export interface CalendarAvailableSlot extends AvailableSlotResponse {
  serviceId: string
}

export function useCalendarData(
  currentDate: Date,
  selectedServiceId?: string,
  selectedStaffId?: string
) {
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  // Half-open UTC week: Monday midnight through exclusive next Monday.
  const fromInstant = weekStart.toISOString()
  const toInstantStr = addUTCDays(weekStart, 7).toISOString()

  const serviceQuery = useServices()
  const staffQuery = useStaff()
  const meQuery = useMe()
  const services = serviceQuery.data
  const staffList = staffQuery.data
  const timezone = meQuery.data?.timezone
  const timezoneValid = isValidScheduleTimeZone(timezone)
  const isAdmin = meQuery.data?.role === 'TENANT_ADMIN' && meQuery.data.status === 'ACTIVE'

  // Fetch Bookings for this week range
  const bookingQuery = useQuery({
    queryKey: ['calendar', 'bookings', fromInstant, toInstantStr],
    queryFn: () => listBookings(fromInstant, toInstantStr),
    staleTime: 15_000,
  })

  // Assignment/qualification is decided by the slot endpoint, never local rules.
  const filteredStaff = useMemo(() => {
    if (!staffList) return []
    let list = staffList.filter((s) => s.status === 'ACTIVE')
    if (selectedStaffId) {
      list = list.filter((s) => s.id === selectedStaffId)
    }
    return list
  }, [staffList, selectedStaffId])

  const staffIds = useMemo(() => filteredStaff.map((s) => s.id), [filteredStaff])

  const availabilityQuery = useQuery({
    queryKey: ['calendar', 'availability', staffIds.join(',')],
    queryFn: async () => {
      const results: Record<string, AvailabilityResponse[]> = {}
      await Promise.all(
        staffIds.map(async (id) => {
          results[id] = await listAvailability(id)
        })
      )
      return results
    },
    enabled: staffIds.length > 0,
    staleTime: 60_000,
  })

  const activeServices = services?.filter(service => service.status === 'ACTIVE'
    && (!selectedServiceId || service.id === selectedServiceId)) ?? []
  const slotQueries = useQueries({
    queries: activeServices.map(service => {
      // The endpoint only returns slots whose full duration fits before `to`.
      // Pad the request so starts near UTC Sunday midnight are not clipped.
      const slotsTo = new Date(Date.parse(toInstantStr) + service.durationMinutes * 60_000).toISOString()
      return {
        queryKey: ['calendar', 'available-slots', service.id, fromInstant, toInstantStr, slotsTo],
        queryFn: () => getAvailableSlots(service.id, fromInstant, slotsTo),
        enabled: staffIds.length > 0,
        staleTime: 15_000,
      }
    }),
  })

  const queries = [serviceQuery, staffQuery, meQuery, bookingQuery,
    ...(staffIds.length ? [availabilityQuery, ...slotQueries] : [])]
  const timezoneError = meQuery.isSuccess && !timezoneValid
  const isError = queries.some(query => query.isError) || timezoneError
  const isLoading = queries.some(query => query.isLoading)
  const isRefreshing = queries.some(query => query.isFetching && !query.isLoading)
  // Fail closed even when React Query retains stale successful data after an error.
  const availableSlots: CalendarAvailableSlot[] = isError || isLoading || isRefreshing ? [] :
    slotQueries.flatMap((query, index) => (query.data ?? []).flatMap(slot => {
      const start = Date.parse(slot.startAt)
      if (start < Date.parse(fromInstant) || start >= Date.parse(toInstantStr)) return []
      const availableStaff = slot.availableStaff.filter(staff =>
        staff.status === 'ACTIVE' && staffIds.includes(staff.id))
      return availableStaff.length ? [{ ...slot, availableStaff, serviceId: activeServices[index].id }] : []
    }))

  // Full 24-hour UTC grid, in half-hour cells (00:00 through 23:30).
  const timeSlots: CalendarSlot[] = useMemo(() => {
    const slots: CalendarSlot[] = []
    for (let m = 0; m < 24 * 60; m += 30) {
      const h = Math.floor(m / 60).toString().padStart(2, '0')
      const min = (m % 60).toString().padStart(2, '0')
      slots.push({
        timeLabel: `${h}:${min}`,
        minutes: m,
      })
    }
    return slots
  }, [])

  // Keep other services' bookings visible: a service filter must not hide conflicts.
  const filteredBookings = useMemo(() => {
    if (!bookingQuery.data) return []
    return bookingQuery.data.filter((b) => {
      if (b.status === 'CANCELLED') return false
      if (selectedStaffId && b.staffId !== selectedStaffId) return false
      return true
    })
  }, [bookingQuery.data, selectedStaffId])

  return {
    weekStart,
    weekDays,
    timeSlots,
    services,
    staffList,
    filteredStaff,
    bookings: filteredBookings,
    staffAvailabilities: availabilityQuery.data ?? {},
    availableSlots,
    timezone,
    isAdmin,
    isLoading,
    isRefreshing,
    isError,
    errorMessage: timezoneError
      ? 'The account timezone is missing or invalid. Calendar availability cannot be displayed safely.'
      : 'Calendar data could not be loaded. Booking availability is disabled until all requests succeed.',
    refetchBookings: bookingQuery.refetch,
    retry: () => Promise.all(queries.map(query => query.refetch())),
  }
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listBookings } from '@/api/bookings'
import { listAvailability } from '@/api/availability'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import {
  getWeekStart,
  getWeekDays,
} from '@/utils/dates'
import type { BookingResponse, AvailabilityResponse, StaffResponse } from '@/api/types'

export interface CalendarSlot {
  timeLabel: string // "09:00"
  minutes: number   // 540
}

export interface SlotCellData {
  date: Date
  isoDateStr: string // "YYYY-MM-DD"
  timeStr: string    // "09:00"
  isoStartInstant: string // "2026-09-15T09:00:00.000Z"
  booking?: BookingResponse
  availabilityType?: 'WORKING' | 'BREAK' | 'OFF'
  staff?: StaffResponse
  isAvailable: boolean
  isBooked: boolean
  isBreak: boolean
  isOff: boolean
}

export function useCalendarData(
  currentDate: Date,
  selectedServiceId?: string,
  selectedStaffId?: string
) {
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  // Week range in ISO instants
  const fromInstant = useMemo(() => {
    const d = new Date(weekStart)
    d.setUTCHours(0, 0, 0, 0)
    return d.toISOString()
  }, [weekStart])

  const toInstantStr = useMemo(() => {
    const d = new Date(weekDays[6])
    d.setUTCHours(23, 59, 59, 999)
    return d.toISOString()
  }, [weekDays])

  // Fetch Services & Staff
  const { data: services, isLoading: servicesLoading } = useServices()
  const { data: staffList, isLoading: staffLoading } = useStaff()

  // Fetch Bookings for this week range
  const {
    data: bookings,
    isLoading: bookingsLoading,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ['calendar', 'bookings', fromInstant, toInstantStr],
    queryFn: () => listBookings(fromInstant, toInstantStr),
    staleTime: 15_000,
  })

  // Filter staff based on selected staff or service
  const filteredStaff = useMemo(() => {
    if (!staffList) return []
    let list = staffList.filter((s) => s.status === 'ACTIVE')
    if (selectedStaffId) {
      list = list.filter((s) => s.id === selectedStaffId)
    }
    return list
  }, [staffList, selectedStaffId])

  // Fetch availability for staff members
  // If a single staff is selected, fetch for that staff; otherwise fetch for filtered staff
  const staffIds = useMemo(() => filteredStaff.map((s) => s.id), [filteredStaff])

  const { data: staffAvailabilities, isLoading: availabilityLoading } = useQuery({
    queryKey: ['calendar', 'availability', staffIds.join(',')],
    queryFn: async () => {
      const results: Record<string, AvailabilityResponse[]> = {}
      await Promise.all(
        staffIds.map(async (id) => {
          try {
            results[id] = await listAvailability(id)
          } catch {
            results[id] = []
          }
        })
      )
      return results
    },
    enabled: staffIds.length > 0,
    staleTime: 60_000,
  })

  // Generate 30-minute intervals from 08:00 to 19:00
  const timeSlots: CalendarSlot[] = useMemo(() => {
    const slots: CalendarSlot[] = []
    for (let m = 8 * 60; m <= 19 * 60; m += 30) {
      const h = Math.floor(m / 60).toString().padStart(2, '0')
      const min = (m % 60).toString().padStart(2, '0')
      slots.push({
        timeLabel: `${h}:${min}`,
        minutes: m,
      })
    }
    return slots
  }, [])

  // Filter bookings according to selected staff and service
  const filteredBookings = useMemo(() => {
    if (!bookings) return []
    return bookings.filter((b) => {
      if (b.status === 'CANCELLED') return false
      if (selectedStaffId && b.staffId !== selectedStaffId) return false
      if (selectedServiceId && b.serviceId !== selectedServiceId) return false
      return true
    })
  }, [bookings, selectedStaffId, selectedServiceId])

  return {
    weekStart,
    weekDays,
    timeSlots,
    services,
    staffList,
    filteredStaff,
    bookings: filteredBookings,
    staffAvailabilities: staffAvailabilities || {},
    isLoading: servicesLoading || staffLoading || bookingsLoading || availabilityLoading,
    refetchBookings,
  }
}

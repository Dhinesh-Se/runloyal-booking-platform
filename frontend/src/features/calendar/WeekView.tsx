import { useMemo } from 'react'
import { CalendarBlock } from './CalendarBlock'
import {
  dateToDayOfWeek,
  parseLocalTimeToMinutes,
  formatCalendarDay,
} from '@/utils/dates'
import type { BookingResponse, AvailabilityResponse, StaffResponse, ServiceResponse } from '@/api/types'
import type { CalendarSlot } from './useCalendar'

interface WeekViewProps {
  weekDays: Date[]
  timeSlots: CalendarSlot[]
  bookings: BookingResponse[]
  staffAvailabilities: Record<string, AvailabilityResponse[]>
  staffList?: StaffResponse[]
  services?: ServiceResponse[]
  selectedStaffId?: string
  selectedServiceId?: string
  onSelectSlot: (startAtInstant: string, staffId?: string) => void
  onSelectBooking: (bookingId: string) => void
}

export function WeekView({
  weekDays,
  timeSlots,
  bookings,
  staffAvailabilities,
  staffList,
  services,
  selectedStaffId,
  onSelectSlot,
  onSelectBooking,
}: WeekViewProps) {
  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), [])

  const serviceMap = useMemo(() => {
    const m = new Map<string, string>()
    services?.forEach((s) => m.set(s.id, s.name))
    return m
  }, [services])

  const staffMap = useMemo(() => {
    const m = new Map<string, string>()
    staffList?.forEach((s) => m.set(s.id, s.name))
    return m
  }, [staffList])

  return (
    <div className="calendar-week-container" style={{ overflowX: 'auto' }}>
      <div
        className="calendar-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '70px repeat(7, minmax(130px, 1fr))',
          minWidth: 980,
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Header row: top-left corner */}
        <div
          style={{
            padding: 'var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
            borderRight: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
          }}
        >
          Time
        </div>

        {/* Header row: 7 day columns */}
        {weekDays.map((day) => {
          const isoDate = day.toISOString().substring(0, 10)
          const isToday = isoDate === todayStr
          const { dayName, dayNum, monthShort } = formatCalendarDay(day)

          return (
            <div
              key={isoDate}
              style={{
                padding: 'var(--space-3) var(--space-2)',
                textAlign: 'center',
                borderBottom: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                background: isToday ? 'var(--color-primary-light)' : 'transparent',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                  color: isToday ? 'var(--color-primary)' : 'var(--text-secondary)',
                }}
              >
                {dayName}
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-md)',
                  fontWeight: 700,
                  color: isToday ? 'var(--color-primary)' : 'var(--text-primary)',
                  marginTop: 2,
                }}
              >
                {dayNum} <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400 }}>{monthShort}</span>
              </div>
            </div>
          )
        })}

        {/* Time slot rows */}
        {timeSlots.map((slot) => {
          return (
            <div key={slot.timeLabel} style={{ display: 'contents' }}>
              {/* Time column */}
              <div
                style={{
                  padding: 'var(--space-2) var(--space-1)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'monospace',
                }}
              >
                {slot.timeLabel}
              </div>

              {/* Day cells for this time slot */}
              {weekDays.map((day) => {
                const dateStr = day.toISOString().substring(0, 10)
                const dayOfWeek = dateToDayOfWeek(day)
                const cellStartInstant = `${dateStr}T${slot.timeLabel}:00Z`
                const slotMinutes = slot.minutes

                // Check for confirmed booking covering this time
                const booking = bookings.find((b) => {
                  if (b.status === 'CANCELLED') return false
                  const bDate = b.startAt.substring(0, 10)
                  if (bDate !== dateStr) return false
                  const bStartM = parseLocalTimeToMinutes(b.startAt.substring(11, 16))
                  const bEndM = parseLocalTimeToMinutes(b.endAt.substring(11, 16))
                  return slotMinutes >= bStartM && slotMinutes < bEndM
                })

                if (booking) {
                  const staffName = staffMap.get(booking.staffId) || 'Staff'
                  const svcName = serviceMap.get(booking.serviceId) || 'Service'
                  const title = `${booking.customerName}${booking.petName ? ` (${booking.petName})` : ''}`

                  return (
                    <div
                      key={dateStr}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock
                        type="BOOKED"
                        title={title}
                        subtitle={`${svcName} • ${staffName}`}
                        timeLabel={slot.timeLabel}
                        booking={booking}
                        onClick={() => onSelectBooking(booking.id)}
                      />
                    </div>
                  )
                }

                // Check staff availability rules for this day & time
                // Check all relevant staff (or selected staff)
                const relevantStaffIds = selectedStaffId
                  ? [selectedStaffId]
                  : staffList?.map((s) => s.id) || []

                let isOff = false
                let isBreak = false
                let isWorking = false
                const workingStaff: string[] = []

                for (const sId of relevantStaffIds) {
                  const windows = staffAvailabilities[sId] || []
                  const dayWindows = windows.filter((w) => w.dayOfWeek === dayOfWeek)

                  const offRule = dayWindows.find((w) => w.type === 'OFF')
                  if (offRule && selectedStaffId) {
                    isOff = true
                    break
                  }

                  const breakRule = dayWindows.find((w) => {
                    if (w.type !== 'BREAK') return false
                    const s = parseLocalTimeToMinutes(w.startTime.substring(0, 5))
                    const e = parseLocalTimeToMinutes(w.endTime.substring(0, 5))
                    return slotMinutes >= s && slotMinutes < e
                  })
                  if (breakRule && selectedStaffId) {
                    isBreak = true
                    break
                  }

                  const workRule = dayWindows.find((w) => {
                    if (w.type !== 'WORKING') return false
                    const s = parseLocalTimeToMinutes(w.startTime.substring(0, 5))
                    const e = parseLocalTimeToMinutes(w.endTime.substring(0, 5))
                    return slotMinutes >= s && slotMinutes < e
                  })
                  if (workRule) {
                    isWorking = true
                    workingStaff.push(staffMap.get(sId) || 'Staff')
                  }
                }

                if (isOff) {
                  return (
                    <div
                      key={dateStr}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock type="OFF" title="Off" />
                    </div>
                  )
                }

                if (isBreak) {
                  return (
                    <div
                      key={dateStr}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock type="BREAK" title="Break" />
                    </div>
                  )
                }

                if (isWorking) {
                  const staffSubtitle =
                    workingStaff.length === 1 ? workingStaff[0] : `${workingStaff.length} staff available`

                  return (
                    <div
                      key={dateStr}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock
                        type="AVAILABLE"
                        title="Available"
                        subtitle={staffSubtitle}
                        onClick={() => onSelectSlot(cellStartInstant, selectedStaffId)}
                      />
                    </div>
                  )
                }

                // Empty / unscheduled cell
                return (
                  <div
                    key={dateStr}
                    style={{
                      padding: 3,
                      borderBottom: '1px solid var(--border-subtle)',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <CalendarBlock
                      type="EMPTY"
                      onClick={() => onSelectSlot(cellStartInstant, selectedStaffId)}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

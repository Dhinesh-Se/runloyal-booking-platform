import { useMemo } from 'react'
import { CalendarBlock } from './CalendarBlock'
import {
  dateToDayOfWeek,
  parseLocalTimeToMinutes,
} from '@/utils/dates'
import type { BookingResponse, AvailabilityResponse, StaffResponse, ServiceResponse } from '@/api/types'
import type { CalendarSlot } from './useCalendar'

interface DayViewProps {
  currentDate: Date
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

export function DayView({
  currentDate,
  timeSlots,
  bookings,
  staffAvailabilities,
  staffList,
  services,
  selectedStaffId,
  onSelectSlot,
  onSelectBooking,
}: DayViewProps) {
  const dateStr = useMemo(() => currentDate.toISOString().substring(0, 10), [currentDate])
  const dayOfWeek = useMemo(() => dateToDayOfWeek(currentDate), [currentDate])

  const serviceMap = useMemo(() => {
    const m = new Map<string, string>()
    services?.forEach((s) => m.set(s.id, s.name))
    return m
  }, [services])

  // Filter staff to display: if a staff member is selected, show just that one; otherwise show all active
  const displayStaff = useMemo(() => {
    if (!staffList) return []
    let list = staffList.filter((s) => s.status === 'ACTIVE')
    if (selectedStaffId) {
      list = list.filter((s) => s.id === selectedStaffId)
    }
    return list
  }, [staffList, selectedStaffId])

  if (displayStaff.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <p className="text-muted">No active staff members available to display for this day.</p>
      </div>
    )
  }

  return (
    <div className="calendar-day-container" style={{ overflowX: 'auto' }}>
      <div
        className="calendar-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `70px repeat(${displayStaff.length}, minmax(160px, 1fr))`,
          minWidth: Math.max(600, 70 + displayStaff.length * 160),
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Top-left corner */}
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

        {/* Staff column headers */}
        {displayStaff.map((staff) => (
          <div
            key={staff.id}
            style={{
              padding: 'var(--space-3)',
              textAlign: 'center',
              borderBottom: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>
              {staff.name}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              Staff Member
            </div>
          </div>
        ))}

        {/* Rows by time slot */}
        {timeSlots.map((slot) => {
          const slotMinutes = slot.minutes
          const cellStartInstant = `${dateStr}T${slot.timeLabel}:00Z`

          return (
            <div key={slot.timeLabel} style={{ display: 'contents' }}>
              {/* Time header */}
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

              {/* One cell per staff member */}
              {displayStaff.map((staff) => {
                // Check if this staff member has a booking in this slot
                const booking = bookings.find((b) => {
                  if (b.status === 'CANCELLED') return false
                  if (b.staffId !== staff.id) return false
                  const bDate = b.startAt.substring(0, 10)
                  if (bDate !== dateStr) return false
                  const bStartM = parseLocalTimeToMinutes(b.startAt.substring(11, 16))
                  const bEndM = parseLocalTimeToMinutes(b.endAt.substring(11, 16))
                  return slotMinutes >= bStartM && slotMinutes < bEndM
                })

                if (booking) {
                  const svcName = serviceMap.get(booking.serviceId) || 'Service'
                  const title = `${booking.customerName}${booking.petName ? ` (${booking.petName})` : ''}`

                  return (
                    <div
                      key={staff.id}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock
                        type="BOOKED"
                        title={title}
                        subtitle={svcName}
                        timeLabel={slot.timeLabel}
                        booking={booking}
                        onClick={() => onSelectBooking(booking.id)}
                      />
                    </div>
                  )
                }

                // Check availability windows for this staff member
                const windows = staffAvailabilities[staff.id] || []
                const dayWindows = windows.filter((w) => w.dayOfWeek === dayOfWeek)

                const isOff = dayWindows.some((w) => w.type === 'OFF')
                if (isOff) {
                  return (
                    <div
                      key={staff.id}
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

                const isBreak = dayWindows.some((w) => {
                  if (w.type !== 'BREAK') return false
                  const s = parseLocalTimeToMinutes(w.startTime.substring(0, 5))
                  const e = parseLocalTimeToMinutes(w.endTime.substring(0, 5))
                  return slotMinutes >= s && slotMinutes < e
                })

                if (isBreak) {
                  return (
                    <div
                      key={staff.id}
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

                const isWorking = dayWindows.some((w) => {
                  if (w.type !== 'WORKING') return false
                  const s = parseLocalTimeToMinutes(w.startTime.substring(0, 5))
                  const e = parseLocalTimeToMinutes(w.endTime.substring(0, 5))
                  return slotMinutes >= s && slotMinutes < e
                })

                if (isWorking) {
                  return (
                    <div
                      key={staff.id}
                      style={{
                        padding: 3,
                        borderBottom: '1px solid var(--border-subtle)',
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CalendarBlock
                        type="AVAILABLE"
                        title="Available"
                        onClick={() => onSelectSlot(cellStartInstant, staff.id)}
                      />
                    </div>
                  )
                }

                return (
                  <div
                    key={staff.id}
                    style={{
                      padding: 3,
                      borderBottom: '1px solid var(--border-subtle)',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <CalendarBlock
                      type="EMPTY"
                      onClick={() => onSelectSlot(cellStartInstant, staff.id)}
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

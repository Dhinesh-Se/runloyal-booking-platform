import { useMemo } from 'react'
import { CalendarCell, type CalendarCellProps } from './CalendarCell'
import {
  dateAndTimeToInstant,
  deriveEndInstant,
} from '@/utils/dates'
import type { CalendarSlot } from './useCalendar'

interface DayViewProps extends Omit<CalendarCellProps, 'startAt' | 'endAt'> {
  currentDate: Date
  timeSlots: CalendarSlot[]
}

export function DayView({
  currentDate,
  timeSlots,
  bookings,
  staffList,
  selectedStaffId,
  ...cellProps
}: DayViewProps) {
  // Preserve confirmed bookings even if their staff member was made inactive.
  const displayStaff = useMemo(() => {
    if (!staffList) return []
    let list = staffList.filter((s) => s.status === 'ACTIVE'
      || bookings.some(booking => booking.status === 'CONFIRMED' && booking.staffId === s.id))
    if (selectedStaffId) {
      list = list.filter((s) => s.id === selectedStaffId)
    }
    return list
  }, [staffList, selectedStaffId, bookings])

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
          Time (UTC)
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
          const cellStartInstant = dateAndTimeToInstant(currentDate, slot.timeLabel)
          const cellEndInstant = deriveEndInstant(cellStartInstant, 30)

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
              {displayStaff.map((staff) => (
                <CalendarCell key={staff.id} {...cellProps} bookings={bookings} staffList={staffList}
                  startAt={cellStartInstant} endAt={cellEndInstant} selectedStaffId={staff.id} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

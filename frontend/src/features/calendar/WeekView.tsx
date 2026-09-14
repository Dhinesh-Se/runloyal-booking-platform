import { CalendarCell, type CalendarCellProps } from './CalendarCell'
import {
  formatCalendarDay,
  dateAndTimeToInstant,
  deriveEndInstant,
} from '@/utils/dates'
import type { CalendarSlot } from './useCalendar'

interface WeekViewProps extends Omit<CalendarCellProps, 'startAt' | 'endAt'> {
  weekDays: Date[]
  timeSlots: CalendarSlot[]
}

export function WeekView({
  weekDays,
  timeSlots,
  ...cellProps
}: WeekViewProps) {
  const todayStr = new Date().toISOString().substring(0, 10)

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
          Time (UTC)
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
                const cellStartInstant = dateAndTimeToInstant(day, slot.timeLabel)
                const cellEndInstant = deriveEndInstant(cellStartInstant, 30)
                return (
                  <CalendarCell key={dateStr} {...cellProps}
                    startAt={cellStartInstant} endAt={cellEndInstant} />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

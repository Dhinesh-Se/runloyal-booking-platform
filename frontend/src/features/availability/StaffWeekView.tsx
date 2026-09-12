import { Plus, Edit2, Trash2 } from 'lucide-react'
import type { AvailabilityResponse, DayOfWeek } from '@/api/types'
import { AvailabilityTypeBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

const DAYS: { day: DayOfWeek; label: string; short: string }[] = [
  { day: 'MONDAY', label: 'Monday', short: 'Mon' },
  { day: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { day: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { day: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { day: 'FRIDAY', label: 'Friday', short: 'Fri' },
  { day: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { day: 'SUNDAY', label: 'Sunday', short: 'Sun' },
]

interface StaffWeekViewProps {
  availability: AvailabilityResponse[]
  onAddWindow: (day: DayOfWeek) => void
  onEditWindow: (window: AvailabilityResponse) => void
  onDeleteWindow: (window: AvailabilityResponse) => void
}

export function StaffWeekView({
  availability,
  onAddWindow,
  onEditWindow,
  onDeleteWindow,
}: StaffWeekViewProps) {
  // Group windows by day
  const windowsByDay = DAYS.reduce<Record<DayOfWeek, AvailabilityResponse[]>>(
    (acc, { day }) => {
      acc[day] = availability
        .filter((w) => w.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
      return acc
    },
    {} as Record<DayOfWeek, AvailabilityResponse[]>
  )

  return (
    <div className="week-view-grid" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {DAYS.map(({ day, label }) => {
        const windows = windowsByDay[day] || []
        const hasWindows = windows.length > 0

        return (
          <div
            key={day}
            className="card"
            style={{
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            {/* Day Header */}
            <div style={{ minWidth: 110 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--font-size-base)' }}>
                {label}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                {hasWindows ? `${windows.length} rule${windows.length > 1 ? 's' : ''}` : 'No schedule'}
              </div>
            </div>

            {/* Window Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', flex: 1 }}>
              {windows.map((w) => {
                const timeStr =
                  w.type === 'OFF'
                    ? 'All Day'
                    : `${w.startTime.substring(0, 5)} - ${w.endTime.substring(0, 5)}`

                return (
                  <div
                    key={w.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-1) var(--space-3)',
                    }}
                  >
                    <AvailabilityTypeBadge type={w.type} />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {timeStr}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'var(--space-1)' }}>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ padding: 4, color: 'var(--text-muted)' }}
                        title="Edit schedule"
                        onClick={() => onEditWindow(w)}
                        aria-label={`Edit ${label} schedule`}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ padding: 4, color: 'var(--color-danger)' }}
                        title="Delete schedule"
                        onClick={() => onDeleteWindow(w)}
                        aria-label={`Delete ${label} schedule`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {!hasWindows && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No availability configured
                </span>
              )}
            </div>

            {/* Quick Add Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => onAddWindow(day)}
              aria-label={`Add schedule for ${label}`}
            >
              Add
            </Button>
          </div>
        )
      })}
    </div>
  )
}

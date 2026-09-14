import type { BookingResponse } from '@/api/types'

export type BlockType = 'AVAILABLE' | 'BOOKED' | 'BREAK' | 'OFF' | 'EMPTY'

interface CalendarBlockProps {
  type: BlockType
  title?: string
  subtitle?: string
  timeLabel?: string
  booking?: BookingResponse
  onClick?: () => void
}

export function CalendarBlock({
  type,
  title,
  subtitle,
  onClick,
}: CalendarBlockProps) {
  const getStyles = () => {
    switch (type) {
      case 'BOOKED':
        return {
          background: 'var(--cal-booked-bg)',
          border: '1px solid var(--cal-booked-border)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }
      case 'AVAILABLE':
        return {
          background: 'var(--cal-available-bg)',
          border: '1px solid var(--cal-available-border)',
          color: 'var(--color-success)',
          cursor: 'pointer',
        }
      case 'BREAK':
        return {
          background: 'var(--cal-break-bg)',
          border: '1px solid var(--cal-break-border)',
          color: 'var(--color-warning)',
          cursor: 'default',
        }
      case 'OFF':
        return {
          background: 'var(--cal-off-bg)',
          border: '1px solid var(--cal-off-border)',
          color: 'var(--text-muted)',
          cursor: 'default',
        }
      default: // EMPTY
        return {
          background: 'transparent',
          border: '1px dashed transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }
    }
  }

  const styles = getStyles()

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        ...styles,
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 'var(--radius-sm)',
        padding: '3px 6px',
        fontSize: 'var(--font-size-xs)',
        width: '100%',
        minHeight: '28px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'all var(--transition-fast)',
        userSelect: 'none',
      }}
      className="calendar-block"
      title={title ? `${title}${subtitle ? ` - ${subtitle}` : ''}` : undefined}
    >
      {type !== 'EMPTY' && (
        <>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: '0.65rem',
                opacity: 0.85,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </div>
          )}
        </>
      )}
    </div>
  )
}

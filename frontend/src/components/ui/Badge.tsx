import type { Status, BookingStatus } from '@/api/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'primary'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  size?: 'sm' | 'md'
}

export function Badge({ variant = 'default', size = 'md', children }: BadgeProps) {
  return (
    <span className={`badge badge--${variant} badge--${size}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'default'}>
      {status === 'ACTIVE' ? '● Active' : '○ Inactive'}
    </Badge>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant={status === 'CONFIRMED' ? 'primary' : 'default'}>
      {status === 'CONFIRMED' ? '✓ Confirmed' : '✗ Cancelled'}
    </Badge>
  )
}

export function AvailabilityTypeBadge({ type }: { type: 'WORKING' | 'BREAK' | 'OFF' }) {
  const config = {
    WORKING: { variant: 'success' as BadgeVariant, label: 'Working' },
    BREAK: { variant: 'warning' as BadgeVariant, label: 'Break' },
    OFF: { variant: 'default' as BadgeVariant, label: 'Off' },
  }
  const { variant, label } = config[type]
  return <Badge variant={variant}>{label}</Badge>
}

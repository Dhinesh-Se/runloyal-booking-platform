import { CalendarDays, ClipboardList, Scissors, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBookings } from '@/features/bookings/useBookings'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import { useMe } from '@/hooks/useMe'
import { addUTCDays, formatInstant, instantIntervalsOverlap, startOfUTCDay } from '@/utils/dates'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'

export function DashboardPage() {
  const today = startOfUTCDay(new Date())
  const from = today.toISOString()
  const to = addUTCDays(today, 1).toISOString()
  const bookings = useBookings(from, to)
  const services = useServices()
  const staff = useStaff()
  const identity = useMe()
  const queries = [bookings, services, staff, identity]
  const failedQuery = queries.find(query => query.isError)

  if (failedQuery) return (
    <div className="page"><ErrorState title="Dashboard unavailable" message={extractErrorMessage(failedQuery.error)}
      onRetry={() => void Promise.all(queries.map(query => query.refetch()))} /></div>
  )
  if (queries.some(query => query.isPending) || !bookings.data || !services.data || !staff.data || !identity.data) {
    return <div className="page"><SkeletonCard lines={8} /></div>
  }

  const canManage = identity.isSuccess && !identity.isError && !identity.isFetching
    && identity.data.role === 'TENANT_ADMIN' && identity.data.status === 'ACTIVE'
  const confirmed = bookings.data.filter(booking => booking.status === 'CONFIRMED'
    && instantIntervalsOverlap(booking.startAt, booking.endAt, from, to))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id))
  const stats = [
    { label: "Today's bookings (UTC)", value: confirmed.length, icon: ClipboardList, tone: 'primary' },
    { label: 'Active staff', value: staff.data.filter(member => member.status === 'ACTIVE').length, icon: Users, tone: 'success' },
    { label: 'Active services', value: services.data.filter(service => service.status === 'ACTIVE').length, icon: Scissors, tone: 'warning' },
    { label: 'Team members', value: staff.data.length, icon: CalendarDays, tone: 'neutral' },
  ]

  return (
    <div className="page">
      <div className="page-header dashboard-header">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1 className="page-title">Today at a glance (UTC)</h1>
          <p className="page-subtitle">{formatInstant(from, 'MMM d, yyyy')} · All dashboard dates and times are UTC.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn btn--primary" to="/calendar">{canManage ? 'Create booking' : 'View calendar'}</Link>
          <Link className="btn btn--secondary" to="/services">{canManage ? 'Manage services' : 'View services'}</Link>
        </div>
      </div>
      {queries.some(query => query.isFetching) && <p role="status">Refreshing dashboard…</p>}
      <section className="dashboard-stats" aria-label="Business summary">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className={`dashboard-stat dashboard-stat--${tone}`} key={label}><span className="dashboard-stat__icon"><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong></div></article>)}
      </section>
      <section className="card dashboard-schedule" aria-labelledby="today-schedule">
        <div className="section-heading">
          <div><h2 id="today-schedule">Today's schedule (UTC)</h2><p>Confirmed appointments overlapping today, 00:00–24:00 UTC, ordered by start time.</p></div>
          <Link to="/bookings">View all bookings</Link>
        </div>
        {confirmed.length === 0 ? (
          <EmptyState icon={<CalendarDays size={34} />} title="No bookings scheduled"
            description={canManage ? 'No confirmed bookings overlap today (UTC). Create a booking from the calendar when you are ready.' : 'No confirmed bookings overlap today (UTC).'}
            action={{ label: canManage ? 'Open calendar' : 'View calendar', href: '/calendar' }} />
        ) : (
          <div className="dashboard-appointments">
            {confirmed.map(booking => (
              <Link className="dashboard-appointment" to="/bookings" key={booking.id}>
                <time dateTime={booking.startAt}>{formatInstant(booking.startAt)}</time>
                <div><strong>{booking.customerName}</strong><span>{booking.petName || 'No pet name provided'}</span></div>
                <span className="status-badge status-badge--active">Confirmed</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

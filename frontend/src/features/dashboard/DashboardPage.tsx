import { CalendarDays, ClipboardList, Scissors, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { addDays, startOfDay } from 'date-fns'
import { useBookings } from '@/features/bookings/useBookings'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import { formatInstant } from '@/utils/dates'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { extractErrorMessage } from '@/utils/errors'

export function DashboardPage() {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const bookings = useBookings(today.toISOString(), tomorrow.toISOString())
  const services = useServices()
  const staff = useStaff()
  const isLoading = bookings.isLoading || services.isLoading || staff.isLoading
  const error = bookings.error ?? services.error ?? staff.error
  const confirmed = bookings.data?.filter((booking) => booking.status === 'CONFIRMED') ?? []
  const stats = [
    { label: "Today's bookings", value: confirmed.length, icon: ClipboardList, tone: 'primary' },
    { label: 'Available staff', value: staff.data?.filter((member) => member.status === 'ACTIVE').length ?? 0, icon: Users, tone: 'success' },
    { label: 'Active services', value: services.data?.filter((service) => service.status === 'ACTIVE').length ?? 0, icon: Scissors, tone: 'warning' },
    { label: 'Team members', value: staff.data?.length ?? 0, icon: CalendarDays, tone: 'neutral' },
  ]

  if (isLoading) return <div className="page"><SkeletonCard lines={8} /></div>
  if (error) return <div className="page"><ErrorState message={extractErrorMessage(error)} onRetry={() => void Promise.all([bookings.refetch(), services.refetch(), staff.refetch()])} /></div>

  return (
    <div className="page">
      <div className="page-header dashboard-header">
        <div><p className="eyebrow">Operations overview</p><h1 className="page-title">Today at a glance</h1><p className="page-subtitle">Keep appointments and your team moving smoothly.</p></div>
        <div className="dashboard-actions"><Link className="btn btn--primary" to="/calendar">Create booking</Link><Link className="btn btn--secondary" to="/services">Manage services</Link></div>
      </div>
      <section className="dashboard-stats" aria-label="Business summary">
        {stats.map(({ label, value, icon: Icon, tone }) => <article className={`dashboard-stat dashboard-stat--${tone}`} key={label}><span className="dashboard-stat__icon"><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong></div></article>)}
      </section>
      <section className="card dashboard-schedule" aria-labelledby="today-schedule"><div className="section-heading"><div><h2 id="today-schedule">Today's schedule</h2><p>Confirmed appointments scheduled for today.</p></div><Link to="/bookings">View all bookings</Link></div>
        {confirmed.length === 0 ? <EmptyState icon={<CalendarDays size={34} />} title="No bookings scheduled" description="Your day is clear. Create a booking from the calendar when you are ready." action={{ label: 'Open calendar', href: '/calendar' }} /> : <div className="dashboard-appointments">{confirmed.map((booking) => <Link className="dashboard-appointment" to="/bookings" key={booking.id}><time>{formatInstant(booking.startAt, 'HH:mm')}</time><div><strong>{booking.customerName}</strong><span>{booking.petName || 'No pet name provided'}</span></div><span className="status-badge status-badge--active">Confirmed</span></Link>)}</div>}
      </section>
    </div>
  )
}

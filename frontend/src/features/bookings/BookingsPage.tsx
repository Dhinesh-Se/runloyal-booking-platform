import { useState, useMemo } from 'react'
import { Plus, Search, Calendar, Filter, Eye } from 'lucide-react'
import { useBookings } from './useBookings'
import { useCanManageBookings } from './useBookingPermissions'
import { bookingStartInstant } from './bookingForm'
import { useServices } from '@/features/services/useServices'
import { useStaff } from '@/features/staff/useStaff'
import { BookingModal } from './BookingModal'
import { BookingDetail } from './BookingDetail'
import { Button } from '@/components/ui/Button'
import { BookingStatusBadge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { formatInstantDate, formatInstantTime } from '@/utils/dates'
import { extractErrorMessage } from '@/utils/errors'
import type { BookingStatus } from '@/api/types'

export function BookingsPage() {
  const canManageBookings = useCanManageBookings()
  // Today through today + 30 days, inclusive (the API permits at most 31 days).
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().substring(0, 10))
  const [toDate, setToDate] = useState(() => {
    const d = new Date(`${fromDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 30)
    return d.toISOString().substring(0, 10)
  })

  const fromInstant = bookingStartInstant(fromDate, '00:00')
  const lastDayStart = bookingStartInstant(toDate, '00:00')
  // The selected final date is inclusive; API intervals are half-open.
  const toInstant = lastDayStart ? new Date(Date.parse(lastDayStart) + 86_400_000).toISOString() : null
  const validRange = !!fromInstant && !!toInstant && fromDate <= toDate &&
    Date.parse(toInstant) - Date.parse(fromInstant) <= 31 * 86_400_000

  const { data: bookings, isLoading, isError, error } = useBookings(fromInstant ?? '', toInstant ?? '', { enabled: validRange })
  const { data: services } = useServices()
  const { data: staffList } = useStaff()

  // Filters & State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL')
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false)

  // Service and staff lookup maps
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

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    if (!bookings) return []
    return bookings
      .filter((b) => {
        if (statusFilter !== 'ALL' && b.status !== statusFilter) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const cust = b.customerName.toLowerCase()
          const pet = (b.petName || '').toLowerCase()
          const svc = (serviceMap.get(b.serviceId) || '').toLowerCase()
          const stf = (staffMap.get(b.staffId) || '').toLowerCase()
          return cust.includes(q) || pet.includes(q) || svc.includes(q) || stf.includes(q)
        }
        return true
      })
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
  }, [bookings, statusFilter, searchQuery, serviceMap, staffMap])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">View, search, and manage all customer appointments</p>
        </div>
        {canManageBookings && (
          <Button
            id="new-booking-btn"
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsNewBookingOpen(true)}
          >
            New Booking
          </Button>
        )}
      </div>

      {/* Filter and search bar */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          padding: 'var(--space-4)',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="form__input"
            placeholder="Search customer, pet, staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <select
            className="form__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BookingStatus)}
            style={{ width: 'auto' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Date Filter Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>From:</span>
          <input
            type="date"
            aria-label="Bookings from date (UTC)"
            aria-describedby="booking-range-hint"
            className="form__input"
            style={{ width: 'auto' }}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>To:</span>
          <input
            type="date"
            aria-label="Bookings to date (UTC)"
            aria-describedby="booking-range-hint"
            className="form__input"
            style={{ width: 'auto' }}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <span id="booking-range-hint" className="form__hint">Maximum 31 days, including both dates.</span>
      </div>

      {/* Bookings List / Table */}
      {!validRange ? (
        <p role="alert" className="form__error">Enter valid dates with the end date on or after the start date and a maximum of 31 days, including both dates.</p>
      ) : isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : isError ? (
        <ErrorState message={extractErrorMessage(error)} />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          icon={<Calendar size={36} />}
          title="No bookings found"
          message={
            searchQuery || statusFilter !== 'ALL'
              ? 'No bookings match your filter criteria.'
              : 'There are no bookings recorded in this date range.'
          }
          action={canManageBookings ? {
            label: 'Create First Booking',
            onClick: () => setIsNewBookingOpen(true),
          } : undefined}
        />
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Bookings list">
            <thead>
              <tr>
                <th>Customer & Pet</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Date (UTC)</th>
                <th>Time (UTC)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => (
                <tr key={b.id} className="table__row">
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.customerName}</div>
                    {b.petName && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                        🐾 {b.petName}
                      </div>
                    )}
                  </td>
                  <td>{serviceMap.get(b.serviceId) ?? b.serviceId.substring(0, 8)}</td>
                  <td>{staffMap.get(b.staffId) ?? b.staffId.substring(0, 8)}</td>
                  <td>{formatInstantDate(b.startAt)}</td>
                  <td>
                    {formatInstantTime(b.startAt)} - {formatInstantTime(b.endAt)}
                  </td>
                  <td>
                    <BookingStatusBadge status={b.status} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Eye size={14} />}
                      onClick={() => setSelectedBookingId(b.id)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Booking Modal */}
      <BookingModal
        isOpen={isNewBookingOpen && canManageBookings}
        onClose={() => setIsNewBookingOpen(false)}
      />

      {/* Booking Detail Modal */}
      <BookingDetail
        bookingId={selectedBookingId}
        isOpen={!!selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
      />
    </div>
  )
}

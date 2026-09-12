import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
} from 'lucide-react'
import { addDays } from 'date-fns'
import { useCalendarData } from './useCalendar'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { CalendarLegend } from './CalendarLegend'
import { BookingModal } from '@/features/bookings/BookingModal'
import { BookingDetail } from '@/features/bookings/BookingDetail'
import { Button } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { formatWeekRange, formatInstantDate } from '@/utils/dates'

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')

  // Modals state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [slotPrefill, setSlotPrefill] = useState<{
    startAt?: string
    serviceId?: string
    staffId?: string
  }>({})
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  const {
    weekStart,
    weekDays,
    timeSlots,
    services,
    staffList,
    bookings,
    staffAvailabilities,
    isLoading,
  } = useCalendarData(currentDate, selectedServiceId, selectedStaffId)

  // Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'week' ? -7 : -1))
  }

  const handleNext = () => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'week' ? 7 : 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const handleSelectSlot = (startAtInstant: string, staffId?: string) => {
    setSlotPrefill({
      startAt: startAtInstant,
      serviceId: selectedServiceId || undefined,
      staffId: staffId || selectedStaffId || undefined,
    })
    setIsBookingModalOpen(true)
  }

  const handleOpenNewBooking = () => {
    setSlotPrefill({
      serviceId: selectedServiceId || undefined,
      staffId: selectedStaffId || undefined,
      startAt: currentDate.toISOString(),
    })
    setIsBookingModalOpen(true)
  }

  const dateLabel =
    viewMode === 'week'
      ? formatWeekRange(weekStart)
      : formatInstantDate(currentDate.toISOString())

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Services Calendar</h1>
          <p className="page-subtitle">Schedule, staff availability, and bookings management</p>
        </div>
        <Button
          id="calendar-new-booking-btn"
          variant="primary"
          icon={<Plus size={16} />}
          onClick={handleOpenNewBooking}
        >
          New Booking
        </Button>
      </div>

      {/* Control Bar: Navigation, View Toggle & Filters */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          {/* Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={16} />}
              onClick={handlePrev}
              aria-label="Previous period"
            />
            <Button variant="secondary" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={16} />}
              onClick={handleNext}
              aria-label="Next period"
            />
            <span
              style={{
                marginLeft: 'var(--space-3)',
                fontWeight: 600,
                fontSize: 'var(--font-size-md)',
                color: 'var(--text-primary)',
              }}
            >
              {dateLabel}
            </span>
          </div>

          {/* View Toggle (Week / Day) */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-elevated)',
              padding: 3,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className="btn btn--sm"
              style={{
                background: viewMode === 'week' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'week' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              type="button"
              className="btn btn--sm"
              style={{
                background: viewMode === 'day' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'day' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
          </div>
        </div>

        {/* Filters and Legend Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {/* Dropdown Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select
                id="calendar-service-filter"
                className="form__select"
                style={{ width: 'auto', minWidth: 160 }}
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
              >
                <option value="">All Services</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <select
              id="calendar-staff-filter"
              className="form__select"
              style={{ width: 'auto', minWidth: 160 }}
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              <option value="">All Staff</option>
              {staffList
                ?.filter((s) => s.status === 'ACTIVE')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Status Legend */}
          <CalendarLegend />
        </div>
      </div>

      {/* Calendar Grid View */}
      {isLoading ? (
        <SkeletonCard lines={8} />
      ) : viewMode === 'week' ? (
        <WeekView
          weekDays={weekDays}
          timeSlots={timeSlots}
          bookings={bookings}
          staffAvailabilities={staffAvailabilities}
          staffList={staffList}
          services={services}
          selectedStaffId={selectedStaffId}
          selectedServiceId={selectedServiceId}
          onSelectSlot={handleSelectSlot}
          onSelectBooking={(bId) => setSelectedBookingId(bId)}
        />
      ) : (
        <DayView
          currentDate={currentDate}
          timeSlots={timeSlots}
          bookings={bookings}
          staffAvailabilities={staffAvailabilities}
          staffList={staffList}
          services={services}
          selectedStaffId={selectedStaffId}
          selectedServiceId={selectedServiceId}
          onSelectSlot={handleSelectSlot}
          onSelectBooking={(bId) => setSelectedBookingId(bId)}
        />
      )}

      {/* Booking Create Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        initialServiceId={slotPrefill.serviceId}
        initialStaffId={slotPrefill.staffId}
        initialStartAt={slotPrefill.startAt}
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

import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { listAvailability } from '@/api/availability'
import { listBookings } from '@/api/bookings'
import type { StaffResponse } from '@/api/types'
import { useMe } from '@/hooks/useMe'
import { Button } from '@/components/ui/Button'
import { AvailabilityTypeBadge } from '@/components/ui/Badge'
import { ErrorState } from '@/components/ui/EmptyState'
import { addUTCDays, getWeekDays, getWeekStart } from '@/utils/dates'
import { extractErrorMessage } from '@/utils/errors'
import { AVAILABILITY_QUERY_KEY } from './useAvailability'
import { StaffDayPanel } from './StaffDayPanel'
import { bookingsOnTenantDay, dayWindows, nominalDateLabel, nominalTenantToday, scheduleTimeRange, validTimezone, weekBookingRange } from './availabilityDates'

export function StaffAvailabilityMatrix({ staff }: { staff: StaffResponse[] }) {
  const me = useMe()
  if (me.isError) return <ErrorState title="Tenant settings unavailable" message={extractErrorMessage(me.error)} onRetry={() => me.refetch()} />
  if (me.isLoading) return <p role="status">Loading tenant timezone…</p>
  if (!validTimezone(me.data?.timezone)) return <ErrorState title="Tenant timezone unavailable" message="A valid tenant timezone is required to display the dated staff schedule." />
  return <DatedStaffMatrix key={me.data.timezone} staff={staff} timezone={me.data.timezone} />
}

function DatedStaffMatrix({ staff, timezone }: { staff: StaffResponse[]; timezone: string }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(nominalTenantToday(timezone)))
  const [selection, setSelection] = useState<{ staffId: string; date: Date } | null>(null)
  const days = getWeekDays(weekStart)
  const range = weekBookingRange(weekStart)
  const schedules = useQueries({ queries: staff.map(member => ({
    queryKey: AVAILABILITY_QUERY_KEY(member.id), queryFn: () => listAvailability(member.id),
  })) })
  const bookings = useQuery({
    queryKey: ['calendar', 'staff-week-bookings', timezone, range.from, range.to],
    queryFn: () => listBookings(range.from, range.to), enabled: staff.length > 0,
  })
  const selectedIndex = staff.findIndex(member => member.id === selection?.staffId)
  const selectedSchedule = schedules[selectedIndex]
  const navigateWeek = (amount: number) => { setWeekStart(date => addUTCDays(date, amount)); setSelection(null) }

  return (
    <section style={{ marginBottom: 24 }} aria-labelledby="staff-week-title">
      <h2 id="staff-week-title">All staff — week</h2>
      <p>Tenant-local schedule: {timezone}. Select a staff/day for dated working, BREAK, OFF and CONFIRMED booking periods.</p>
      <div className="flex items-center gap-3" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => navigateWeek(-7)} aria-label="Previous staff week">Previous</Button>
        <strong>{nominalDateLabel(days[0])} – {nominalDateLabel(days[6])}</strong>
        <Button variant="secondary" onClick={() => navigateWeek(7)} aria-label="Next staff week">Next</Button>
        <Button variant="ghost" onClick={() => { setWeekStart(getWeekStart(nominalTenantToday(timezone))); setSelection(null) }}>This week</Button>
      </div>
      {bookings.isError && <ErrorState title="Week bookings unavailable" message={extractErrorMessage(bookings.error)} onRetry={() => bookings.refetch()} />}
      {bookings.isLoading && <p role="status">Loading week bookings…</p>}
      {staff.length === 0 ? <p>No staff members found.</p> : <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" aria-label="All staff weekly availability" style={{ minWidth: 1050 }}>
          <thead><tr><th scope="col">Staff</th>{days.map(day => <th scope="col" key={day.toISOString()}>{nominalDateLabel(day)}</th>)}</tr></thead>
          <tbody>{staff.map((member, index) => {
            const schedule = schedules[index]
            return <tr key={member.id}>
              <th scope="row">{member.name}{member.status !== 'ACTIVE' && <p>Inactive — not available</p>}</th>
              {days.map(day => {
                const windows = dayWindows(schedule.data ?? [], day)
                const confirmed = bookingsOnTenantDay(bookings.data ?? [], member.id, day, timezone)
                const selected = selection?.staffId === member.id && selection.date.getTime() === day.getTime()
                return <td key={day.toISOString()} style={{ verticalAlign: 'top' }}>
                  <button type="button" className="btn btn--ghost" style={{ display: 'block', width: '100%', textAlign: 'left', whiteSpace: 'normal', padding: 8 }}
                    aria-label={`${member.name}, ${nominalDateLabel(day)}`} aria-pressed={selected}
                    onClick={() => setSelection({ staffId: member.id, date: day })}>
                    {schedule.isError ? <span>Schedule unavailable</span>
                      : schedule.isLoading ? <span>Loading schedule…</span>
                      : <>
                        {member.status !== 'ACTIVE' && <strong>Not available</strong>}
                        {windows.length === 0 ? <span>No working hours configured</span> : windows.map(window => <span key={window.id} style={{ display: 'block', marginBottom: 6 }}>
                          <AvailabilityTypeBadge type={window.type} /><br />{scheduleTimeRange(window)}
                        </span>)}
                      </>}
                    {bookings.isError ? <small>Booking data unavailable</small>
                      : bookings.isLoading ? <small>Loading bookings…</small>
                      : <small style={{ display: 'block' }}>{confirmed.length} confirmed</small>}
                  </button>
                  {schedule.isError && <Button size="sm" variant="ghost" onClick={() => schedule.refetch()}>Retry schedule</Button>}
                </td>
              })}
            </tr>
          })}</tbody>
        </table>
      </div>}
      {selection && selectedIndex >= 0 && <StaffDayPanel staff={staff[selectedIndex]} date={selection.date} timezone={timezone}
        availability={selectedSchedule.data ?? []} bookings={bookings.data ?? []}
        scheduleLoading={selectedSchedule.isLoading} scheduleError={selectedSchedule.error}
        bookingsLoading={bookings.isLoading} bookingsError={bookings.error} />}
    </section>
  )
}
import type { AvailabilityResponse, BookingResponse } from '@/api/types'
import { addUTCDays, dateToDayOfWeek } from '@/utils/dates'

/** A nominal UTC date represents a tenant-local calendar label, not an instant. */
export function tenantDateKey(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function nominalTenantToday(timezone: string, now = new Date()) {
  return new Date(`${tenantDateKey(now, timezone)}T00:00:00.000Z`)
}

export function nominalDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date)
}

export function validTimezone(timezone?: string): timezone is string {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0)
    return true
  } catch { return false }
}

/** Cover every offset (-12 to +14) and DST boundary; filter exact local dates below.
 * listBookings uses half-open interval overlap, so long-running bookings are included.
 */
export function weekBookingRange(weekStart: Date) {
  return { from: addUTCDays(weekStart, -1).toISOString(), to: addUTCDays(weekStart, 8).toISOString() }
}

export function dayWindows(windows: AvailabilityResponse[], date: Date) {
  return windows.filter(window => window.dayOfWeek === dateToDayOfWeek(date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function bookingsOnTenantDay(bookings: BookingResponse[], staffId: string, date: Date, timezone: string) {
  const day = date.toISOString().slice(0, 10)
  return bookings.filter(booking => {
    const start = Date.parse(booking.startAt)
    const end = Date.parse(booking.endAt)
    return booking.staffId === staffId && booking.status === 'CONFIRMED' && end > start
      && tenantDateKey(new Date(start), timezone) <= day
      // An end exactly at midnight does not occupy the following local day.
      && tenantDateKey(new Date(end - 1), timezone) >= day
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
}

export function tenantInstantLabel(instant: string, timezone: string) {
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
  }).format(new Date(instant))} (${timezone})`
}

export function scheduleTimeRange(window: AvailabilityResponse) {
  // OFF is an interval too. Never manufacture a full day from its type.
  return `${window.startTime.slice(0, 5)} – ${window.endTime.slice(0, 5)}`
}
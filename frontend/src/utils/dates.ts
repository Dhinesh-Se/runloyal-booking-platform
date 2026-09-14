import { format, parseISO, addMinutes, toDate, formatISO as dateFnsFormatISO } from 'date-fns'
import { UTCDate } from '@date-fns/utc'
import type { DayOfWeek } from '@/api/types'

// Calendar dates, arithmetic and display are UTC, independent of the browser zone.
// Use date-fns' UTC adapter instead of constructing local wall times in DST gaps.

function formatUTC(date: Date, fmt: string): string {
  return format(new UTCDate(date.getTime()), fmt)
}

export function startOfUTCDay(date: Date): Date {
  const result = new Date(date.getTime())
  result.setUTCHours(0, 0, 0, 0)
  return result
}

export function addUTCDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Format an ISO-8601 Instant for display.
 * We always show UTC explicitly to avoid silent timezone conversion.
 */
export function formatInstant(instant: string, fmt = 'MMM d, yyyy HH:mm') {
  return formatUTC(parseISO(instant), fmt) + ' UTC'
}

export function formatInstantDate(instant: string) {
  return formatUTC(parseISO(instant), 'MMM d, yyyy')
}

export function formatInstantTime(instant: string) {
  return formatUTC(parseISO(instant), 'HH:mm') + ' UTC'
}

/**
 * Derive end time from start + durationMinutes.
 */
export function deriveEndInstant(startAt: string, durationMinutes: number): string {
  return addMinutes(parseISO(startAt), durationMinutes).toISOString()
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getWeekStart(date: Date): Date {
  const day = startOfUTCDay(date)
  return addUTCDays(day, -((day.getUTCDay() + 6) % 7))
}

/**
 * Get array of 7 dates (Mon–Sun) for a given week start.
 */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addUTCDays(startOfUTCDay(weekStart), i))
}

/**
 * Convert a Date to ISO-8601 UTC Instant string for API calls.
 */
export function toInstant(date: Date): string {
  return date.toISOString()
}

/**
 * Format a date for display in the calendar header.
 */
export function formatCalendarDay(date: Date): { dayName: string; dayNum: string; monthShort: string } {
  return {
    dayName: formatUTC(date, 'EEE'),
    dayNum: formatUTC(date, 'd'),
    monthShort: formatUTC(date, 'MMM'),
  }
}

/**
 * Format a week range for the week navigator label.
 */
export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addUTCDays(weekStart, 6)
  return `${formatUTC(weekStart, 'MMM d')} – ${formatUTC(weekEnd, 'MMM d, yyyy')}`
}

/**
 * Map a JS Date to a backend DayOfWeek string.
 */
export function dateToDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  return days[date.getUTCDay()]
}

/**
 * Parse a LocalTime string "HH:mm:ss" or "HH:mm" to minutes since midnight.
 */
export function parseLocalTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Format minutes since midnight to "HH:mm".
 */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Convert a date and a LocalTime string to an ISO UTC instant.
 * Treats the input clock time as UTC. This does NOT convert tenant-local
 * recurring availability windows, which the backend evaluates in its tenant zone.
 */
export function dateAndTimeToInstant(date: Date, localTime: string): string {
  const [h, m] = localTime.split(':').map(Number)
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0, 0)
  )
  return d.toISOString()
}

/**
 * Get the start of the ISO week (Monday) for a given week offset from today.
 */
export function getWeekStartFromOffset(offset: number): Date {
  const today = new Date()
  const weekStart = getWeekStart(today)
  return addUTCDays(weekStart, offset * 7)
}

export const formatISO: typeof dateFnsFormatISO = (date, options) =>
  dateFnsFormatISO(new UTCDate(toDate(date).getTime()), options)

/** Half-open instant intervals: touching boundaries do not overlap. */
export function instantIntervalsOverlap(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return Date.parse(start) < Date.parse(otherEnd) && Date.parse(end) > Date.parse(otherStart)
}

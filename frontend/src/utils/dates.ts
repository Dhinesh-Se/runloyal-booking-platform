import { format, parseISO, addMinutes, startOfWeek, addDays, formatISO } from 'date-fns'
import type { DayOfWeek } from '@/api/types'

/**
 * Format an ISO-8601 Instant for display.
 * We always show UTC explicitly to avoid silent timezone conversion.
 */
export function formatInstant(instant: string, fmt = 'MMM d, yyyy HH:mm') {
  return format(parseISO(instant), fmt) + ' UTC'
}

export function formatInstantDate(instant: string) {
  return format(parseISO(instant), 'MMM d, yyyy')
}

export function formatInstantTime(instant: string) {
  return format(parseISO(instant), 'HH:mm') + ' UTC'
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
  return startOfWeek(date, { weekStartsOn: 1 })
}

/**
 * Get array of 7 dates (Mon–Sun) for a given week start.
 */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
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
    dayName: format(date, 'EEE'),
    dayNum: format(date, 'd'),
    monthShort: format(date, 'MMM'),
  }
}

/**
 * Format a week range for the week navigator label.
 */
export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
}

/**
 * Map a JS Date to a backend DayOfWeek string.
 */
export function dateToDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  return days[date.getDay()]
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
 * Treats LocalTime as UTC (backend evaluates in tenant timezone).
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
  return addDays(weekStart, offset * 7)
}

export { formatISO }

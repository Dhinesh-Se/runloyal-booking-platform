import type { AvailabilityResponse, DayOfWeek } from '@/api/types'

const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const hourMillis = 60 * 60 * 1000
const dayMillis = 24 * hourMillis
const formatters = new Map<string, Intl.DateTimeFormat>()
const dateOffsets = new Map<string, number[]>()
const boundaries = new Map<string, { earlier: number; later: number }>()

// Only pure zone/date/wall-time values are cached, never mutable schedule data.
// Bound memory across tenant switches and long calendar navigation sessions.
function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}

function formatter(timeZone: string) {
  let result = formatters.get(timeZone)
  if (!result) {
    result = new Intl.DateTimeFormat('en-US', {
      timeZone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    remember(formatters, timeZone, result, 32)
  }
  return result
}

export function isValidScheduleTimeZone(timeZone?: string): boolean {
  if (!timeZone) return false
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

function seconds(time: string): number {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

function offsetAt(instant: number, fmt: Intl.DateTimeFormat): number {
  // Intl emits whole seconds; discard milliseconds on BOTH sides of the offset
  // subtraction so a boundary's seconds/fraction are preserved by the inverse.
  const wholeSecond = Math.floor(instant / 1000) * 1000
  const parts = fmt.formatToParts(new Date(wholeSecond))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)!.value)
  const wall = new Date(0)
  wall.setUTCFullYear(part('year'), part('month') - 1, part('day'))
  wall.setUTCHours(part('hour'), part('minute'), part('second'), 0)
  return wall.getTime() - wholeSecond
}

function offsetsForDate(wallTime: number, timeZone: string): number[] {
  const date = Math.floor(wallTime / dayMillis) * dayMillis
  const key = `${timeZone}|${date}`
  const cached = dateOffsets.get(key)
  if (cached) return cached

  const fmt = formatter(timeZone)
  const offsets = new Set<number>()
  // Sample both sides of nearby IANA transitions, including non-hour changes
  // and date-line gaps. This is 17 probes per local DATE/ZONE, not per grid cell.
  const noon = date + 12 * hourMillis
  for (let hour = -48; hour <= 48; hour += 6) {
    offsets.add(offsetAt(noon + hour * hourMillis, fmt))
  }
  return remember(dateOffsets, key, [...offsets], 256)
}

/** Inverse Intl mapping with Java atZone/earlier-START/later-END semantics. */
function resolveBoundary(wallTime: number, timeZone: string) {
  const key = `${timeZone}|${wallTime}`
  const cached = boundaries.get(key)
  if (cached) return cached

  const fmt = formatter(timeZone)
  const exact: number[] = []
  let forward = NaN
  let smallestForwardDifference = Infinity
  for (const offset of offsetsForDate(wallTime, timeZone)) {
    const instant = wallTime - offset
    const difference = instant + offsetAt(instant, fmt) - wallTime
    if (difference === 0) exact.push(instant)
    // A nonexistent boundary is shifted by the gap duration, not snapped to the
    // transition. Choose the closest positive wall mapping when no exact one exists.
    else if (difference > 0 && difference < smallestForwardDifference) {
      forward = instant
      smallestForwardDifference = difference
    }
  }
  if (!exact.length && !Number.isFinite(forward)) {
    throw new RangeError('Cannot resolve schedule boundary in the account timezone')
  }
  return remember(boundaries, key, exact.length
    ? { earlier: Math.min(...exact), later: Math.max(...exact) }
    : { earlier: forward, later: forward }, 8192)
}

/**
 * Display-only recurring BREAK/OFF overlays; eligibility remains backend-owned.
 * Resolve each same-day dated rule into [earlier START, later END) instants, then
 * intersect with [startAt, endAt). Gaps shift boundaries forward. Like the backend,
 * equal/reversed local endpoints and empty/reversed resolved windows are ignored.
 * Pure bounded caches share Intl work across all staff, cells and rerenders while
 * always evaluating the CURRENT rules (including edits to an existing array).
 */
export function scheduleOverlays(
  rules: AvailabilityResponse[], startAt: string, endAt: string, timeZone: string,
): AvailabilityResponse[] {
  const start = Date.parse(startAt)
  const end = Date.parse(endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return []

  // A UTC day need not be the local rule's date. Two days of padding also cover
  // date-line gap shifts; do not derive occurrences from sampled wall minutes.
  const firstDate = (Math.floor(start / dayMillis) - 2) * dayMillis
  const lastDate = (Math.floor((end - 1) / dayMillis) + 2) * dayMillis
  const firstWeekday = new Date(firstDate).getUTCDay()
  return rules.filter(rule => {
    if (rule.type !== 'BREAK' && rule.type !== 'OFF') return false
    const localStart = seconds(rule.startTime) * 1000
    const localEnd = seconds(rule.endTime) * 1000
    const weekday = days.indexOf(rule.dayOfWeek)
    if (weekday < 0 || !(localStart >= 0 && localStart < localEnd && localEnd < dayMillis)) return false
    const firstOccurrence = firstDate + (weekday - firstWeekday + 7) % 7 * dayMillis
    for (let date = firstOccurrence; date <= lastDate; date += 7 * dayMillis) {
      const windowStart = resolveBoundary(date + localStart, timeZone).earlier
      const windowEnd = resolveBoundary(date + localEnd, timeZone).later
      if (windowStart < windowEnd && start < windowEnd && end > windowStart) return true
    }
    return false
  })
}
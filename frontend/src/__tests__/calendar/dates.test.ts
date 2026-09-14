import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addUTCDays, startOfUTCDay, getWeekStart, getWeekDays, getWeekStartFromOffset,
  formatCalendarDay, formatWeekRange, dateToDayOfWeek, dateAndTimeToInstant,
  formatInstant, formatInstantDate, formatInstantTime, formatISO, toInstant,
  deriveEndInstant, instantIntervalsOverlap,
} from '@/utils/dates'

afterEach(() => vi.useRealTimers())

describe('UTC calendar dates (run with multiple process timezones)', () => {
  it('keeps September 13 on Sunday in the week beginning September 7', () => {
    const date = new Date('2026-09-13T23:30:00Z')
    const original = date.getTime()
    const start = getWeekStart(date)
    expect(toInstant(start)).toBe('2026-09-07T00:00:00.000Z')
    const days = getWeekDays(start)
    expect(days.map(day => day.toISOString().slice(0, 10))).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ])
    expect(formatCalendarDay(days[6])).toEqual({ dayName: 'Sun', dayNum: '13', monthShort: 'Sep' })
    expect(dateToDayOfWeek(days[6])).toBe('SUNDAY')
    expect(formatWeekRange(start)).toBe('Sep 7 – Sep 13, 2026')
    expect(dateAndTimeToInstant(days[6], '09:30')).toBe('2026-09-13T09:30:00.000Z')
    expect(date.getTime()).toBe(original)
  })

  it.each([
    ['2026-03-08T23:30:00Z', '2026-03-02T00:00:00.000Z', '2026-03-09T00:00:00.000Z'],
    ['2026-11-01T23:30:00Z', '2026-10-26T00:00:00.000Z', '2026-11-02T00:00:00.000Z'],
    ['2026-12-31T23:30:00Z', '2026-12-28T00:00:00.000Z', '2027-01-04T00:00:00.000Z'],
  ])('uses seven 24-hour UTC days around %s', (instant, monday, nextMonday) => {
    const start = getWeekStart(new Date(instant))
    expect(start.toISOString()).toBe(monday)
    expect(addUTCDays(start, 7).toISOString()).toBe(nextMonday)
    getWeekDays(start).forEach((day, i) => {
      expect(day.getTime() - start.getTime()).toBe(i * 86_400_000)
      expect(day.getUTCHours()).toBe(0)
    })
    expect(addUTCDays(addUTCDays(start, 7), -7)).toEqual(start)
    expect(start.toISOString()).toBe(monday)
  })

  it('uses the UTC date of offset instants and UTC today for week offsets', () => {
    const date = new Date('2026-09-14T01:00:00+05:30')
    expect(startOfUTCDay(date).toISOString()).toBe('2026-09-13T00:00:00.000Z')
    expect(dateToDayOfWeek(date)).toBe('SUNDAY')
    vi.useFakeTimers()
    vi.setSystemTime(date)
    expect(getWeekStartFromOffset(0).toISOString()).toBe('2026-09-07T00:00:00.000Z')
    expect(getWeekStartFromOffset(1).toISOString()).toBe('2026-09-14T00:00:00.000Z')
    expect(getWeekStartFromOffset(-1).toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })
})

describe('UTC detail formatting', () => {
  it.each([
    ['2026-09-13T23:30:00Z', 'Sep 13, 2026', '23:30'],
    ['2026-09-14T01:00:00+05:30', 'Sep 13, 2026', '19:30'],
    ['2026-09-13T23:30:00-07:00', 'Sep 14, 2026', '06:30'],
    // This wall time does not exist in US browser zones on spring-forward day.
    ['2026-03-08T02:30:00Z', 'Mar 8, 2026', '02:30'],
    ['2026-11-01T01:30:00Z', 'Nov 1, 2026', '01:30'],
  ])('formats %s without silently applying the browser timezone', (instant, date, time) => {
    expect(formatInstant(instant)).toBe(`${date} ${time} UTC`)
    expect(formatInstantDate(instant)).toBe(date)
    expect(formatInstantTime(instant)).toBe(`${time} UTC`)
    expect(formatInstant(instant, 'HH:mm')).toBe(`${time} UTC`)
  })

  it('preserves custom date-fns tokens, quoted literals, offsets and ISO options', () => {
    const instant = '2026-03-08T02:30:00Z'
    expect(formatInstant(instant, "EEEE, do MMMM yyyy 'at' HH:mm XXX"))
      .toBe('Sunday, 8th March 2026 at 02:30 Z UTC')
    expect(formatInstant(instant, "RRRR-'W'II-i")).toBe('2026-W10-7 UTC')
    expect(formatInstant(instant, 't')).toBe(`${Date.parse(instant) / 1000} UTC`)
    expect(formatISO(new Date(instant))).toBe('2026-03-08T02:30:00Z')
    expect(formatISO(new Date(instant), { representation: 'date' })).toBe('2026-03-08')
    expect(formatISO(new Date(instant), { representation: 'time', format: 'basic' })).toBe('023000Z')
  })

  it('adds elapsed minutes through DST and UTC midnight', () => {
    expect(deriveEndInstant('2026-03-08T01:45:00-08:00', 30)).toBe('2026-03-08T10:15:00.000Z')
    expect(deriveEndInstant('2026-09-13T23:45:00Z', 30)).toBe('2026-09-14T00:15:00.000Z')
  })

  it('uses half-open overlap rather than date or clock substrings', () => {
    expect(instantIntervalsOverlap('2026-09-14T01:00:00+02:00', '2026-09-14T03:00:00+02:00',
      '2026-09-14T00:00:00Z', '2026-09-14T00:30:00Z')).toBe(true)
    expect(instantIntervalsOverlap('2026-09-13T09:30:00Z', '2026-09-13T10:00:00Z',
      '2026-09-13T09:00:00Z', '2026-09-13T09:30:00Z')).toBe(false)
  })
})
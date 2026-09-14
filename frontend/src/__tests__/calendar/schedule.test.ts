import { describe, expect, it, vi } from 'vitest'
import { isValidScheduleTimeZone, scheduleOverlays } from '@/utils/schedule'
import type { AvailabilityResponse } from '@/api/types'

const rule: AvailabilityResponse = {
  id: 'rule', tenantId: 'tenant', staffId: 'staff', dayOfWeek: 'MONDAY',
  startTime: '09:00:00', endTime: '09:30:00', type: 'BREAK',
}

describe('tenant-local schedule display on a UTC grid', () => {
  it.each([
    ['America/New_York', '2026-09-14T13:00:00Z', '2026-09-14T13:30:00Z'],
    ['America/New_York', '2026-01-12T14:00:00Z', '2026-01-12T14:30:00Z'],
    ['Asia/Kolkata', '2026-09-14T03:30:00Z', '2026-09-14T04:00:00Z'],
  ])('uses %s wall time at %s rather than a browser zone/fixed UTC offset', (zone, start, end) => {
    expect(scheduleOverlays([rule], start, end, zone)).toEqual([rule])
    expect(scheduleOverlays([rule], '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', zone)).toEqual([])
  })

  it('shows a partial OFF interval only in intersecting half-open cells', () => {
    const off = { ...rule, type: 'OFF' as const, startTime: '09:10:00', endTime: '09:20:00' }
    expect(scheduleOverlays([off], '2026-09-14T08:30:00Z', '2026-09-14T09:00:00Z', 'UTC')).toEqual([])
    expect(scheduleOverlays([off], '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', 'UTC')).toEqual([off])
    expect(scheduleOverlays([off], '2026-09-14T09:30:00Z', '2026-09-14T10:00:00Z', 'UTC')).toEqual([])
    expect(scheduleOverlays([off], '2026-09-14T09:20:00Z', '2026-09-14T09:30:00Z', 'UTC')).toEqual([])
  })

  it('preserves sub-minute partial windows rather than sampling only cell starts', () => {
    const partial = { ...rule, startTime: '09:05:10', endTime: '09:05:20' }
    expect(scheduleOverlays([partial], '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', 'UTC')).toEqual([partial])
  })

  it('ignores WORKING rules for availability and treats equal times as an empty interval', () => {
    expect(scheduleOverlays([{ ...rule, type: 'WORKING' }, { ...rule, endTime: rule.startTime }],
      '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', 'UTC')).toEqual([])
  })

  it('ignores reversed/overnight rules like the backend instead of implying next-day coverage', () => {
    const overnight = { ...rule, dayOfWeek: 'SATURDAY' as const, startTime: '23:30:00', endTime: '00:15:00' }
    expect(scheduleOverlays([overnight], '2026-09-12T18:00:00Z', '2026-09-12T18:30:00Z', 'Asia/Kolkata')).toEqual([])
    expect(scheduleOverlays([overnight], '2026-09-12T18:30:00Z', '2026-09-12T19:00:00Z', 'Asia/Kolkata')).toEqual([])
    expect(scheduleOverlays([overnight], '2026-09-12T18:45:00Z', '2026-09-12T19:00:00Z', 'Asia/Kolkata')).toEqual([])
  })

  it('uses the tenant weekday when the UTC date is the next day', () => {
    const evening = { ...rule, startTime: '23:00:00', endTime: '23:30:00' }
    expect(scheduleOverlays([evening], '2026-09-15T03:00:00Z', '2026-09-15T03:30:00Z', 'America/New_York')).toEqual([evening])
  })

  it.each([
    ['02:00:00', '03:00:00'], // Both boundaries resolve to 07:00Z: empty.
    ['02:45:00', '03:15:00'], // Shifted START is later than END: reversed.
  ])('ignores a window collapsed/reversed by gap resolution: %s–%s', (startTime, endTime) => {
    const gap = { ...rule, dayOfWeek: 'SUNDAY' as const, startTime, endTime }
    expect(scheduleOverlays([gap], '2026-03-08T06:00:00Z', '2026-03-08T09:00:00Z', 'America/New_York')).toEqual([])
  })

  it.each([
    { name: 'spring gap shifted by one hour', zone: 'America/New_York', day: 'SUNDAY',
      localStart: '02:15:00', localEnd: '02:45:00', start: '2026-03-08T07:15:00Z', end: '2026-03-08T07:45:00Z' },
    { name: 'spring gap with seconds', zone: 'America/New_York', day: 'SUNDAY',
      localStart: '02:15:10', localEnd: '02:45:20', start: '2026-03-08T07:15:10Z', end: '2026-03-08T07:45:20Z' },
    { name: 'only END lies in the spring gap', zone: 'America/New_York', day: 'SUNDAY',
      localStart: '01:55:10', localEnd: '02:15:20', start: '2026-03-08T06:55:10Z', end: '2026-03-08T07:15:20Z' },
    { name: 'fall earlier START and later END', zone: 'America/New_York', day: 'SUNDAY',
      localStart: '01:30:00', localEnd: '01:45:00', start: '2026-11-01T05:30:00Z', end: '2026-11-01T06:45:00Z' },
    { name: 'fall overlap with seconds', zone: 'America/New_York', day: 'SUNDAY',
      localStart: '01:30:10', localEnd: '01:45:20', start: '2026-11-01T05:30:10Z', end: '2026-11-01T06:45:20Z' },
    { name: 'ordinary seconds', zone: 'UTC', day: 'MONDAY',
      localStart: '09:05:10', localEnd: '09:05:20', start: '2026-09-14T09:05:10Z', end: '2026-09-14T09:05:20Z' },
    { name: 'fractional seconds', zone: 'UTC', day: 'MONDAY',
      localStart: '09:05:10.125', localEnd: '09:05:10.250', start: '2026-09-14T09:05:10.125Z', end: '2026-09-14T09:05:10.250Z' },
    { name: '30-minute spring gap', zone: 'Australia/Lord_Howe', day: 'SUNDAY',
      localStart: '02:15:00', localEnd: '02:25:00', start: '2026-10-03T15:45:00Z', end: '2026-10-03T15:55:00Z' },
    { name: '30-minute fall overlap', zone: 'Australia/Lord_Howe', day: 'SUNDAY',
      localStart: '01:40:00', localEnd: '01:50:00', start: '2026-04-04T14:40:00Z', end: '2026-04-04T15:20:00Z' },
    { name: 'date-line gap shifted to the next local date', zone: 'Pacific/Apia', day: 'FRIDAY',
      localStart: '09:00:00', localEnd: '10:00:00', start: '2011-12-30T19:00:00Z', end: '2011-12-30T20:00:00Z' },
  ] as const)('resolves half-open instant boundaries for $name', ({ zone, day, localStart, localEnd, start, end }) => {
    for (const type of ['BREAK', 'OFF'] as const) {
      const datedRule = { ...rule, dayOfWeek: day, startTime: localStart, endTime: localEnd, type }
      const rules = [datedRule]
      const startMs = Date.parse(start)
      const endMs = Date.parse(end)
      const at = (ms: number) => new Date(ms).toISOString()
      expect(scheduleOverlays(rules, at(startMs - 1000), start, zone)).toEqual([])
      expect(scheduleOverlays(rules, start, at(startMs + 1), zone)).toEqual([datedRule])
      expect(scheduleOverlays(rules, at(startMs + 1), at(endMs - 1), zone)).toEqual([datedRule])
      expect(scheduleOverlays(rules, at(endMs - 1), end, zone)).toEqual([datedRule])
      expect(scheduleOverlays(rules, end, at(endMs + 1000), zone)).toEqual([])
    }
  })

  it.each(['05:30', '05:45', '06:00', '06:15', '06:30'])(
    'keeps the NY fall 01:30–01:45 interval continuous through %sZ', time => {
      const fold = { ...rule, dayOfWeek: 'SUNDAY' as const, startTime: '01:30:00', endTime: '01:45:00' }
      const start = `2026-11-01T${time}:00Z`
      const end = new Date(Date.parse(start) + 15 * 60_000).toISOString()
      expect(scheduleOverlays([fold], start, end, 'America/New_York')).toEqual([fold])
    },
  )

  it.each(['2026-11-01T05:00:00Z', '2026-11-01T06:00:00Z'])(
    'shows both occurrences of a fall-back break at %s', start => {
      const fold = { ...rule, dayOfWeek: 'SUNDAY' as const, startTime: '01:15:00', endTime: '01:45:00' }
      const end = new Date(Date.parse(start) + 30 * 60_000).toISOString()
      expect(scheduleOverlays([fold], start, end, 'America/New_York')).toEqual([fold])
    },
  )

  it('rejects missing or invalid tenant timezones rather than defaulting to the browser zone', () => {
    expect(isValidScheduleTimeZone(undefined)).toBe(false)
    expect(isValidScheduleTimeZone('Invalid/Zone')).toBe(false)
    expect(isValidScheduleTimeZone('Asia/Kolkata')).toBe(true)
  })

  it.each([
    ['2026-09-14T09:00:00Z', '2026-09-14T09:00:00Z'],
    ['2026-09-14T10:00:00Z', '2026-09-14T09:00:00Z'],
    ['invalid', '2026-09-14T09:00:00Z'],
    ['2026-09-14T09:00:00Z', 'invalid'],
  ])('ignores empty, reversed or invalid query intervals %s–%s', (start, end) => {
    expect(scheduleOverlays([rule], start, end, 'UTC')).toEqual([])
  })

  it('does not retain stale windows when rules are edited in place or replaced using the same IDs', () => {
    const rules = [{ ...rule }]
    const oldStart = '2026-09-14T09:00:00Z'
    const oldEnd = '2026-09-14T09:30:00Z'
    expect(scheduleOverlays(rules, oldStart, oldEnd, 'UTC')).toEqual(rules)
    rules[0].startTime = '10:00:10'
    rules[0].endTime = '10:00:20'
    expect(scheduleOverlays(rules, oldStart, oldEnd, 'UTC')).toEqual([])
    expect(scheduleOverlays(rules, '2026-09-14T10:00:10Z', '2026-09-14T10:00:20Z', 'UTC')[0]).toBe(rules[0])
    const replacement = [{ ...rule, type: 'OFF' as const }]
    expect(scheduleOverlays(replacement, oldStart, oldEnd, 'UTC')[0]).toBe(replacement[0])
    expect(scheduleOverlays([], oldStart, oldEnd, 'UTC')).toEqual([])
    rules[0].type = 'WORKING'
    expect(scheduleOverlays(rules, '2026-09-14T10:00:10Z', '2026-09-14T10:00:20Z', 'UTC')).toEqual([])
  })

  it('keys cached boundaries by both local date and timezone', () => {
    const rules = [rule]
    expect(scheduleOverlays(rules, '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', 'UTC')).toEqual(rules)
    expect(scheduleOverlays(rules, '2026-09-14T09:00:00Z', '2026-09-14T09:30:00Z', 'America/New_York')).toEqual([])
    expect(scheduleOverlays(rules, '2026-09-14T13:00:00Z', '2026-09-14T13:30:00Z', 'America/New_York')).toEqual(rules)
    expect(scheduleOverlays(rules, '2026-01-12T13:00:00Z', '2026-01-12T13:30:00Z', 'America/New_York')).toEqual([])
    expect(scheduleOverlays(rules, '2026-01-12T14:00:00Z', '2026-01-12T14:30:00Z', 'America/New_York')).toEqual(rules)
  })

  it('bounds Intl operation counts for 20 staff × 48 rows × 7 days, with no formatting on a warm repeat', async () => {
    // Fresh module caches make this an operation-count regression, not a timing
    // benchmark or a test whose result depends on which earlier cases warmed it.
    vi.resetModules()
    const { scheduleOverlays: overlays } = await import('@/utils/schedule')
    const formatParts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      const weekdays: AvailabilityResponse['dayOfWeek'][] = [
        'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
      ]
      const staffRules = Array.from({ length: 20 }, (_, staff) => weekdays.map(dayOfWeek => ({
        ...rule, id: `${staff}-${dayOfWeek}`, staffId: `staff-${staff}`, dayOfWeek,
        startTime: `02:15:${String(staff).padStart(2, '0')}`,
        endTime: `02:45:${String(staff).padStart(2, '0')}`,
      })))
      const weekStart = Date.parse('2026-03-02T00:00:00Z')
      const renderGrid = () => {
        let matches = 0
        for (let row = 0; row < 48; row++) {
          for (let day = 0; day < 7; day++) {
            const start = weekStart + day * 86_400_000 + row * 30 * 60_000
            for (const rules of staffRules) {
              matches += overlays(rules, new Date(start).toISOString(),
                new Date(start + 30 * 60_000).toISOString(), 'America/New_York').length
            }
          }
        }
        return matches
      }
      expect(renderGrid()).toBe(20 * 7 * 2)
      // Eleven dates (week + two-day padding each side), 17 shared offset probes
      // per date, two boundaries per staff/date, at most two NY candidate offsets.
      // The old minute walk needed 20 * 48 * 7 * 30 = 201,600 formatting calls.
      expect(formatParts.mock.calls.length).toBeGreaterThan(0)
      expect(formatParts.mock.calls.length).toBeLessThanOrEqual(11 * 17 + 20 * 11 * 2 * 2)
      formatParts.mockClear()
      expect(renderGrid()).toBe(20 * 7 * 2)
      expect(formatParts).not.toHaveBeenCalled()
    } finally {
      formatParts.mockRestore()
    }
  })
})
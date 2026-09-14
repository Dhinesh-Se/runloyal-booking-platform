import { describe, expect, it } from 'vitest'
import { bookingDefaults, bookingSchema, bookingStartInstant } from '@/features/bookings/bookingForm'

describe('booking input validation', () => {
  it.each([
    ['2026-09-15', '00:00'], ['2026-09-15', '23:59'], ['2028-02-29', '09:00'],
    ['2026-03-08', '02:30'], ['2026-11-01', '01:30'],
  ])('accepts a valid UTC date/time: %s %s', (date, time) => {
    expect(bookingStartInstant(date, time)).toBe(`${date}T${time}:00Z`)
  })

  it.each([
    ['', '09:00'], ['not-a-date', '09:00'], ['2026-02-29', '09:00'],
    ['2026-02-30', '09:00'], ['2026-04-31', '09:00'], ['2026-13-01', '09:00'],
    ['2026-00-01', '09:00'], ['2026-01-00', '09:00'], ['0000-01-01', '09:00'],
    ['10000-01-01', '09:00'], ['2026-09-15', ''], ['2026-09-15', '24:00'],
    ['2026-09-15', '12:60'], ['2026-09-15', '9:00'], ['2026-09-15', '99:99'],
  ])('rejects invalid dates or out-of-range times safely: %s %s', (date, time) => {
    expect(bookingStartInstant(date, time)).toBeNull()
    expect(bookingSchema.safeParse({
      ...bookingDefaults('svc-1', 'staff-1'), customerName: 'Customer',
      startAtDate: date, startAtTime: time,
    }).success).toBe(false)
  })

  it.each(['', ' ', '\t\n', '    '])('rejects blank customer names after trimming: %j', (customerName) => {
    const result = bookingSchema.safeParse({
      ...bookingDefaults('svc-1', 'staff-1'), customerName,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.flatten().fieldErrors.customerName).toContain('Customer name is required')
  })

  it('trims customer and pet names before length validation', () => {
    const result = bookingSchema.parse({
      ...bookingDefaults('svc-1', 'staff-1'), customerName: `  ${'a'.repeat(100)}  `, petName: '  Spot  ',
    })
    expect(result.customerName).toBe('a'.repeat(100))
    expect(result.petName).toBe('Spot')
  })
})

describe('Instant prefills', () => {
  it.each([
    ['2026-09-15T09:00:00Z', '2026-09-15', '09:00'],
    ['2026-09-15T00:15:00+05:30', '2026-09-14', '18:45'],
    ['2026-09-15T23:45:00-07:00', '2026-09-16', '06:45'],
    ['2026-03-08T01:30:00-08:00', '2026-03-08', '09:30'],
    ['2026-11-01T01:30:00-07:00', '2026-11-01', '08:30'],
    ['2026-11-01T01:30:00-08:00', '2026-11-01', '09:30'],
  ])('normalizes %s to UTC without applying the browser timezone', (instant, date, time) => {
    expect(bookingDefaults('svc-1', 'staff-1', instant)).toMatchObject({
      serviceId: 'svc-1', staffId: 'staff-1', startAtDate: date, startAtTime: time,
    })
  })

  it.each([
    ['2026-09-15T00:15:59.999+05:30', '2026-09-14T18:45:00Z'],
    ['2026-09-15T23:59:59.999-07:00', '2026-09-16T06:59:00Z'],
  ])('truncates seconds/fractions to the displayed UTC minute without rounding: %s', (instant, expected) => {
    const defaults = bookingDefaults('svc-1', 'staff-1', instant)
    expect(bookingStartInstant(defaults.startAtDate, defaults.startAtTime)).toBe(expected)
  })

  it.each(['', 'invalid', '2026-09-15T09:00:00', '2026-02-30T09:00:00Z', '2026-09-15T24:00:00Z'])('fails closed for invalid prefill %j', (instant) => {
    expect(bookingDefaults('svc-1', 'staff-1', instant)).toMatchObject({ startAtDate: '', startAtTime: '' })
  })
})
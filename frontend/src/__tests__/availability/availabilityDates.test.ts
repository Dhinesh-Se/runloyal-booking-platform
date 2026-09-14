import { describe, expect, it } from 'vitest'
import type { BookingResponse } from '@/api/types'
import { bookingsOnTenantDay, nominalTenantToday, tenantInstantLabel, weekBookingRange } from '@/features/availability/availabilityDates'

function booking(id: string, startAt: string, endAt: string, status: BookingResponse['status'] = 'CONFIRMED'): BookingResponse {
  return { id, tenantId: 't1', staffId: 's1', serviceId: 'svc1', customerName: id, petName: null, startAt, endAt, status }
}

describe('tenant-local nominal dates and actual booking overlap', () => {
  it('derives the tenant date, not the browser or UTC date', () => {
    expect(nominalTenantToday('Pacific/Kiritimati', new Date('2026-09-13T12:00:00Z')).toISOString()).toBe('2026-09-14T00:00:00.000Z')
    expect(nominalTenantToday('America/Los_Angeles', new Date('2026-09-14T01:00:00Z')).toISOString()).toBe('2026-09-13T00:00:00.000Z')
  })

  it('pads the backend overlap query for both extreme day offsets', () => {
    const range = weekBookingRange(new Date('2026-09-14T00:00:00Z'))
    expect(range).toEqual({ from: '2026-09-13T00:00:00.000Z', to: '2026-09-22T00:00:00.000Z' })
    expect(Date.parse(range.from)).toBeLessThan(Date.parse('2026-09-14T00:00:00+14:00'))
    expect(Date.parse(range.to)).toBeGreaterThan(Date.parse('2026-09-21T00:00:00-12:00'))
  })

  it('uses half-open local-day overlap, includes overnight and excludes cancelled and other staff', () => {
    const data = [
      booking('overnight', '2026-09-14T03:30:00Z', '2026-09-14T04:30:00Z'),
      booking('ends at local midnight', '2026-09-14T03:00:00Z', '2026-09-14T04:00:00Z'),
      booking('starts tomorrow', '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z'),
      booking('late local evening', '2026-09-15T03:00:00Z', '2026-09-15T03:30:00Z'),
      booking('cancelled', '2026-09-14T09:00:00Z', '2026-09-14T10:00:00Z', 'CANCELLED'),
      { ...booking('other staff', '2026-09-14T09:00:00Z', '2026-09-14T10:00:00Z'), staffId: 's2' },
    ]
    expect(bookingsOnTenantDay(data, 's1', new Date('2026-09-14T00:00:00Z'), 'America/New_York').map(b => b.id))
      .toEqual(['overnight', 'late local evening'])
  })

  it('includes both repeated DST hours but not the following local midnight', () => {
    const data = [
      booking('first 01:30', '2026-11-01T05:30:00Z', '2026-11-01T05:45:00Z'),
      booking('second 01:30', '2026-11-01T06:30:00Z', '2026-11-01T06:45:00Z'),
      booking('last hour', '2026-11-02T04:30:00Z', '2026-11-02T05:00:00Z'),
      booking('next day', '2026-11-02T05:00:00Z', '2026-11-02T05:30:00Z'),
    ]
    expect(bookingsOnTenantDay(data, 's1', new Date('2026-11-01T00:00:00Z'), 'America/New_York').map(b => b.id))
      .toEqual(['first 01:30', 'second 01:30', 'last hour'])
    expect(tenantInstantLabel(data[0].startAt, 'America/New_York')).toContain('GMT-4')
    expect(tenantInstantLabel(data[1].startAt, 'America/New_York')).toContain('GMT-5')
  })
})
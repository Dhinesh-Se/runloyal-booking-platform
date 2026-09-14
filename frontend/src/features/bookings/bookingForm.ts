import { z } from 'zod'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

/** Reject invalid/rolled-over dates before constructing or formatting an Instant. */
export function bookingStartInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !timePattern.test(time)) {
    return null
  }
  const instant = `${date}T${time}:00Z`
  const parsed = new Date(instant)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? instant
    : null
}

export const bookingSchema = z.object({
  serviceId: z.string().min(1, 'Please select a service'),
  staffId: z.string().min(1, 'Please select an available staff member'),
  startAtDate: z.string().refine((date) => bookingStartInstant(date, '00:00') !== null, 'Enter a valid date'),
  startAtTime: z.string().regex(timePattern, 'Enter a valid time (00:00–23:59)'),
  customerName: z.string().trim().min(1, 'Customer name is required').max(100),
  petName: z.string().trim().max(100).optional(),
})

export type BookingFormValues = z.infer<typeof bookingSchema>

export function bookingDefaults(serviceId?: string, staffId?: string, startAt?: string): BookingFormValues {
  // Only accept an explicit Instant, never a browser-local timestamp.
  const isInstant = startAt !== undefined &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(startAt) &&
    bookingStartInstant(startAt.slice(0, 10), startAt.slice(11, 16)) !== null
  const parsed = isInstant ? new Date(startAt) : null
  const utc = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
  // The form books at minute precision: truncate seconds/fractions after UTC conversion.
  return {
    serviceId: serviceId ?? '',
    staffId: staffId ?? '',
    startAtDate: startAt === undefined ? new Date().toISOString().slice(0, 10) : utc?.slice(0, 10) ?? '',
    startAtTime: startAt === undefined ? '09:00' : utc?.slice(11, 16) ?? '',
    customerName: '',
    petName: '',
  }
}
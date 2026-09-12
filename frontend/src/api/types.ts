/**
 * API types — mirror of backend DTOs exactly.
 * Do NOT add fields that don't exist in the backend responses.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type Status = 'ACTIVE' | 'INACTIVE'
export type Role = 'TENANT_ADMIN' | 'STAFF'
export type AvailabilityType = 'WORKING' | 'BREAK' | 'OFF'
export type BookingStatus = 'CONFIRMED' | 'CANCELLED'
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

// ─── Response types ───────────────────────────────────────────────────────────

export interface UserResponse {
  id: string
  tenantId: string
  tenantName?: string
  timezone?: string
  oktaSubject: string
  role: Role
  status: Status
}

export interface AvailableSlotResponse {
  startAt: string
  endAt: string
  availableStaff: StaffResponse[]
}

export interface ServiceResponse {
  id: string
  tenantId: string
  name: string
  description: string | null
  category: string
  durationMinutes: number
  price: number
  status: Status
}

export interface StaffResponse {
  id: string
  tenantId: string
  userId: string | null
  name: string
  status: Status
}

export interface AvailabilityResponse {
  id: string
  tenantId: string
  staffId: string
  dayOfWeek: DayOfWeek
  startTime: string   // "HH:mm:ss" LocalTime from backend
  endTime: string     // "HH:mm:ss" LocalTime from backend
  type: AvailabilityType
}

export interface BookingResponse {
  id: string
  tenantId: string
  serviceId: string
  staffId: string
  startAt: string   // ISO-8601 Instant
  endAt: string     // ISO-8601 Instant
  status: BookingStatus
  customerName: string
  petName: string | null
}

export interface ApiError {
  message?: string
  error?: string
  errors?: Record<string, string>
  status?: number
}

// ─── Request / Command types ──────────────────────────────────────────────────

export interface ServiceCommand {
  name: string
  description?: string
  category: string
  durationMinutes: number
  price: number
  status: Status
}

export interface StaffCommand {
  name: string
  status: Status
}

export interface AvailabilityCommand {
  dayOfWeek: DayOfWeek
  startTime: string   // "HH:mm" sent to backend
  endTime: string     // "HH:mm"
  type: AvailabilityType
}

export interface BookingCommand {
  serviceId: string
  staffId: string
  startAt: string   // ISO-8601 UTC Instant
  customerName: string
  petName?: string
}

import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { BookingResponse, ServiceResponse, StaffResponse, UserResponse } from '@/api/types'
import { createTestQueryClient } from '../testUtils'

export const activeAdmin: UserResponse = {
  id: 'admin-1', tenantId: 't-1', oktaSubject: 'admin-subject',
  role: 'TENANT_ADMIN', status: 'ACTIVE',
}

export const services: ServiceResponse[] = [{
  id: 'svc-1', tenantId: 't-1', name: 'Standard Dog Wash', description: null,
  category: 'Wash', durationMinutes: 30, price: 30, status: 'ACTIVE',
}]

export const staff: StaffResponse[] = [
  { id: 'staff-1', tenantId: 't-1', userId: null, name: 'Sarah Connor', status: 'ACTIVE' },
  { id: 'staff-2', tenantId: 't-1', userId: null, name: 'Bruce Wayne', status: 'ACTIVE' },
]

export const booking: BookingResponse = {
  id: 'booking-1', tenantId: 't-1', serviceId: 'svc-1', staffId: 'staff-1',
  startAt: '2026-09-15T09:00:00Z', endAt: '2026-09-15T09:45:00Z',
  customerName: 'Bob Vance', petName: 'Spot', status: 'CONFIRMED',
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

export function bookingProviders() {
  const queryClient = createTestQueryClient()
  // Keep one cache across rerenders; service/role refresh tests depend on this.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

export function renderBooking(ui: ReactElement) {
  const { queryClient, wrapper } = bookingProviders()
  return { ...render(ui, { wrapper }), queryClient }
}
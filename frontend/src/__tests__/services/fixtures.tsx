import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createTestQueryClient } from '../testUtils'
import type { AvailableSlotResponse, BookingResponse, ServiceResponse, StaffResponse, UserResponse } from '@/api/types'

export const NOW = Date.parse('2026-09-14T12:15:00.000Z')
export const admin: UserResponse = {
  id: 'admin', tenantId: 'tenant', oktaSubject: 'subject', role: 'TENANT_ADMIN', status: 'ACTIVE',
}
export const service: ServiceResponse = {
  id: 'service-1', tenantId: 'tenant', name: 'Grooming', category: 'Care', description: 'Full groom',
  durationMinutes: 60, price: 45, status: 'ACTIVE',
}
export const alice: StaffResponse = { id: 'alice', tenantId: 'tenant', userId: null, name: 'Alice', status: 'ACTIVE' }
export const bob: StaffResponse = { ...alice, id: 'bob', name: 'Bob' }
export const inactiveStaff: StaffResponse = { ...alice, id: 'inactive', name: 'Inactive Staff', status: 'INACTIVE' }
export const slot: AvailableSlotResponse = {
  startAt: '2026-09-15T09:00:00Z', endAt: '2026-09-15T10:00:00Z', availableStaff: [alice, bob, inactiveStaff],
}
export const booking: BookingResponse = {
  id: 'booking-1', tenantId: 'tenant', serviceId: service.id, staffId: alice.id,
  startAt: slot.startAt, endAt: slot.endAt, status: 'CONFIRMED', customerName: 'Jane', petName: 'Max',
}

export function renderServiceView(view: ReactElement, client = createTestQueryClient()) {
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/services/${service.id}`]}>
        <Routes><Route path="/services/:id" element={view} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, client }
}
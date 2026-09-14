import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ServiceResponse, StaffResponse, UserResponse } from '@/api/types'
import { createTestQueryClient } from '../testUtils'

export const admin: UserResponse = {
  id: 'user-1', tenantId: 't-1', oktaSubject: 'admin-subject',
  role: 'TENANT_ADMIN', status: 'ACTIVE', timezone: 'America/New_York',
}

export const member: StaffResponse = {
  id: 'staff-1', tenantId: 't-1', userId: null, name: 'Jane Smith', status: 'ACTIVE',
}

export const services: ServiceResponse[] = [
  {
    id: 'svc-1', tenantId: 't-1', name: 'Bath & Brush', description: null,
    category: 'Grooming', durationMinutes: 45, price: 35, status: 'ACTIVE',
  },
  {
    id: 'svc-2', tenantId: 't-1', name: 'Teeth Cleaning', description: null,
    category: 'Dental', durationMinutes: 30, price: 25, status: 'ACTIVE',
  },
]

export function renderStaff(ui: ReactElement, client = createTestQueryClient(), route = '/') {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}
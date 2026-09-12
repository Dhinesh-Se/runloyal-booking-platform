import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { LoginCallback } from '@/auth/LoginCallback'
import { Shell } from '@/components/layout/Shell'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { ServicesPage } from '@/features/services/ServicesPage'
import { ServiceDetail } from '@/features/services/ServiceDetail'
import { StaffPage } from '@/features/staff/StaffPage'
import { StaffDetail } from '@/features/staff/StaffDetail'
import { AvailabilityPage } from '@/features/availability/AvailabilityPage'
import { BookingsPage } from '@/features/bookings/BookingsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

export function Router() {
  return (
    <Routes>
      {/* Okta authorization-code callback */}
      <Route path="/login/callback" element={<LoginCallback />} />

      {/* Protected app shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="staff/:id" element={<StaffDetail />} />
        <Route path="availability" element={<AvailabilityPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

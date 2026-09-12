export { extractErrorMessage, extractFieldErrors } from '@/api/client'

/**
 * Check if an error represents an HTTP 409 Conflict.
 */
export function isConflictError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as { response?: { status?: number }; status?: number }
    return err.response?.status === 409 || err.status === 409
  }
  return false
}

/**
 * Get a display-friendly HTTP status label.
 */
export function getStatusLabel(status: number): string {
  switch (status) {
    case 400: return 'Validation Error'
    case 401: return 'Session Expired'
    case 403: return 'Permission Denied'
    case 404: return 'Not Found'
    case 409: return 'Booking Conflict'
    case 500: return 'Server Error'
    default: return 'Error'
  }
}

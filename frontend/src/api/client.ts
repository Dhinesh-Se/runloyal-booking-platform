import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from './types'

let getAccessTokenFn: (() => Promise<string | null>) | null = null

/**
 * Register the Auth0 token getter. Called once from the auth provider.
 */
export function registerTokenGetter(fn: () => Promise<string | null>) {
  getAccessTokenFn = fn
}

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: attach Bearer token ─────────────────────────────────
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (getAccessTokenFn) {
    const token = await getAccessTokenFn()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// ─── Response interceptor: normalize errors ────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status

    if (status === 401) {
      // Signal session expiry so the auth provider can redirect.
      window.dispatchEvent(new CustomEvent('runloyal:session-expired'))
    }

    return Promise.reject(error)
  }
)

/**
 * Extract a human-readable error message from an Axios error.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined
    const status = error.response?.status

    if (status === 409) {
      return 'That slot was just booked by someone else. Please choose another available slot.'
    }
    if (status === 403) {
      return 'You do not have permission to perform this action.'
    }
    if (status === 404) {
      return 'The requested resource was not found.'
    }
    if (data?.message) return data.message
    if (data?.error) return data.error
    if (!error.response) return 'Network error. Please check your connection.'
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

/**
 * Extract field-level validation errors from a 400 response.
 */
export function extractFieldErrors(error: unknown): Record<string, string> {
  if (error && typeof error === 'object') {
    const err = error as { response?: { status?: number; data?: ApiError } }
    if (err.response?.status === 400 && err.response.data?.errors) {
      return err.response.data.errors
    }
  }
  return {}
}

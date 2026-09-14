import axios, { AxiosError, CanceledError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from './types'
import { isTokenAccessBlocked } from '@/auth/session'

let getAccessTokenFn: (() => Promise<string | null>) | null = null
let sessionController = new AbortController()
const pendingTokens = new Set<Promise<string | null>>()
const requestCleanup = new WeakMap<InternalAxiosRequestConfig, () => void>()

/**
 * Register the Okta access-token getter. Called once from the auth provider.
 */
export function registerTokenGetter(fn: () => Promise<string | null>) {
  getAccessTokenFn = fn
  return () => {
    if (getAccessTokenFn === fn) getAccessTokenFn = null
  }
}

export function cancelApiRequests() {
  sessionController.abort()
  sessionController = new AbortController()
}

export async function waitForTokenRequests() {
  await Promise.allSettled([...pendingTokens])
}

function cleanupRequest(config?: InternalAxiosRequestConfig) {
  if (!config) return
  requestCleanup.get(config)?.()
  requestCleanup.delete(config)
}

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: attach Bearer token ─────────────────────────────────
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (isTokenAccessBlocked()) throw new CanceledError('Signed out', config)
  const controller = new AbortController()
  const signals = [sessionController.signal, config.signal]
  const abort = () => controller.abort()
  signals.forEach((signal) => {
    if (signal?.aborted) abort()
    else signal?.addEventListener?.('abort', abort)
  })
  requestCleanup.set(config, () => {
    signals.forEach((signal) => signal?.removeEventListener?.('abort', abort))
  })
  config.signal = controller.signal
  try {
    if (controller.signal.aborted) throw new CanceledError('Request canceled', config)
    if (getAccessTokenFn) {
      const pending = getAccessTokenFn()
      pendingTokens.add(pending)
      let token: string | null
      try {
        token = await pending
      } finally {
        pendingTokens.delete(pending)
      }
      if (isTokenAccessBlocked() || controller.signal.aborted) {
        throw new CanceledError('Signed out', config)
      }
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
    return config
  } catch (error) {
    cleanupRequest(config)
    throw error
  }
})

// ─── Response interceptor: normalize errors ────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    cleanupRequest(response.config)
    if (isTokenAccessBlocked() || response.config.signal?.aborted) {
      throw new CanceledError('Signed out', response.config)
    }
    return response
  },
  (error: AxiosError<ApiError>) => {
    cleanupRequest(error.config)
    const status = error.response?.status

    if (status === 401 && !isTokenAccessBlocked() && !error.config?.signal?.aborted) {
      // Lock protected UI and offer explicit sign-in; avoid redirect loops.
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
    if (err.response?.status === 400) {
      return err.response.data?.validationErrors ?? err.response.data?.errors ?? {}
    }
  }
  return {}
}

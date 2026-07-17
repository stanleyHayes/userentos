import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '../stores/authStore'

// Resolve the API base URL:
//  - production: EXPO_PUBLIC_API_URL (warn loudly if missing instead of "undefined/api")
//  - dev: prefer EXPO_PUBLIC_API_URL; otherwise derive the dev machine's host from
//    Expo's hostUri so a PHYSICAL device reaches the server (plain "localhost" would
//    resolve to the device itself). Falls back to localhost for simulators.
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (!__DEV__) {
    if (!envUrl) console.warn('[api] EXPO_PUBLIC_API_URL is not set — API requests will fail.')
    return `${envUrl ?? ''}/api`
  }
  if (envUrl) return `${envUrl}/api`
  const hostUri = Constants.expoConfig?.hostUri
  const host = hostUri ? hostUri.split(':')[0] : 'localhost'
  return `http://${host}:3002/api`
}

const BASE_URL = resolveBaseUrl()

const BIOMETRIC_REFRESH_KEY = 'rentos_biometric_refresh_v2'

let refreshingPromise: Promise<boolean> | null = null

/** Biometric sessions rotate through /auth/biometric/exchange (device-bound). */
async function attemptBiometricRefresh(refreshToken: string): Promise<boolean> {
  try {
    // Lazy import to avoid a static module cycle (biometric.ts imports api.ts)
    const { getDeviceId } = await import('./biometric')
    const deviceId = await getDeviceId()
    const res = await fetch(`${BASE_URL}/auth/biometric/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceId }),
    })
    if (!res.ok) return false
    const data = await res.json()
    const { token, refreshToken: newRefreshToken } = data.data ?? {}
    if (!token || !newRefreshToken) return false
    await SecureStore.setItemAsync(BIOMETRIC_REFRESH_KEY, newRefreshToken).catch(() => {})
    useAuthStore.getState().updateTokens(token, newRefreshToken)
    return true
  } catch {
    return false
  }
}

async function attemptRefresh(): Promise<boolean> {
  const { refreshToken, biometricSession } = useAuthStore.getState()
  if (!refreshToken) return false

  if (biometricSession) {
    return attemptBiometricRefresh(refreshToken)
  }

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) return false

    const data = await res.json()
    const { token, refreshToken: newRefreshToken } = data.data ?? {}
    if (token) {
      // updateTokens persists to SecureStore — the server revoked the OLD
      // refresh token on rotation, so a bare setState here guarantees a
      // forced logout on next cold start.
      useAuthStore.getState().updateTokens(token, newRefreshToken ?? refreshToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

class ApiClient {
  private getToken(): string | null {
    return useAuthStore.getState().token
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const doRequest = (): Promise<Response> =>
      fetch(`${BASE_URL}${path}`, { ...options, headers })

    let res = await doRequest()

    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (!refreshingPromise) {
        refreshingPromise = attemptRefresh().finally(() => {
          refreshingPromise = null
        })
      }
      const refreshed = await refreshingPromise

      if (refreshed) {
        const newToken = this.getToken()
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`
        }
        res = await doRequest()
      } else {
        useAuthStore.getState().logout()
        throw new Error('Session expired')
      }
    }

    const text = await res.text()
    let data: { error?: string; data?: unknown } = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data.data as T
  }

  get<T>(path: string) { return this.request<T>(path) }
  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }) }
  patch<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }) }
  put<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }) }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }) }

  /** Multipart upload with the same 401-refresh behavior as request(). */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    const authHeader = (): Record<string, string> => {
      const t = this.getToken()
      return t ? { Authorization: `Bearer ${t}` } : {}
    }

    let res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: authHeader(),
      body: formData,
    })

    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (!refreshingPromise) {
        refreshingPromise = attemptRefresh().finally(() => {
          refreshingPromise = null
        })
      }
      const refreshed = await refreshingPromise
      if (refreshed) {
        res = await fetch(`${BASE_URL}${path}`, {
          method: 'POST',
          headers: authHeader(),
          body: formData,
        })
      } else {
        useAuthStore.getState().logout()
        throw new Error('Session expired')
      }
    }

    const text = await res.text()
    let data: { error?: string; data?: unknown } = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`)
    return data.data as T
  }
}

export const api = new ApiClient()

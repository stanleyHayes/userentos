import Constants from 'expo-constants'
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

let refreshingPromise: Promise<boolean> | null = null

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return false

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
      useAuthStore.setState({ token, refreshToken: newRefreshToken ?? refreshToken })
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

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data.data
  }

  get<T>(path: string) { return this.request<T>(path) }
  post<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }) }
  patch<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }) }
  put<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }) }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }) }
}

export const api = new ApiClient()

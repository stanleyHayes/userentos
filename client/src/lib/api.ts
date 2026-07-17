import { useAuthStore } from '@/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

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

  /** Parse a response body as JSON, tolerating non-JSON infrastructure error
   * pages (proxy 502/504 HTML) and empty bodies. */
  private async parseBody(res: Response): Promise<{ error?: string; data?: unknown }> {
    const text = await res.text()
    if (!text) return {}
    try {
      return JSON.parse(text) as { error?: string; data?: unknown }
    } catch {
      return {}
    }
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
      fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      })

    let res = await doRequest()

    // Silent refresh on 401 (except auth paths)
    if (res.status === 401 && !path.startsWith('/auth/')) {
      // Deduplicate concurrent refresh attempts
      if (!refreshingPromise) {
        refreshingPromise = attemptRefresh().finally(() => {
          refreshingPromise = null
        })
      }
      const refreshed = await refreshingPromise

      if (refreshed) {
        // Retry original request with new token
        const newToken = this.getToken()
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`
        }
        res = await doRequest()
      } else {
        // Refresh failed — clear auth state
        useAuthStore.getState().logout()
        throw new Error('Session expired')
      }
    }

    const data = await this.parseBody(res)

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`)
    }

    return data.data as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const getAuthHeader = (): Record<string, string> => {
      const t = this.getToken()
      return t ? { Authorization: `Bearer ${t}` } : {}
    }

    let res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    })

    // Silent refresh on 401
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
          headers: getAuthHeader(),
          body: formData,
        })
      } else {
        useAuthStore.getState().logout()
        throw new Error('Session expired')
      }
    }

    const data = await this.parseBody(res)

    if (!res.ok) {
      throw new Error(data.error || `Upload failed (${res.status})`)
    }

    return data.data as T
  }
}

export const api = new ApiClient()

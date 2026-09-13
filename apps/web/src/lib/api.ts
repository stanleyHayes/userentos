import { checkoutRequest } from './checkoutRequests'
import { isProviderCheckout } from '../../../../packages/shared/checkoutRequests'
import { AiConsentDeclined, AI_SHARING_VERSION, confirmAiSharing, needsAiConsent } from './aiConsent'
import { getSessionGeneration, refreshCurrentSession, useAuthStore } from '@/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

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
    const owner = useAuthStore.getState().user?.id
    const generation = getSessionGeneration()
    const assertOwner = () => {
      if (getSessionGeneration() !== generation || useAuthStore.getState().user?.id !== owner) throw new Error('Account session changed. Please try again.')
    }
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers as Record<string, string>) || {}),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const doRequest = (): Promise<Response> => {
      assertOwner()
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      })
    }

    let res = await doRequest()
    assertOwner()

    // Silent refresh on 401 (except auth paths)
    if (res.status === 401 && !path.startsWith('/auth/')) {
      const refreshed = await refreshCurrentSession(token)
      assertOwner()

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
    assertOwner()

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`)
    }

    return data.data as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    let payload = JSON.stringify(body)
    if (needsAiConsent(path)) {
      const session = getSessionGeneration()
      if (!await confirmAiSharing(path)) throw new AiConsentDeclined()
      if (getSessionGeneration() !== session) throw new Error('Account session changed. Please try again.')
      payload = JSON.stringify({ ...JSON.parse(payload), aiSharingConsent: AI_SHARING_VERSION })
    }
    if (isProviderCheckout(path, body)) {
      const origin = useAuthStore.getState()
      const generation = getSessionGeneration()
      const owner = origin.user?.id
      if (!owner) throw new Error('Sign in before starting a payment.')
      return checkoutRequest(owner, path, payload, async (key, signal) => {
        if (getSessionGeneration() !== generation || useAuthStore.getState().user?.id !== owner) throw new Error('Account session changed. Please try again.')
        const result = await this.request<T>(path, { method: 'POST', body: payload, signal, headers: { 'Idempotency-Key': key } })
        if (getSessionGeneration() !== generation || useAuthStore.getState().user?.id !== owner) throw new Error('Account session changed. Please try again.')
        return result
      })
    }
    return this.request<T>(path, { method: 'POST', body: payload })
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: formData })
  }
}

export const api = new ApiClient()

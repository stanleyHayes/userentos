import { checkoutRequest } from './checkoutRequests'
import { isProviderCheckout } from '../../../packages/shared/checkoutRequests'
import { AiConsentDeclined, AI_SHARING_VERSION, confirmAiSharing, needsAiConsent } from './aiConsent'
import { requestRefreshCredentials } from './refreshCredentials'
import { createSessionRequests } from './sessionRequests'
import Constants from 'expo-constants'
import { biometricCredentialVersion, saveBiometricCredential } from './credentialStorage'
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

/** Biometric sessions rotate through /auth/biometric/exchange (device-bound). */
async function attemptBiometricRefresh(refreshToken: string, version: number): Promise<boolean> {
  const credentialVersion = biometricCredentialVersion()
  // Lazy import to avoid a static module cycle (biometric.ts imports api.ts)
  const { getDeviceId } = await import('./biometric')
  const deviceId = await getDeviceId()
  if (useAuthStore.getState().sessionVersion !== version) return false
  const credentials = await requestRefreshCredentials(signal => fetch(`${BASE_URL}/auth/biometric/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, deviceId }),
    signal,
  }))
  if (!credentials || useAuthStore.getState().sessionVersion !== version) return false
  await saveBiometricCredential(credentials.refreshToken, credentialVersion, () => useAuthStore.getState().sessionVersion === version)
  if (useAuthStore.getState().sessionVersion !== version) return false
  useAuthStore.getState().updateTokens(credentials.token, credentials.refreshToken)
  return true
}

async function attemptRefresh(version: number): Promise<boolean> {
  const { refreshToken, biometricSession } = useAuthStore.getState()
  if (!refreshToken || useAuthStore.getState().sessionVersion !== version) return false

  if (biometricSession) {
    return attemptBiometricRefresh(refreshToken, version)
  }

  const credentials = await requestRefreshCredentials(signal => fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal,
  }))
  if (!credentials || useAuthStore.getState().sessionVersion !== version) return false
  // updateTokens persists the rotated pair to SecureStore.
  useAuthStore.getState().updateTokens(credentials.token, credentials.refreshToken)
  return true
}

const sessionRequest = createSessionRequests({
  session: () => ({ version: useAuthStore.getState().sessionVersion, token: useAuthStore.getState().token }),
  refresh: attemptRefresh,
  logout: () => useAuthStore.getState().logout(),
})

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    return await sessionRequest(token => fetch(`${BASE_URL}${path}`, { ...options, headers: {
      'Content-Type': 'application/json', ...((options.headers as Record<string, string>) || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    } }), !path.startsWith('/auth/')) as T
  }
  get<T>(path: string) { return this.request<T>(path) }
  async post<T>(path: string, body: unknown, options: Pick<RequestInit, 'signal'> = {}): Promise<T> {
    let payload = JSON.stringify(body)
    if (needsAiConsent(path)) {
      const session = useAuthStore.getState().sessionVersion
      if (!await confirmAiSharing(path)) throw new AiConsentDeclined()
      if (useAuthStore.getState().sessionVersion !== session) throw new Error('Account session changed. Please try again.')
      payload = JSON.stringify({ ...JSON.parse(payload), aiSharingConsent: AI_SHARING_VERSION })
    }
    if (isProviderCheckout(path, body)) {
      const origin = useAuthStore.getState()
      const owner = origin.user?.id
      if (!owner) throw new Error('Sign in before starting a payment.')
      return checkoutRequest(owner, path, payload, async (key, signal) => {
        if (useAuthStore.getState().sessionVersion !== origin.sessionVersion) throw new Error('Account session changed. Please try again.')
        const result = await this.request<T>(path, { ...options, method: 'POST', body: payload, signal, headers: { 'Idempotency-Key': key } })
        if (useAuthStore.getState().user?.id !== owner) throw new Error('Account session changed. Please try again.')
        return result
      }, options.signal ?? undefined)
    }
    return this.request<T>(path, { ...options, method: 'POST', body: payload })
  }
  patch<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }) }
  put<T>(path: string, body: unknown) { return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }) }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }) }
  async upload<T>(path: string, formData: FormData): Promise<T> {
    return await sessionRequest(token => fetch(`${BASE_URL}${path}`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData,
    }), !path.startsWith('/auth/')) as T
  }
}
export const api = new ApiClient()

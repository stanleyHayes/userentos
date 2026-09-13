import { disableBiometricCredentials } from './disableBiometric'
import * as LocalAuthentication from 'expo-local-authentication'
import { credentialStorage as SecureStore, biometricCredentialVersion, beginBiometricChange, saveBiometricCredential, clearBiometricCredential } from './credentialStorage'
import { useAuthStore } from '../stores/authStore'
import * as Application from 'expo-application'
import { Platform } from 'react-native'
import { api } from './api'

const BIOMETRIC_ENABLED_KEY = 'rentos_biometric_enabled'
const BIOMETRIC_REFRESH_KEY = 'rentos_biometric_refresh_v2'
const DEVICE_ID_KEY = 'rentos_device_id'

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none'

export interface BiometricCapability {
  hasHardware: boolean
  isEnrolled: boolean
  available: boolean
  types: BiometricType[]
  primary: BiometricType
}

/**
 * Detect what the device supports.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, supported] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ])
    const types: BiometricType[] = []
    if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) types.push('fingerprint')
    if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) types.push('face')
    if (supported.includes(LocalAuthentication.AuthenticationType.IRIS)) types.push('iris')
    return {
      hasHardware,
      isEnrolled,
      available: hasHardware && isEnrolled,
      types,
      primary: types[0] ?? 'none',
    }
  } catch {
    return { hasHardware: false, isEnrolled: false, available: false, types: [], primary: 'none' }
  }
}

/**
 * Prompt the user to authenticate with biometrics.
 * Returns true on success, false on cancel/failure.
 */
export async function authenticateWithBiometric(reason = 'Sign in to RentOS'): Promise<boolean> {
  try {
    const cap = await getBiometricCapability()
    if (!cap.available) return false
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    })
    return result.success
  } catch {
    return false
  }
}

/**
 * Whether the user has opted in to biometric login on this device.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)
    return v === '1'
  } catch {
    return false
  }
}

/**
 * Stable per-install device identifier. Generated once and persisted.
 * Falls back to a random uuid if the platform doesn't expose one.
 */
export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null)
  if (id) return id
  try {
    if (Platform.OS === 'ios') {
      id = (await Application.getIosIdForVendorAsync()) ?? null
    } else if (Platform.OS === 'android') {
      id = Application.getAndroidId() ?? null
    }
  } catch { /* fall through */ }
  if (!id) {
    // Fallback: random uuid
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
  }
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id).catch(() => {})
  return id
}

/**
 * Best-effort device label for the user's device list.
 */
export function getDeviceLabel(): string {
  const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'
  const model = (Application as unknown as Record<string, unknown>).nativeApplicationVersion ?? ''
  const name = (Application as unknown as Record<string, unknown>).applicationName ?? 'RentOS'
  return `${name} on ${platform}${model ? ` ${model}` : ''}`
}

/**
 * Enroll this device — REQUIRES the user's current password (re-auth): the
 * server refuses enrollment from a bare session token, so a stolen JWT can't
 * mint a long-lived biometric token. Calls the server with the session JWT
 * (attached by `api`) and stores the returned refresh token in SecureStore.
 */
export async function enableBiometricLogin(password: string): Promise<void> {
  const version = beginBiometricChange()
  const session = useAuthStore.getState().sessionVersion
  const deviceId = await getDeviceId()
  const deviceLabel = getDeviceLabel()
  if (useAuthStore.getState().sessionVersion !== session) throw new Error('Account session changed')
  const data = await api.post<{ refreshToken: string; expiresAt: string }>('/auth/biometric/enroll', {
    deviceId,
    deviceLabel,
    password,
  })
  await saveBiometricCredential(data.refreshToken, version, () => useAuthStore.getState().sessionVersion === session, true)
}

/**
 * Disable biometric login on this device — best-effort revoke server-side too.
 */
export async function disableBiometricLogin(): Promise<{ serverRevoked: boolean }> {
  // Invalidate older enrollment/rotation work immediately, before the network.
  return disableBiometricCredentials(clearBiometricCredential, () => api.post('/auth/biometric/revoke-all', {}))
}

/**
 * Read the stored refresh token — only call after a successful biometric prompt.
 */
export async function readStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_REFRESH_KEY)
  } catch {
    return null
  }
}

/**
 * Exchange a refresh token for a fresh session JWT + a NEW refresh token (rotation).
 * Persists the new refresh token before returning.
 */
export interface BiometricExchangeResult {
  user: Record<string, unknown>
  token: string
  refreshToken: string
  refreshExpiresAt: string
}

export async function exchangeRefreshToken(refreshToken: string): Promise<BiometricExchangeResult> {
  const version = biometricCredentialVersion()
  const session = useAuthStore.getState().sessionVersion
  const deviceId = await getDeviceId()
  if (useAuthStore.getState().sessionVersion !== session) throw new Error('Account session changed')
  const data = await api.post<BiometricExchangeResult>('/auth/biometric/exchange', {
    refreshToken,
    deviceId,
  })
  // Persist the rotated refresh token immediately
  await saveBiometricCredential(data.refreshToken, version, () => useAuthStore.getState().sessionVersion === session)
  return data
}

/**
 * Convenience: returns the icon name for the device's primary biometric.
 */
export function biometricIconName(t: BiometricType): 'finger-print' | 'scan' | 'eye' | 'lock-closed' {
  switch (t) {
    case 'fingerprint': return 'finger-print'
    case 'face': return 'scan'
    case 'iris': return 'eye'
    default: return 'lock-closed'
  }
}

/**
 * Convenience: returns the human-readable label for the device's primary biometric.
 */
export function biometricLabel(t: BiometricType): string {
  switch (t) {
    case 'fingerprint': return 'Fingerprint'
    case 'face': return 'Face ID'
    case 'iris': return 'Iris'
    default: return 'Biometric'
  }
}

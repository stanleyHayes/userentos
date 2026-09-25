import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { api } from './api'
import { useAuthStore } from '../stores/authStore'
import { notifyPushOptIn, registerSessionPush, resolvePushPermission } from './pushSession'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1e3a5f',
  })
}

async function getProjectId(): Promise<string | undefined> {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  )
}

/**
 * Register this device for push — only if notification permission is already
 * granted. Signing in never triggers the OS prompt; that happens in context via
 * requestPushPermissionInContext() (see components/PushPermissionPrompt).
 */
export async function registerForPushNotifications(isActive: () => boolean = () => true): Promise<string | null> {
  const origin = useAuthStore.getState()
  const isCurrent = () => isActive() && origin.isAuthenticated && useAuthStore.getState().isAuthenticated && useAuthStore.getState().sessionVersion === origin.sessionVersion && useAuthStore.getState().user?.id === origin.user?.id
  return registerSessionPush(isCurrent, async () => {
    if (!Device.isDevice) return null
    await ensureAndroidChannel()
    if (!isCurrent()) return null
    if (!await resolvePushPermission(isCurrent, () => Notifications.getPermissionsAsync())) return null
    const projectId = await getProjectId()
    if (!isCurrent()) return null
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    return tokenData.data || null
  }, token => api.post('/push/register', { token, platform: 'expo' }))
}

export type PushPermissionState = 'unsupported' | 'granted' | 'undetermined' | 'blocked'

/** Current notification permission, for deciding whether to show the pre-prompt. */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported'
  try {
    const settings = await Notifications.getPermissionsAsync()
    if (settings.status === 'granted') return 'granted'
    return settings.canAskAgain === false ? 'blocked' : 'undetermined'
  } catch {
    return 'unsupported'
  }
}

/**
 * Show the OS permission prompt after the user opted in from the pre-prompt.
 * On success the signed-in session registers its token (usePushNotifications
 * listens for the opt-in and re-runs its session-guarded registration).
 */
export async function requestPushPermissionInContext(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false
  try {
    // Android 13+: the channel must exist for the permission request to show.
    await ensureAndroidChannel()
    const granted = await resolvePushPermission(() => true, () => Notifications.getPermissionsAsync(), () => Notifications.requestPermissionsAsync())
    if (granted) notifyPushOptIn()
    return granted
  } catch {
    return false
  }
}

export async function unregisterPushToken(token: string, sessionVersion: number): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated || useAuthStore.getState().sessionVersion !== sessionVersion) return
  try { await api.post('/push/unregister', { token }) } catch { /* best effort */ }
}

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { AppState, Platform } from 'react-native'
import Constants from 'expo-constants'
import { api } from './api'
import { getSocket } from './socket'
import { useAuthStore } from '../stores/authStore'
import { notifyPushOptIn, registerSessionPush, rememberRegisteredPushToken, resolvePushPermission } from './pushSession'
import { foregroundPresentation } from './notificationPresentation'

// In the foreground, a notice the socket already showed as a toast is not
// bannered a second time (see foregroundPresentation).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => foregroundPresentation({
    appState: AppState.currentState,
    socketConnected: getSocket()?.connected === true,
    data: notification.request.content.data,
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
  const token = await registerSessionPush(isCurrent, async () => {
    if (!Device.isDevice) return null
    await ensureAndroidChannel()
    if (!isCurrent()) return null
    if (!await resolvePushPermission(isCurrent, () => Notifications.getPermissionsAsync())) return null
    const projectId = await getProjectId()
    if (!isCurrent()) return null
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    return tokenData.data || null
  }, token => api.post('/push/register', { token, platform: 'expo' }))
  // Sent with the sign-out request, which removes this registration.
  if (token) rememberRegisteredPushToken(token)
  return token
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

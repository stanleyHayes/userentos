import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { api } from './api'
import { useAuthStore } from '../stores/authStore'
import { registerSessionPush } from './pushSession'

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

export async function registerForPushNotifications(isActive: () => boolean = () => true): Promise<string | null> {
  const origin = useAuthStore.getState()
  const isCurrent = () => isActive() && origin.isAuthenticated && useAuthStore.getState().isAuthenticated && useAuthStore.getState().sessionVersion === origin.sessionVersion && useAuthStore.getState().user?.id === origin.user?.id
  return registerSessionPush(isCurrent, async () => {
    if (!Device.isDevice) return null
    await ensureAndroidChannel()
    if (!isCurrent()) return null
    const settings = await Notifications.getPermissionsAsync()
    if (!isCurrent()) return null
    let status = settings.status
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync()
      if (!isCurrent()) return null
      status = req.status
    }
    if (status !== 'granted') return null
    const projectId = await getProjectId()
    if (!isCurrent()) return null
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    return tokenData.data || null
  }, token => api.post('/push/register', { token, platform: 'expo' }))
}

export async function unregisterPushToken(token: string, sessionVersion: number): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated || useAuthStore.getState().sessionVersion !== sessionVersion) return
  try { await api.post('/push/unregister', { token }) } catch { /* best effort */ }
}

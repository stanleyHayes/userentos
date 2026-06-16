import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { api } from './api'

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

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null
  await ensureAndroidChannel()

  const settings = await Notifications.getPermissionsAsync()
  let status = settings.status
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') return null

  const projectId = await getProjectId()
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )
  const token = tokenData.data
  if (!token) return null

  try {
    await api.post('/push/register', { token, platform: 'expo' })
  } catch {
    // best-effort — server unreachable shouldn't block app boot
  }
  return token
}

export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await api.post('/push/unregister', { token })
  } catch {
    // best-effort
  }
}

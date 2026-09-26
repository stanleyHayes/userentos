import { useNotificationStore } from './notificationStore'
import { credentialStorage } from '../lib/credentialStorage'
import { suppressBiometricAutoPrompt } from '../lib/biometricAutoPrompt'
import { createAuthStore } from '../lib/authState'

export type { User } from '../lib/authState'

export const useAuthStore = createAuthStore({
  storage: credentialStorage,
  resetNotifications: () => useNotificationStore.getState().reset(),
  sessionActive: suppressBiometricAutoPrompt,
})

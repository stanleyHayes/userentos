import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createCheckoutRequests } from '../../../packages/shared/checkoutRequests'

async function browserLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  return await navigator.locks.request(key, work)
}

export const checkoutRequest = createCheckoutRequests({
  digest: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  randomId: () => Crypto.randomUUID(),
  read: async key => Platform.OS === 'web' ? localStorage.getItem(key) : SecureStore.getItemAsync(key),
  write: async (key, value) => { if (Platform.OS === 'web') localStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value) },
  remove: async key => { if (Platform.OS === 'web') localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key) },
  lock: Platform.OS === 'web' ? browserLock : undefined,
})

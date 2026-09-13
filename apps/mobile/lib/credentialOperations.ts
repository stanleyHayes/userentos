import { createSerialOperations } from './serialOperations'
export function createCredentialOperations(SecureStore: { getItemAsync: (key: string) => Promise<string | null>; setItemAsync: (key: string, value: string) => Promise<void>; deleteItemAsync: (key: string) => Promise<void> }) {
  const run = createSerialOperations()
  const credentialStorage = {
    getItemAsync: (key: string) => run(() => SecureStore.getItemAsync(key)),
    setItemAsync: (key: string, value: string) => run(() => SecureStore.setItemAsync(key, value)),
    deleteItemAsync: (key: string) => run(() => SecureStore.deleteItemAsync(key)),
  }
  const REFRESH_KEY = 'rentos_biometric_refresh_v2'
  const ENABLED_KEY = 'rentos_biometric_enabled'
  let biometricVersion = 0
  function biometricCredentialVersion() { return biometricVersion }
  function beginBiometricChange() { return ++biometricVersion }
  function saveBiometricCredential(token: string, version: number, current: () => boolean, enable = false) {
    return run(async () => {
      if (version !== biometricVersion || !current()) throw new Error('Biometric operation was superseded. Please try again.')
      try {
        await SecureStore.setItemAsync(REFRESH_KEY, token)
        if (enable) await SecureStore.setItemAsync(ENABLED_KEY, '1')
        if (version !== biometricVersion || !current()) throw new Error('Biometric operation was superseded. Please try again.')
      } catch (error) {
        // No newer credential write can run inside this serialized operation.
        // Remove partial/stale credentials before allowing the queue to advance.
        await Promise.allSettled([SecureStore.deleteItemAsync(REFRESH_KEY), SecureStore.deleteItemAsync(ENABLED_KEY)])
        throw error
      }
    })
  }
  function clearBiometricCredential() {
    beginBiometricChange()
    return run(async () => {
      // Attempt both deletions even when the first fails; callers retain failure.
      const results = await Promise.allSettled([SecureStore.deleteItemAsync(REFRESH_KEY), SecureStore.deleteItemAsync(ENABLED_KEY)])
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })
  }

  return { credentialStorage, biometricCredentialVersion, beginBiometricChange, saveBiometricCredential, clearBiometricCredential }
}

import * as SecureStore from 'expo-secure-store'
import { createCredentialOperations } from './credentialOperations'
export const { credentialStorage, biometricCredentialVersion, beginBiometricChange, saveBiometricCredential, clearBiometricCredential } = createCredentialOperations(SecureStore, {
  afterFirstUnlock: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  whenUnlocked: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
})

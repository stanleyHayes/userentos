import * as SecureStore from 'expo-secure-store'
import { createCredentialOperations } from './credentialOperations'
export const { credentialStorage, biometricCredentialVersion, beginBiometricChange, saveBiometricCredential, clearBiometricCredential } = createCredentialOperations(SecureStore)

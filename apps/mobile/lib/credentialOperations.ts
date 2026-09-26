import { createSerialOperations } from './serialOperations'
import { minimalSessionRecord } from './sessionRecord'

export interface KeychainOptions { keychainAccessible?: number }
export interface SecureStoreLike {
  getItemAsync: (key: string, options?: KeychainOptions) => Promise<string | null>
  setItemAsync: (key: string, value: string, options?: KeychainOptions) => Promise<void>
  deleteItemAsync: (key: string, options?: KeychainOptions) => Promise<void>
}
/** iOS keychain classes (expo-secure-store constants; ignored on Android). */
export interface KeychainClasses { afterFirstUnlock?: number; whenUnlocked?: number }

export type CredentialName = 'session' | 'deviceId' | 'biometricRefresh' | 'biometricEnabled'

interface Entry { key: string; legacyKey: string; accessible?: number; convert?: (legacy: string) => string | null }

/**
 * Every credential read and write, serialised through one queue.
 *
 * Keychain classes: the session and the device id are readable after the
 * first unlock, so a token rotated while the phone is locked is still saved
 * and a locked-phone launch still finds the session; the biometric refresh
 * token only while unlocked. All are this-device-only, so they never move to
 * another phone in an encrypted backup (the device id carries the server's
 * biometric device binding).
 *
 * Migration: the items written before this used the default class, and an
 * iOS keychain update never changes an item's class. Each credential
 * therefore moved to a new key: the first read copies the legacy value
 * across (the session trimmed to its minimal record, lib/sessionRecord.ts),
 * then deletes the legacy item. The copy is written before the delete, so a
 * failure part-way leaves a readable credential and nobody is signed out.
 */
export function createCredentialOperations(SecureStore: SecureStoreLike, classes: KeychainClasses = {}) {
  const run = createSerialOperations()
  const entries: Record<CredentialName, Entry> = {
    session: { key: 'rentos_session', legacyKey: 'rentos_auth', accessible: classes.afterFirstUnlock, convert: minimalSessionRecord },
    deviceId: { key: 'rentos_device_id_v2', legacyKey: 'rentos_device_id', accessible: classes.afterFirstUnlock },
    biometricRefresh: { key: 'rentos_biometric_refresh_v3', legacyKey: 'rentos_biometric_refresh_v2', accessible: classes.whenUnlocked },
    biometricEnabled: { key: 'rentos_biometric_enabled_v2', legacyKey: 'rentos_biometric_enabled', accessible: classes.whenUnlocked },
  }
  const migrated = new Set<CredentialName>()
  const options = (entry: Entry): KeychainOptions | undefined => entry.accessible === undefined ? undefined : { keychainAccessible: entry.accessible }

  // These three run inside the queue only.
  async function read(name: CredentialName) {
    const entry = entries[name]
    let value = await SecureStore.getItemAsync(entry.key, options(entry))
    if (!migrated.has(name)) {
      const legacy = await SecureStore.getItemAsync(entry.legacyKey)
      if (legacy !== null) {
        if (value === null) {
          const converted = entry.convert ? entry.convert(legacy) : legacy
          if (converted !== null) {
            await SecureStore.setItemAsync(entry.key, converted, options(entry))
            value = converted
          }
        }
        await SecureStore.deleteItemAsync(entry.legacyKey)
      }
      migrated.add(name)
    }
    return value
  }
  async function write(name: CredentialName, value: string) {
    const entry = entries[name]
    await SecureStore.setItemAsync(entry.key, value, options(entry))
    // The new value wins over any legacy one; a failed delete is retried by the next read.
    if (!migrated.has(name)) await SecureStore.deleteItemAsync(entry.legacyKey).then(() => { migrated.add(name) }, () => {})
  }
  async function remove(...names: CredentialName[]) {
    // Attempt every deletion even when one fails; callers retain the failure.
    const results = await Promise.allSettled(names.flatMap(name => [SecureStore.deleteItemAsync(entries[name].key, options(entries[name])), SecureStore.deleteItemAsync(entries[name].legacyKey)]))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    for (const name of names) migrated.add(name)
  }

  const credentialStorage = {
    getItemAsync: (name: CredentialName) => run(() => read(name)),
    setItemAsync: (name: CredentialName, value: string) => run(() => write(name, value)),
    deleteItemAsync: (name: CredentialName) => run(() => remove(name)),
  }
  let biometricVersion = 0
  function biometricCredentialVersion() { return biometricVersion }
  function beginBiometricChange() { return ++biometricVersion }
  function saveBiometricCredential(token: string, version: number, current: () => boolean, enable = false) {
    return run(async () => {
      if (version !== biometricVersion || !current()) throw new Error('Biometric operation was superseded. Please try again.')
      try {
        await write('biometricRefresh', token)
        if (enable) await write('biometricEnabled', '1')
        if (version !== biometricVersion || !current()) throw new Error('Biometric operation was superseded. Please try again.')
      } catch (error) {
        // No newer credential write can run inside this serialized operation.
        // Remove partial/stale credentials before allowing the queue to advance.
        await remove('biometricRefresh', 'biometricEnabled').catch(() => {})
        throw error
      }
    })
  }
  function clearBiometricCredential() {
    beginBiometricChange()
    return run(() => remove('biometricRefresh', 'biometricEnabled'))
  }

  return { credentialStorage, biometricCredentialVersion, beginBiometricChange, saveBiometricCredential, clearBiometricCredential }
}

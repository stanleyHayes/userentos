import { test, expect } from '@playwright/test'
import { createCredentialOperations } from '../../apps/mobile/lib/credentialOperations.js'
function fixture() {
  const data = new Map<string, string>()
  const store = { getItemAsync: async (key: string) => data.get(key) ?? null, setItemAsync: async (key: string, value: string) => { data.set(key, value) }, deleteItemAsync: async (key: string) => { data.delete(key) } }
  return { data, store }
}
const refreshKey = 'rentos_biometric_refresh_v2'
test('logout deletion and new login follow a slow earlier write, and reads see the winner', async () => {
  const { data, store } = fixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const base = store.setItemAsync
  store.setItemAsync = async (key, value) => { if (value === 'old') await gate; await base(key, value) }
  const { credentialStorage } = createCredentialOperations(store)
  const old = credentialStorage.setItemAsync('auth', 'old')
  const logout = credentialStorage.deleteItemAsync('auth')
  const login = credentialStorage.setItemAsync('auth', 'new')
  const read = credentialStorage.getItemAsync('auth')
  release(); await Promise.all([old, logout, login])
  expect(await read).toBe('new')
  expect(data.get('auth')).toBe('new')
})
test('a failed write does not stop later deletion', async () => {
  const { data, store } = fixture(); data.set('auth', 'old')
  store.setItemAsync = async () => { throw new Error('storage failed') }
  const { credentialStorage } = createCredentialOperations(store)
  const failed = credentialStorage.setItemAsync('auth', 'bad')
  const deleted = credentialStorage.deleteItemAsync('auth')
  await expect(failed).rejects.toThrow('storage failed'); await deleted
  expect(data.has('auth')).toBe(false)
})
test('disable invalidates a late enrollment and both biometric keys are deleted', async () => {
  const { data, store } = fixture()
  const manager = createCredentialOperations(store)
  const version = manager.beginBiometricChange()
  await manager.clearBiometricCredential()
  await expect(manager.saveBiometricCredential('late', version, () => true, true)).rejects.toThrow('superseded')
  expect(data.size).toBe(0)
})
test('account changes while persistence is in flight reject biometric completion and newer writes win', async () => {
  const { data, store } = fixture()
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  const base = store.setItemAsync
  store.setItemAsync = async (key, value) => { if (value === 'old') { entered(); await gate }; await base(key, value) }
  const manager = createCredentialOperations(store)
  let current = true
  const old = manager.saveBiometricCredential('old', manager.beginBiometricChange(), () => current, true)
  const rejection = expect(old).rejects.toThrow('superseded')
  await started; current = false
  const newer = manager.saveBiometricCredential('new', manager.beginBiometricChange(), () => true, true)
  release(); await rejection; await newer
  expect(data.get(refreshKey)).toBe('new')
  expect(data.get('rentos_biometric_enabled')).toBe('1')
})
test('disable attempts both key deletions and reports a storage failure', async () => {
  const { store } = fixture(); const deleted: string[] = []
  store.deleteItemAsync = async key => { deleted.push(key); if (key === refreshKey) throw new Error('locked storage') }
  const manager = createCredentialOperations(store)
  await expect(manager.clearBiometricCredential()).rejects.toThrow('locked storage')
  expect(deleted).toEqual([refreshKey, 'rentos_biometric_enabled'])
})

test('biometric disable distinguishes local success from unconfirmed server revocation', async () => {
  const { disableBiometricCredentials } = await import('../../apps/mobile/lib/disableBiometric.js')
  let cleared = false
  expect(await disableBiometricCredentials(async () => { cleared = true }, async () => { throw new Error('offline') })).toEqual({ serverRevoked: false })
  expect(cleared).toBe(true)
  expect(await disableBiometricCredentials(async () => {}, async () => {})).toEqual({ serverRevoked: true })
  await expect(disableBiometricCredentials(async () => { throw new Error('keychain unavailable') }, async () => {})).rejects.toThrow('keychain unavailable')
})

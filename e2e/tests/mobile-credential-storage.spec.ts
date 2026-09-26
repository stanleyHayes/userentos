import { test, expect } from '@playwright/test'
import { createCredentialOperations, type KeychainOptions } from '../../apps/mobile/lib/credentialOperations.js'
import { parseSession, serializeSession } from '../../apps/mobile/lib/sessionRecord.js'
function fixture() {
  const data = new Map<string, string>()
  const classes = new Map<string, number | undefined>()
  const store = {
    getItemAsync: async (key: string, _options?: KeychainOptions) => data.get(key) ?? null,
    setItemAsync: async (key: string, value: string, options?: KeychainOptions) => { data.set(key, value); classes.set(key, options?.keychainAccessible) },
    deleteItemAsync: async (key: string, _options?: KeychainOptions) => { data.delete(key); classes.delete(key) },
  }
  return { data, classes, store }
}
const refreshKey = 'rentos_biometric_refresh_v3'
const enabledKey = 'rentos_biometric_enabled_v2'
const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1
const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 5
const keychain = { afterFirstUnlock: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, whenUnlocked: WHEN_UNLOCKED_THIS_DEVICE_ONLY }
test('logout deletion and new login follow a slow earlier write, and reads see the winner', async () => {
  const { data, store } = fixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const base = store.setItemAsync
  store.setItemAsync = async (key, value, options) => { if (value === 'old') await gate; await base(key, value, options) }
  const { credentialStorage } = createCredentialOperations(store)
  const old = credentialStorage.setItemAsync('session', 'old')
  const logout = credentialStorage.deleteItemAsync('session')
  const login = credentialStorage.setItemAsync('session', 'new')
  const read = credentialStorage.getItemAsync('session')
  release(); await Promise.all([old, logout, login])
  expect(await read).toBe('new')
  expect(data.get('rentos_session')).toBe('new')
})
test('a failed write does not stop later deletion', async () => {
  const { data, store } = fixture(); data.set('rentos_session', 'old')
  store.setItemAsync = async () => { throw new Error('storage failed') }
  const { credentialStorage } = createCredentialOperations(store)
  const failed = credentialStorage.setItemAsync('session', 'bad')
  const deleted = credentialStorage.deleteItemAsync('session')
  await expect(failed).rejects.toThrow('storage failed'); await deleted
  expect(data.has('rentos_session')).toBe(false)
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
  store.setItemAsync = async (key, value, options) => { if (value === 'old') { entered(); await gate }; await base(key, value, options) }
  const manager = createCredentialOperations(store)
  let current = true
  const old = manager.saveBiometricCredential('old', manager.beginBiometricChange(), () => current, true)
  const rejection = expect(old).rejects.toThrow('superseded')
  await started; current = false
  const newer = manager.saveBiometricCredential('new', manager.beginBiometricChange(), () => true, true)
  release(); await rejection; await newer
  expect(data.get(refreshKey)).toBe('new')
  expect(data.get(enabledKey)).toBe('1')
})
test('disable attempts every biometric key deletion and reports a storage failure', async () => {
  const { store } = fixture(); const deleted: string[] = []
  store.deleteItemAsync = async key => { deleted.push(key); if (key === refreshKey) throw new Error('locked storage') }
  const manager = createCredentialOperations(store)
  await expect(manager.clearBiometricCredential()).rejects.toThrow('locked storage')
  expect(deleted).toEqual([refreshKey, 'rentos_biometric_refresh_v2', enabledKey, 'rentos_biometric_enabled'])
})

test('biometric disable distinguishes local success from unconfirmed server revocation', async () => {
  const { disableBiometricCredentials } = await import('../../apps/mobile/lib/disableBiometric.js')
  let cleared = false
  expect(await disableBiometricCredentials(async () => { cleared = true }, async () => { throw new Error('offline') })).toEqual({ serverRevoked: false })
  expect(cleared).toBe(true)
  expect(await disableBiometricCredentials(async () => {}, async () => {})).toEqual({ serverRevoked: true })
  await expect(disableBiometricCredentials(async () => { throw new Error('keychain unavailable') }, async () => {})).rejects.toThrow('keychain unavailable')
})

test.describe('keychain classes and the one-time migration', () => {
  test('session and device id are readable after first unlock; the biometric token only while unlocked', async () => {
    const { classes, store } = fixture()
    const manager = createCredentialOperations(store, keychain)
    await manager.credentialStorage.setItemAsync('session', 'record')
    await manager.credentialStorage.setItemAsync('deviceId', 'device-1')
    await manager.saveBiometricCredential('bio', manager.beginBiometricChange(), () => true, true)
    expect(classes.get('rentos_session')).toBe(AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY)
    expect(classes.get('rentos_device_id_v2')).toBe(AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY)
    expect(classes.get(refreshKey)).toBe(WHEN_UNLOCKED_THIS_DEVICE_ONLY)
    expect(classes.get(enabledKey)).toBe(WHEN_UNLOCKED_THIS_DEVICE_ONLY)
  })

  test('an updated app keeps the user signed in: the legacy session is trimmed, rewritten in the new class, then deleted', async () => {
    const { data, classes, store } = fixture()
    const legacy = JSON.stringify({
      user: { id: 'user-1', firstName: 'Ama', ghanaCardId: 'GHA-123456789-0', consents: { userAgent: 'private' }, subscriptionSnapshotJson: '{"big":true}' },
      token: 'access-1', refreshToken: 'refresh-1', biometricSession: true,
    })
    data.set('rentos_auth', legacy)
    data.set('rentos_device_id', 'device-legacy')
    data.set('rentos_biometric_refresh_v2', 'bio-legacy')
    data.set('rentos_biometric_enabled', '1')
    const order: string[] = []
    const set = store.setItemAsync, del = store.deleteItemAsync
    store.setItemAsync = async (key, value, options) => { order.push(`set ${key}`); await set(key, value, options) }
    store.deleteItemAsync = async (key, options) => { order.push(`delete ${key}`); await del(key, options) }
    const { credentialStorage } = createCredentialOperations(store, keychain)

    const session = parseSession(await credentialStorage.getItemAsync('session'))
    expect(session).toEqual({ userId: 'user-1', token: 'access-1', refreshToken: 'refresh-1', biometricSession: true })
    // Written before the legacy item goes, so a failure in between loses nothing.
    expect(order).toEqual(['set rentos_session', 'delete rentos_auth'])
    expect(data.has('rentos_auth')).toBe(false)
    expect(classes.get('rentos_session')).toBe(AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY)
    // Only the id and credentials remain on the device.
    expect(data.get('rentos_session')).not.toMatch(/Ama|GHA-|private|big/)
    expect(data.get('rentos_session')!.length).toBeLessThan(2048)

    expect(await credentialStorage.getItemAsync('deviceId')).toBe('device-legacy')
    expect(await credentialStorage.getItemAsync('biometricRefresh')).toBe('bio-legacy')
    expect(await credentialStorage.getItemAsync('biometricEnabled')).toBe('1')
    expect([...data.keys()].sort()).toEqual(['rentos_biometric_enabled_v2', 'rentos_biometric_refresh_v3', 'rentos_device_id_v2', 'rentos_session'])
    expect(classes.get('rentos_biometric_refresh_v3')).toBe(WHEN_UNLOCKED_THIS_DEVICE_ONLY)

    // Later reads do not look at legacy keys again.
    order.length = 0
    await credentialStorage.getItemAsync('session')
    expect(order).toEqual([])
  })

  test('a locked keychain aborts the migration without deleting anything, and the next launch retries', async () => {
    const { data, store } = fixture()
    data.set('rentos_auth', JSON.stringify({ user: { id: 'user-1' }, token: 'access-1', refreshToken: 'refresh-1' }))
    const get = store.getItemAsync
    let locked = true
    store.getItemAsync = async (key, options) => { if (locked && key === 'rentos_auth') throw new Error('User interaction is not allowed'); return get(key, options) }
    const first = createCredentialOperations(store, keychain)
    await expect(first.credentialStorage.getItemAsync('session')).rejects.toThrow('not allowed')
    expect(data.has('rentos_auth')).toBe(true)
    expect(data.has('rentos_session')).toBe(false)
    locked = false
    const relaunch = createCredentialOperations(store, keychain)
    expect(parseSession(await relaunch.credentialStorage.getItemAsync('session'))?.userId).toBe('user-1')
  })

  test('a newer value wins over a leftover legacy one, and an unusable legacy session is dropped', async () => {
    const { data, store } = fixture()
    data.set('rentos_session', serializeSession({ userId: 'user-2', token: 'new', refreshToken: null, biometricSession: false }))
    data.set('rentos_auth', JSON.stringify({ user: { id: 'user-1' }, token: 'old' }))
    data.set('rentos_device_id', 'device-legacy')
    const { credentialStorage } = createCredentialOperations(store, keychain)
    expect(parseSession(await credentialStorage.getItemAsync('session'))?.token).toBe('new')
    expect(data.has('rentos_auth')).toBe(false)
    // A login before any read also retires the legacy item.
    await credentialStorage.setItemAsync('deviceId', 'device-new')
    expect(data.has('rentos_device_id')).toBe(false)
    expect(await credentialStorage.getItemAsync('deviceId')).toBe('device-new')

    const broken = fixture()
    broken.data.set('rentos_auth', '{"user":{"id":"user-1"}}')
    const other = createCredentialOperations(broken.store, keychain)
    expect(await other.credentialStorage.getItemAsync('session')).toBeNull()
    expect(broken.data.size).toBe(0)
  })

  test('logout removes the session under both keys', async () => {
    const { data, store } = fixture()
    data.set('rentos_auth', '{"user":{"id":"u"},"token":"t"}')
    data.set('rentos_session', '{"userId":"u","token":"t"}')
    const { credentialStorage } = createCredentialOperations(store, keychain)
    await credentialStorage.deleteItemAsync('session')
    expect(data.size).toBe(0)
  })
})

test('the stored session record is minimal and reads both shapes', () => {
  expect(JSON.parse(serializeSession({ userId: 'u1', token: 't', refreshToken: 'r', biometricSession: false }))).toEqual({ userId: 'u1', token: 't', refreshToken: 'r', biometricSession: false })
  expect(parseSession('{"userId":"u1","token":"t","refreshToken":"r","biometricSession":true}')).toEqual({ userId: 'u1', token: 't', refreshToken: 'r', biometricSession: true })
  expect(parseSession('{"user":{"id":"u1","email":"x"},"token":"t"}')).toEqual({ userId: 'u1', token: 't', refreshToken: null, biometricSession: false })
  for (const raw of [null, '', 'not json', '{"token":"t"}', '{"userId":"u1"}', '{"userId":"u1","token":""}']) expect(parseSession(raw)).toBeNull()
})

import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/authService.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { RefreshToken, hashRefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { RevokedSession } from '../models/RevokedSession.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn(), notifyWelcome: vi.fn() }))

/*
 * A signed-out phone must stop receiving the account's notifications. The app
 * sends its push token with /auth/logout; only the token holder's own
 * registration goes, and the account's other devices keep theirs.
 */
describe.skipIf(!hasTestMongo)('logout removes this device push registration', () => {
  const owners: string[] = []
  const service = new AuthService({} as never, {} as never, { info: vi.fn(), warn: vi.fn() } as never)
  beforeAll(async () => { await mongoose.connect(testMongoUri) })
  afterAll(async () => {
    const filter = { userId: { $in: owners } }
    await Promise.all([DeviceToken.deleteMany(filter), RefreshToken.deleteMany(filter), BiometricToken.deleteMany(filter), RevokedSession.deleteMany({ sid: { $in: owners.map(id => `family-${id}`) } })])
    await mongoose.disconnect()
  })

  async function fixture() {
    const userId = new mongoose.Types.ObjectId().toString()
    const otherId = new mongoose.Types.ObjectId().toString()
    owners.push(userId, otherId)
    const expiresAt = new Date(Date.now() + 3600000)
    await DeviceToken.create([
      { userId, token: `ExponentPushToken[${userId}-phone]`, platform: 'expo' },
      { userId, token: `ExponentPushToken[${userId}-tablet]`, platform: 'expo' },
      { userId: otherId, token: `ExponentPushToken[${otherId}-phone]`, platform: 'expo' },
    ])
    const password = `${userId}-refresh`
    const biometric = `${userId}-biometric`
    await RefreshToken.create({ userId, tokenHash: hashRefreshToken(password), familyId: `family-${userId}`, expiresAt })
    await BiometricToken.create({ userId, tokenHash: hashRefreshToken(biometric), deviceId: 'fixture-device', familyId: `bio-${userId}`, expiresAt })
    return { userId, otherId, password, biometric }
  }

  it('a password session deletes only the presented token of its own account', async () => {
    const { userId, otherId, password } = await fixture()
    await service.logout(password, `ExponentPushToken[${userId}-phone]`)
    expect(await DeviceToken.exists({ token: `ExponentPushToken[${userId}-phone]` })).toBeNull()
    expect(await DeviceToken.countDocuments({ userId })).toBe(1)
    expect(await DeviceToken.countDocuments({ userId: otherId })).toBe(1)
    expect((await RefreshToken.findOne({ userId }))?.revokedReason).toBe('logout')
  })

  it("another account's registration survives even when its token is presented", async () => {
    const { userId, otherId, password } = await fixture()
    await service.logout(password, `ExponentPushToken[${otherId}-phone]`)
    expect(await DeviceToken.countDocuments({ userId: otherId })).toBe(1)
    expect(await DeviceToken.countDocuments({ userId })).toBe(2)
  })

  it('a biometric session removes its registration and keeps the biometric credential', async () => {
    const { userId, biometric } = await fixture()
    await service.logout(biometric, `ExponentPushToken[${userId}-phone]`)
    expect(await DeviceToken.exists({ token: `ExponentPushToken[${userId}-phone]` })).toBeNull()
    expect(await DeviceToken.countDocuments({ userId })).toBe(1)
    // Signing out keeps biometric sign-in available on this device.
    expect((await BiometricToken.findOne({ userId }))?.revokedAt).toBeUndefined()
  })

  it('an unknown refresh token deletes nothing', async () => {
    const { userId } = await fixture()
    await service.logout('not-a-token', `ExponentPushToken[${userId}-phone]`)
    expect(await DeviceToken.countDocuments({ userId })).toBe(2)
  })
})

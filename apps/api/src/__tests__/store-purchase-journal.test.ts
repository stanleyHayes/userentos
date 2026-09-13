import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { encryptStoreToken, decryptStoreToken } from '../services/storeBilling/tokenVault.js'
import { recordGooglePurchase, StorePurchaseConflict, storeTokenContext } from '../services/storeBilling/purchaseJournal.js'
import { StorePurchase } from '../models/StorePurchase.js'
import { User } from '../models/User.js'
import { verifyGoogleSubscription, purchaseTokenHash } from '../services/storeBilling/googlePlay.js'

vi.mock('../models/StorePurchase.js', () => ({ StorePurchase: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn(), findById: vi.fn() } }))
vi.mock('../models/User.js', () => ({ User: { findOne: vi.fn() } }))
vi.mock('../services/storeBilling/googlePlay.js', async importOriginal => ({ ...await importOriginal<object>(), verifyGoogleSubscription: vi.fn() }))
const token = 'purchase-token'
const applicationId = 'gh.rentos.mobile'
const identity = { platform: 'google', applicationId, tokenHash: purchaseTokenHash(token) }
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', applicationId)
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE', '/fixture/google.json')
  vi.mocked(User.findOne).mockReturnValue({ select: () => lean({ storeAccountToken: '9b766a49-7806-4e84-9555-f614f53c95c1' }) } as never)
  vi.mocked(StorePurchase.findOne).mockReturnValue(lean(null) as never)
  vi.mocked(verifyGoogleSubscription).mockResolvedValue({ platform: 'google', packageName: applicationId, purchaseTokenHash: identity.tokenHash,
    state: 'SUBSCRIPTION_STATE_ACTIVE', environment: 'production', acknowledged: false, startedAt: '2026-09-01T00:00:00Z',
    verifiedAt: '2026-09-13T00:00:00Z', linkedPurchaseTokenHash: null, items: [],
  })
  vi.mocked(StorePurchase.create).mockResolvedValue({ _id: 'record', tokenCiphertext: 'must not escape' } as never)
  vi.mocked(StorePurchase.findById).mockReturnValue(lean({ _id: 'record', revision: 1 }) as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('store token encryption', () => {
  it('round trips with a fresh nonce and no plaintext in ciphertext', () => {
    const encrypted = encryptStoreToken(token, 'record-context')
    expect(decryptStoreToken(encrypted, 'record-context')).toBe(token)
    expect(encrypted).not.toContain(token)
    expect(encryptStoreToken(token, 'record-context')).not.toBe(encrypted)
  })
  it('rejects a different account/application context or encryption key', () => {
    const context = storeTokenContext(applicationId, identity.tokenHash, 'user')
    const encrypted = encryptStoreToken(token, context)
    expect(() => decryptStoreToken(encrypted, storeTokenContext(applicationId, identity.tokenHash, 'other'))).toThrow()
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', 'b'.repeat(64))
    expect(() => decryptStoreToken(encrypted, context)).toThrow()
  })
  it('rejects ciphertext tampering and malformed envelopes', () => {
    const encrypted = encryptStoreToken(token, 'context')
    const parts = encrypted.split('.'); parts[2] = '0'.repeat(32)
    expect(() => decryptStoreToken(parts.join('.'), 'context')).toThrow()
    expect(() => decryptStoreToken('v2.invalid', 'context')).toThrow()
  })
  it.each(['', 'secret', 'a'.repeat(63)])('does not fall back to weak or absent key %s', key => {
    vi.stubEnv('STORE_BILLING_ENCRYPTION_KEY', key)
    expect(() => encryptStoreToken(token, 'context')).toThrow('not configured')
  })
})

describe('verified purchase journal', () => {
  it('encrypts the token and stores only the authenticated provider observation', async () => {
    const result = await recordGooglePurchase('user', token)
    const data = vi.mocked(StorePurchase.create).mock.calls[0][0] as unknown as Record<string, unknown>
    expect(data).toMatchObject({ ...identity, userId: 'user', revision: 1, providerState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: false })
    expect(decryptStoreToken(data.tokenCiphertext as string, storeTokenContext(applicationId, identity.tokenHash, 'user'))).toBe(token)
    expect(result).not.toHaveProperty('tokenCiphertext')
    expect(verifyGoogleSubscription).toHaveBeenCalledWith(token, expect.stringMatching(/^[a-f\d]{64}$/))
  })
  it('cannot claim another account’s purchase', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValue(lean({ userId: 'other', revision: 1 }) as never)
    await expect(recordGooglePurchase('user', token)).rejects.toThrow('another account')
    expect(verifyGoogleSubscription).not.toHaveBeenCalled()
    expect(StorePurchase.create).not.toHaveBeenCalled()
  })
  it('does not persist when provider verification fails', async () => {
    vi.mocked(verifyGoogleSubscription).mockRejectedValue(new Error('account_mismatch'))
    await expect(recordGooglePurchase('user', token)).rejects.toThrow('account_mismatch')
    expect(StorePurchase.create).not.toHaveBeenCalled()
  })
  it('requires an existing active account binding', async () => {
    vi.mocked(User.findOne).mockReturnValue({ select: () => lean(null) } as never)
    await expect(recordGooglePurchase('user', token)).rejects.toThrow('binding unavailable')
    expect(verifyGoogleSubscription).not.toHaveBeenCalled()
  })
  it('uses an observed revision and immutable owner for subsequent writes', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValue(lean({ userId: 'user', revision: 4 }) as never)
    vi.mocked(StorePurchase.findOneAndUpdate).mockReturnValue(lean({ revision: 5 }) as never)
    await recordGooglePurchase('user', token)
    expect(StorePurchase.findOneAndUpdate).toHaveBeenCalledWith({ ...identity, userId: 'user', revision: 4 }, expect.objectContaining({ $inc: { revision: 1 } }), expect.objectContaining({ runValidators: true }))
  })
  it('refuses a stale concurrent response instead of retrying it against a newer revision', async () => {
    vi.mocked(StorePurchase.findOne).mockReturnValue(lean({ userId: 'user', revision: 4 }) as never)
    vi.mocked(StorePurchase.findOneAndUpdate).mockReturnValue(lean(null) as never)
    await expect(recordGooglePurchase('user', token)).rejects.toBeInstanceOf(StorePurchaseConflict)
    expect(verifyGoogleSubscription).toHaveBeenCalledOnce()
  })
  it('forces re-verification if simultaneous first claims race', async () => {
    vi.mocked(StorePurchase.create).mockRejectedValue({ code: 11000 })
    await expect(recordGooglePurchase('user', token)).rejects.toBeInstanceOf(StorePurchaseConflict)
  })
})

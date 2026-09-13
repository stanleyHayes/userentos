import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Environment, Status, Type, VerificationException, VerificationStatus } from '@apple/app-store-server-library'
import { verifyAppleNotification, normalizeAppleSubscription, verifyAppleSubscription, normalizeAppleTransaction, verifyAppleTransaction } from '../services/storeBilling/appleStore.js'
const mocks = vi.hoisted(() => ({ read: vi.fn(), client: vi.fn(), verifier: vi.fn(), get: vi.fn(), decode: vi.fn(), statuses: vi.fn(), renewal: vi.fn(), notification: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }))
vi.mock('@apple/app-store-server-library', async original => ({ ...await original<object>(),
  AppStoreServerAPIClient: class { constructor(...args: unknown[]) { mocks.client(...args) } getTransactionInfo = mocks.get; getAllSubscriptionStatuses = mocks.statuses },
  SignedDataVerifier: class { constructor(...args: unknown[]) { mocks.verifier(...args) } verifyAndDecodeTransaction = mocks.decode; verifyAndDecodeRenewalInfo = mocks.renewal; verifyAndDecodeNotification = mocks.notification },
}))
const accountToken = '123e4567-e89b-42d3-a456-426614174000'
const now = new Date('2026-09-13T12:00:00Z')
const expected = { transactionId: '123456', accountToken, bundleId: 'gh.rentos.mobile', environment: Environment.PRODUCTION }
function fixture() { return { transactionId: '123456', originalTransactionId: '123400', bundleId: 'gh.rentos.mobile', productId: 'rentos.pro', type: Type.AUTO_RENEWABLE_SUBSCRIPTION, environment: Environment.PRODUCTION, appAccountToken: accountToken, inAppOwnershipType: 'PURCHASED', purchaseDate: Date.parse('2026-09-01T00:00:00Z'), originalPurchaseDate: Date.parse('2026-08-01T00:00:00Z'), expiresDate: Date.parse('2026-10-01T00:00:00Z'), signedDate: Date.parse('2026-09-01T00:00:00Z'), subscriptionGroupIdentifier: 'group' } }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('APPLE_STORE_BUNDLE_ID', 'gh.rentos.mobile')
  vi.stubEnv('APPLE_STORE_APP_ID', '1234567890')
  vi.stubEnv('APPLE_STORE_KEY_ID', 'KEY1234567')
  vi.stubEnv('APPLE_STORE_ISSUER_ID', accountToken)
  vi.stubEnv('APPLE_STORE_PRIVATE_KEY_FILE', '/fixture/private.p8')
  vi.stubEnv('APPLE_STORE_ROOT_CA_FILES', '["/fixture/apple-root.cer"]')
  vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production')
  mocks.read.mockImplementation(async (path: string) => path.endsWith('.p8') ? 'private-key' : Buffer.from('root-certificate'))
  mocks.get.mockResolvedValue({ signedTransactionInfo: 'signed-jws' })
  mocks.decode.mockResolvedValue(fixture())
})
afterEach(() => vi.unstubAllEnvs())
describe('Apple signed transaction normalization', () => {
  it('returns only transaction facts without pretending they are full subscription status', () => {
    const result = normalizeAppleTransaction({ ...fixture(), ignoredCustomerData: 'private' }, expected, now)
    expect(result).toMatchObject({ platform: 'apple', environment: 'production', transactionId: '123456', originalTransactionId: '123400', upgraded: false, revokedAt: null })
    expect(result).not.toHaveProperty('accessEligible')
    expect(JSON.stringify(result)).not.toContain(accountToken)
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('preserves revocation and upgrade facts for subsequent entitlement decisions', () => {
    expect(normalizeAppleTransaction({ ...fixture(), revocationDate: now.getTime(), isUpgraded: true }, expected, now)).toMatchObject({ revokedAt: now.toISOString(), upgraded: true })
  })
  it('rejects another account while allowing UUID letter-case normalization', () => {
    expect(() => normalizeAppleTransaction(fixture(), { ...expected, accountToken: '123e4567-e89b-42d3-a456-426614174001' }, now)).toThrow('account_mismatch')
    expect(normalizeAppleTransaction(fixture(), { ...expected, accountToken: accountToken.toUpperCase() }, now).transactionId).toBe('123456')
  })
  it.each([{ bundleId: 'other.app' }, { transactionId: '999' }, { environment: Environment.SANDBOX }, { inAppOwnershipType: 'FAMILY_SHARED' }, { type: Type.CONSUMABLE }, { appAccountToken: undefined }])('rejects unsupported or mismatched transaction identity', change => {
    expect(() => normalizeAppleTransaction({ ...fixture(), ...change }, expected, now)).toThrow('invalid_purchase')
  })
  it.each([{ purchaseDate: now.getTime() + 1000 }, { signedDate: now.getTime() + 301000 }, { originalPurchaseDate: now.getTime() }, { expiresDate: 0 }, { expiresDate: NaN }])('rejects inconsistent or malformed dates', change => {
    expect(() => normalizeAppleTransaction({ ...fixture(), ...change }, expected, now)).toThrow('invalid_purchase')
  })
})
describe('Apple authenticated provider and signature boundary', () => {
  it('uses server-owned credentials/roots and verifies the provider JWS with online checks', async () => {
    const result = await verifyAppleTransaction('123456', accountToken)
    expect(mocks.client).toHaveBeenCalledWith('private-key', 'KEY1234567', accountToken, 'gh.rentos.mobile', Environment.PRODUCTION)
    expect(mocks.verifier).toHaveBeenCalledWith([Buffer.from('root-certificate')], true, Environment.PRODUCTION, 'gh.rentos.mobile', 1234567890)
    expect(mocks.get).toHaveBeenCalledWith('123456')
    expect(mocks.decode).toHaveBeenCalledWith('signed-jws')
    expect(result.applicationId).toBe('gh.rentos.mobile')
  })
  it('rejects invalid client identifiers before loading credentials', async () => {
    await expect(verifyAppleTransaction('../other', accountToken)).rejects.toThrow('invalid_purchase')
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('requires trusted roots and sanitizes file failures', async () => {
    vi.stubEnv('APPLE_STORE_ROOT_CA_FILES', '[]')
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('configuration')
    vi.stubEnv('APPLE_STORE_ROOT_CA_FILES', '["/fixture/root"]')
    mocks.read.mockRejectedValue(new Error('secret credential path'))
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('configuration')
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it('never falls back to sandbox in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Sandbox')
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('test_purchase')
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it.each([404, 401, 429, 500])('sanitizes provider status %s', async status => {
    mocks.get.mockRejectedValue({ httpStatusCode: status, message: 'private-key', response: 'signed-jws' })
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow(status === 404 ? 'invalid_purchase' : 'provider_unavailable')
    expect(mocks.decode).not.toHaveBeenCalled()
  })
  it('classifies a signature deadline as retryable and ignores the late verification', async () => {
    vi.useFakeTimers()
    try {
      mocks.decode.mockImplementationOnce(() => new Promise(() => {}))
      const attempt = verifyAppleTransaction('123456', accountToken)
      const rejection = expect(attempt).rejects.toThrow('provider_unavailable')
      await vi.advanceTimersByTimeAsync(35001)
      await rejection
    } finally { vi.useRealTimers() }
  })
  it('rejects missing or invalid signatures and preserves retryable certificate checks', async () => {
    mocks.get.mockResolvedValueOnce({})
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('invalid_purchase')
    mocks.decode.mockRejectedValueOnce(new Error('untrusted signature'))
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('invalid_purchase')
    mocks.decode.mockRejectedValueOnce(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE))
    await expect(verifyAppleTransaction('123456', accountToken)).rejects.toThrow('provider_unavailable')
  })
})

function renewalFixture() { return { originalTransactionId: '123400', productId: 'rentos.pro', environment: Environment.PRODUCTION, signedDate: now.getTime(), autoRenewStatus: 1, gracePeriodExpiresDate: Date.parse('2026-10-03T00:00:00Z') } }
function statusFixture(status = Status.ACTIVE) { return { bundleId: expected.bundleId, appAppleId: 1234567890, environment: Environment.PRODUCTION, data: [{ subscriptionGroupIdentifier: 'group', lastTransactions: [{ originalTransactionId: '123400', status, signedTransactionInfo: 'latest-jws', signedRenewalInfo: 'renewal-jws' }] }] } }
describe('Apple current subscription access', () => {
  it.each([Status.ACTIVE, Status.BILLING_GRACE_PERIOD])('allows a currently valid status %s', status => {
    const result = normalizeAppleSubscription(normalizeAppleTransaction(fixture(), expected, now), renewalFixture(), status, now)
    expect(result.accessEligible).toBe(true)
    expect(result.accessExpiresAt).toBe(status === Status.ACTIVE ? '2026-10-01T00:00:00.000Z' : '2026-10-03T00:00:00.000Z')
  })
  it.each([Status.EXPIRED, Status.BILLING_RETRY, Status.REVOKED])('denies status %s even with a future transaction expiry', status => {
    expect(normalizeAppleSubscription(normalizeAppleTransaction(fixture(), expected, now), renewalFixture(), status, now).accessEligible).toBe(false)
  })
  it.each([undefined, now.getTime()])('denies grace without a future signed grace expiry', gracePeriodExpiresDate => {
    expect(normalizeAppleSubscription(normalizeAppleTransaction(fixture(), expected, now), { ...renewalFixture(), gracePeriodExpiresDate }, Status.BILLING_GRACE_PERIOD, now).accessEligible).toBe(false)
  })
  it.each([{ revocationDate: now.getTime() }, { isUpgraded: true }, { expiresDate: now.getTime() }])('denies overridden or expired active transactions', change => {
    expect(normalizeAppleSubscription(normalizeAppleTransaction({ ...fixture(), ...change }, expected, now), renewalFixture(), Status.ACTIVE, now).accessEligible).toBe(false)
  })
  it.each([{ originalTransactionId: '999' }, { productId: 'other' }, { environment: Environment.SANDBOX }, { signedDate: now.getTime() + 301000 }])('rejects mismatched renewal facts', change => {
    expect(() => normalizeAppleSubscription(normalizeAppleTransaction(fixture(), expected, now), { ...renewalFixture(), ...change }, Status.ACTIVE, now)).toThrow('invalid_purchase')
  })
  it('retains access after auto-renew is disabled until the paid period ends', () => {
    expect(normalizeAppleSubscription(normalizeAppleTransaction(fixture(), expected, now), { ...renewalFixture(), autoRenewStatus: 0 }, Status.ACTIVE, now)).toMatchObject({ autoRenewing: false, accessEligible: true })
  })
})
describe('Apple current chain verification boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    mocks.statuses.mockResolvedValue(statusFixture())
    mocks.decode.mockImplementation(async (signed: string) => ({ ...fixture(), transactionId: signed === 'latest-jws' ? '123457' : '123456' }))
    mocks.renewal.mockResolvedValue(renewalFixture())
  })
  afterEach(() => vi.useRealTimers())
  it('verifies both current signed payloads and follows an older owned transaction', async () => {
    expect(await verifyAppleSubscription('123456', accountToken)).toMatchObject({ transactionId: '123457', accessEligible: true })
    expect(mocks.statuses).toHaveBeenCalledWith('123456')
    expect(mocks.decode).toHaveBeenCalledWith('latest-jws')
    expect(mocks.renewal).toHaveBeenCalledWith('renewal-jws')
  })
  it('does not retain access from the historical signed receipt after revocation', async () => {
    mocks.statuses.mockResolvedValue(statusFixture(Status.REVOKED))
    expect(await verifyAppleSubscription('123456', accountToken)).toMatchObject({ accessEligible: false, status: Status.REVOKED })
  })
  it.each([{ bundleId: 'other' }, { appAppleId: 1 }, { environment: Environment.SANDBOX }, { data: [] }])('rejects an unrelated or missing status response', async change => {
    mocks.statuses.mockResolvedValue({ ...statusFixture(), ...change })
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow('invalid_purchase')
  })
  it('rejects ambiguous duplicate chains', async () => {
    const response = statusFixture(); response.data.push(response.data[0]); mocks.statuses.mockResolvedValue(response)
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow('invalid_purchase')
  })
  it.each([{ originalTransactionId: '999' }, { subscriptionGroupIdentifier: 'other' }, { appAccountToken: '123e4567-e89b-42d3-a456-426614174001' }])('rejects unrelated latest signed transaction', async change => {
    mocks.decode.mockResolvedValueOnce(fixture()).mockResolvedValueOnce({ ...fixture(), ...change })
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow('appAccountToken' in change ? 'account_mismatch' : 'invalid_purchase')
  })
  it('rejects invalid renewal signatures and exposes retryable verification safely', async () => {
    mocks.renewal.mockRejectedValueOnce(new Error('secret signed payload'))
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow('invalid_purchase')
    mocks.renewal.mockRejectedValueOnce(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE))
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow('provider_unavailable')
  })
  it.each([404, 429, 500])('sanitizes status endpoint failure %s', async status => {
    mocks.statuses.mockRejectedValue({ httpStatusCode: status, message: 'private provider payload' })
    await expect(verifyAppleSubscription('123456', accountToken)).rejects.toThrow(status === 404 ? 'invalid_purchase' : 'provider_unavailable')
  })
})

function notificationFixture() { return { notificationUUID: '123e4567-e89b-42d3-a456-426614174002', notificationType: 'DID_RENEW', version: '2.0', signedDate: now.getTime(), data: { bundleId: expected.bundleId, appAppleId: 1234567890, environment: Environment.PRODUCTION, signedTransactionInfo: 'notification-transaction' } } }
describe('Apple signed notification verification', () => {
  beforeEach(() => { mocks.notification.mockResolvedValue(notificationFixture()) })
  it('verifies the envelope and nested transaction without granting access or exposing account tokens', async () => {
    const result = await verifyAppleNotification('envelope-jws', now)
    expect(mocks.notification).toHaveBeenCalledWith('envelope-jws')
    expect(mocks.decode).toHaveBeenCalledWith('notification-transaction')
    expect(result).toMatchObject({ notificationType: 'DID_RENEW', transaction: { originalTransactionId: '123400' } })
    expect(result.transaction).not.toHaveProperty('accessEligible')
    expect(JSON.stringify(result)).not.toContain(accountToken)
  })
  it('accepts a signed test notification without a transaction', async () => {
    mocks.notification.mockResolvedValue({ ...notificationFixture(), notificationType: 'TEST', data: { ...notificationFixture().data, signedTransactionInfo: undefined } })
    expect(await verifyAppleNotification('envelope-jws', now)).toMatchObject({ notificationType: 'TEST', transaction: null })
    expect(mocks.decode).not.toHaveBeenCalled()
  })
  it.each([{ bundleId: 'other.app' }, { appAppleId: 1 }, { environment: Environment.SANDBOX }, { signedTransactionInfo: undefined }])('rejects missing or mismatched notification data', async change => {
    mocks.notification.mockResolvedValue({ ...notificationFixture(), data: { ...notificationFixture().data, ...change } })
    await expect(verifyAppleNotification('envelope-jws', now)).rejects.toThrow('invalid_purchase')
  })
  it.each([{ version: '1.0' }, { notificationUUID: 'not-uuid' }, { signedDate: now.getTime() + 301000 }, { summary: {} }, { externalPurchaseToken: {} }, { appData: {} }])('rejects invalid or unsupported envelope shape', async change => {
    mocks.notification.mockResolvedValue({ ...notificationFixture(), ...change })
    await expect(verifyAppleNotification('envelope-jws', now)).rejects.toThrow('invalid_purchase')
  })
  it('accepts delayed delivery for subsequent deduplication and current-state reconciliation', async () => {
    mocks.notification.mockResolvedValue({ ...notificationFixture(), signedDate: now.getTime() - 7 * 86400000 })
    expect((await verifyAppleNotification('envelope-jws', now)).notificationType).toBe('DID_RENEW')
  })
  it('rejects a tampered nested transaction and retryable envelope verification correctly', async () => {
    mocks.decode.mockRejectedValueOnce(new Error('tampered nested JWS'))
    await expect(verifyAppleNotification('envelope-jws', now)).rejects.toThrow('invalid_purchase')
    mocks.notification.mockRejectedValueOnce(new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE))
    await expect(verifyAppleNotification('envelope-jws', now)).rejects.toThrow('provider_unavailable')
  })
  it('rejects oversized untrusted input before loading credentials', async () => {
    await expect(verifyAppleNotification('x'.repeat(100001), now)).rejects.toThrow('invalid_purchase')
    expect(mocks.read).not.toHaveBeenCalled()
  })
})

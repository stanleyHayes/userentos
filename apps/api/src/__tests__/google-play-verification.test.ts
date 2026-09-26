import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeGoogleSubscription, verifyGoogleSubscription, purchaseTokenHash, acknowledgeGoogleSubscription } from '../services/storeBilling/googlePlay.js'

const { request, getClient, authOptions } = vi.hoisted(() => ({ request: vi.fn(), getClient: vi.fn(), authOptions: vi.fn() }))
vi.mock('google-auth-library', () => ({ GoogleAuth: class {
  constructor(options: unknown) { authOptions(options) }
  getClient = getClient
} }))
const now = new Date('2026-09-13T12:00:00Z')
const accountId = 'account-binding'
const landlord = '64f000000000000000000001'
const reviewer = '64f0000000000000000000aa'
function fixture(state = 'SUBSCRIPTION_STATE_ACTIVE') {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2', subscriptionState: state,
    startTime: '2026-09-01T00:00:00Z', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
    lineItems: [{ productId: 'rentos.pro', expiryTime: '2026-10-01T00:00:00Z', latestSuccessfulOrderId: 'GPA.fixture', offerDetails: { basePlanId: 'monthly' }, autoRenewingPlan: { autoRenewEnabled: true } }],
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', 'gh.rentos.mobile')
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE', '/fixture/play.json')
  vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', 'false')
  vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', '')
  getClient.mockResolvedValue({ request })
  request.mockResolvedValue({ data: fixture() })
})
afterEach(() => vi.unstubAllEnvs())

describe('Google subscription eligibility', () => {
  it.each(['ACTIVE', 'IN_GRACE_PERIOD', 'CANCELED'])('retains unexpired access in %s state', state => {
    expect(normalizeGoogleSubscription(fixture(`SUBSCRIPTION_STATE_${state}`), accountId, false, now).items[0].accessEligible).toBe(true)
  })
  it.each(['PENDING', 'PAUSED', 'ON_HOLD', 'EXPIRED', 'PENDING_PURCHASE_CANCELED'])('does not grant access in %s state even with a future expiry', state => {
    expect(normalizeGoogleSubscription(fixture(`SUBSCRIPTION_STATE_${state}`), accountId, false, now).items[0].accessEligible).toBe(false)
  })
  it('rejects a receipt bound to another RentOS account', () => {
    expect(() => normalizeGoogleSubscription(fixture(), 'other', false, now)).toThrow('account_mismatch')
  })
  it('rejects missing account bindings and unknown states', () => {
    expect(() => normalizeGoogleSubscription({ ...fixture(), externalAccountIdentifiers: {} }, accountId, false, now)).toThrow('invalid_purchase')
    expect(() => normalizeGoogleSubscription(fixture('SUBSCRIPTION_STATE_NEW_UNKNOWN'), accountId, false, now)).toThrow('invalid_purchase')
  })
  it('does not grant expired or not-yet-started access', () => {
    const raw = fixture(); raw.lineItems[0].expiryTime = now.toISOString()
    expect(normalizeGoogleSubscription(raw, accountId, false, now).items[0].accessEligible).toBe(false)
    raw.lineItems[0].expiryTime = '2026-12-01T00:00:00Z'; raw.startTime = '2026-11-01T00:00:00Z'
    expect(normalizeGoogleSubscription(raw, accountId, false, now).items[0].accessEligible).toBe(false)
  })
  it('does not treat malformed expiry dates as active access', () => {
    const raw = fixture(); raw.lineItems[0].expiryTime = '2026-02-30T00:00:00Z'
    expect(() => normalizeGoogleSubscription(raw, accountId, false, now)).toThrow('invalid_purchase')
  })
  it('separates unowned deferred replacements from promotional purchases without order IDs', () => {
    const raw = fixture()
    const promo = { ...raw.lineItems[0], latestSuccessfulOrderId: undefined }
    expect(normalizeGoogleSubscription({ ...raw, lineItems: [promo] }, accountId, false, now).items[0].accessEligible).toBe(true)
    const result = normalizeGoogleSubscription({ ...raw, lineItems: [
      { ...raw.lineItems[0], deferredItemReplacement: { productId: 'rentos.next' } },
      { ...promo, productId: 'rentos.next' },
    ] }, accountId, false, now)
    expect(result.items.map(item => item.accessEligible)).toEqual([true, false])
  })
  it('strips personal profile data and hashes linked tokens', () => {
    const result = normalizeGoogleSubscription({ ...fixture(), linkedPurchaseToken: 'old-token', subscribeWithGoogleInfo: { emailAddress: 'private@example.com' } }, accountId, false, now)
    expect(result.linkedPurchaseTokenHash).toBe(purchaseTokenHash('old-token'))
    expect(JSON.stringify(result)).not.toContain('old-token')
    expect(JSON.stringify(result)).not.toContain('private@example.com')
    expect(result.acknowledged).toBe(false)
  })
})

describe('Google authenticated transport', () => {
  it('uses a fixed publisher endpoint, application binding, encoded token and scoped credential', async () => {
    const result = await verifyGoogleSubscription('token/with?characters', accountId, landlord)
    expect(authOptions).toHaveBeenCalledWith({ keyFilename: '/fixture/play.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/gh.rentos.mobile/purchases/subscriptionsv2/tokens/token%2Fwith%3Fcharacters', timeout: 10000, retry: false }))
    expect(result.purchaseTokenHash).toBe(purchaseTokenHash('token/with?characters'))
    expect(JSON.stringify(result)).not.toContain('token/with?characters')
  })
  it('fails before a network call when configuration is absent or token is invalid', async () => {
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', '')
    await expect(verifyGoogleSubscription('token', accountId, landlord)).rejects.toThrow('configuration')
    await expect(verifyGoogleSubscription(' ', accountId, landlord)).rejects.toThrow('invalid_purchase')
    expect(getClient).not.toHaveBeenCalled()
  })
  it.each([false, true])('rejects test purchases in production even with allow-test=%s', async allow => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', String(allow))
    request.mockResolvedValue({ data: { ...fixture(), testPurchase: {} } })
    await expect(verifyGoogleSubscription('token', accountId, landlord)).rejects.toThrow('test_purchase')
  })
  it('accepts a production test purchase only for an allowlisted review account', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', ` ${reviewer.toUpperCase()} ,not-an-id`)
    request.mockResolvedValue({ data: { ...fixture(), testPurchase: {} } })
    expect((await verifyGoogleSubscription('token', accountId, reviewer)).environment).toBe('test')
    await expect(verifyGoogleSubscription('token', accountId, landlord)).rejects.toThrow('test_purchase')
    await expect(verifyGoogleSubscription('token', accountId, 'not-an-id')).rejects.toThrow('test_purchase')
    // The allowlist never changes what a real purchase is.
    request.mockResolvedValue({ data: fixture() })
    expect((await verifyGoogleSubscription('token', accountId, landlord)).environment).toBe('production')
  })
  it('requires explicit opt-in for test purchases outside production', async () => {
    request.mockResolvedValue({ data: { ...fixture(), testPurchase: {} } })
    await expect(verifyGoogleSubscription('token', accountId, landlord)).rejects.toThrow('test_purchase')
    vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', 'true')
    expect((await verifyGoogleSubscription('token', accountId, landlord)).environment).toBe('test')
  })
  it.each([401, 403, 429, 500, 404, 410])('sanitizes provider error %s without leaking tokens or credentials', async status => {
    request.mockRejectedValue({ message: 'secret token + credential', response: { status }, config: { headers: { Authorization: 'secret' } } })
    await expect(verifyGoogleSubscription('sensitive-token', accountId, landlord)).rejects.toThrow(status === 404 || status === 410 ? 'invalid_purchase' : 'provider_unavailable')
    try { await verifyGoogleSubscription('sensitive-token', accountId, landlord) } catch (error) { expect(JSON.stringify(error)).not.toContain('secret') }
  })
})


describe('Google acknowledgement transport', () => {
  it('posts to the authenticated fixed application endpoint without personal payload or automatic retry', async () => {
    await acknowledgeGoogleSubscription('token/with?characters', 'rentos.pro')
    expect(request).toHaveBeenCalledWith({ method: 'POST', url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/gh.rentos.mobile/purchases/subscriptions/rentos.pro/tokens/token%2Fwith%3Fcharacters:acknowledge', data: {}, timeout: 10000, retry: false })
    expect(authOptions).toHaveBeenCalledWith({ keyFilename: '/fixture/play.json', scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
  })
  it('rejects malformed product and token input before transport', async () => {
    await expect(acknowledgeGoogleSubscription('token', '../other')).rejects.toThrow('invalid_purchase')
    await expect(acknowledgeGoogleSubscription(' ', 'rentos.pro')).rejects.toThrow('invalid_purchase')
    expect(getClient).not.toHaveBeenCalled()
  })
  it('sanitizes ambiguous failures without leaking provider request data', async () => {
    request.mockRejectedValue({ message: 'secret-token', config: { headers: { Authorization: 'secret-credential' } }, response: { status: 503 } })
    try { await acknowledgeGoogleSubscription('secret-token', 'rentos.pro'); expect.fail('Expected failure') } catch (error) {
      expect(String(error)).toContain('provider_unavailable')
      expect(JSON.stringify(error)).not.toContain('secret')
    }
  })
})

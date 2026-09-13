import { createHash } from 'node:crypto'
import { GoogleAuth } from 'google-auth-library'
import { z } from 'zod'
import { envOptional } from '../../utils/env.js'

export class StoreVerificationError extends Error {
  constructor(public readonly code: 'configuration' | 'provider_unavailable' | 'invalid_purchase' | 'account_mismatch' | 'test_purchase') {
    super(`Store verification failed: ${code}`)
    this.name = 'StoreVerificationError'
  }
}

const timestamp = z.iso.datetime({ offset: true })
const subscriptionSchema = z.object({
  kind: z.literal('androidpublisher#subscriptionPurchaseV2'),
  subscriptionState: z.enum([
    'SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
  ]),
  startTime: timestamp.nullish(),
  acknowledgementState: z.enum(['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED']),
  testPurchase: z.object({}).nullish(),
  externalAccountIdentifiers: z.object({ obfuscatedExternalAccountId: z.string().min(1) }),
  linkedPurchaseToken: z.string().min(1).nullish(),
  lineItems: z.array(z.object({
    productId: z.string().min(1),
    expiryTime: timestamp.nullish(),
    latestSuccessfulOrderId: z.string().min(1).nullish(),
    autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }).nullish(),
    prepaidPlan: z.object({}).nullish(),
    offerDetails: z.object({ basePlanId: z.string().min(1), offerId: z.string().optional() }),
    deferredItemReplacement: z.object({ productId: z.string().min(1) }).nullish(),
  })).min(1).max(100),
})

export const googlePurchaseTokenInput = z.string().min(1).max(8192).refine(value => !/\s/.test(value), 'Invalid purchase token')
export const purchaseTokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const ACCESS_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'])

/** Only call with data fetched from Google's authenticated publisher API. */
export function normalizeGoogleSubscription(raw: unknown, expectedAccountId: string, allowTest: boolean, now = new Date()) {
  const parsed = subscriptionSchema.safeParse(raw)
  if (!parsed.success || !Number.isFinite(now.getTime())) throw new StoreVerificationError('invalid_purchase')
  const purchase = parsed.data
  if (!expectedAccountId || purchase.externalAccountIdentifiers.obfuscatedExternalAccountId !== expectedAccountId) throw new StoreVerificationError('account_mismatch')
  const isTest = purchase.testPurchase != null
  if (isTest && !allowTest) throw new StoreVerificationError('test_purchase')
  const started = !!purchase.startTime && Date.parse(purchase.startTime) <= now.getTime()
  const deferredProducts = new Set(purchase.lineItems.flatMap(item => item.deferredItemReplacement ? [item.deferredItemReplacement.productId] : []))
  return {
    platform: 'google' as const,
    state: purchase.subscriptionState,
    environment: isTest ? 'test' as const : 'production' as const,
    acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    startedAt: purchase.startTime ? new Date(purchase.startTime).toISOString() : null,
    linkedPurchaseTokenHash: purchase.linkedPurchaseToken ? purchaseTokenHash(purchase.linkedPurchaseToken) : null,
    verifiedAt: now.toISOString(),
    items: purchase.lineItems.map(item => ({
      productId: item.productId,
      basePlanId: item.offerDetails.basePlanId,
      offerId: item.offerDetails.offerId ?? null,
      expiresAt: item.expiryTime ? new Date(item.expiryTime).toISOString() : null,
      autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true,
      latestOrderId: item.latestSuccessfulOrderId ?? null,
      // A future replacement is not owned yet. Do not use order IDs as a
      // universal ownership requirement: promo purchases may have no order ID.
      accessEligible: started && ACCESS_STATES.has(purchase.subscriptionState)
        && !!item.expiryTime && Date.parse(item.expiryTime) > now.getTime()
        && !(deferredProducts.has(item.productId) && !item.latestSuccessfulOrderId),
    })),
  }
}

function settings() {
  const packageName = envOptional('GOOGLE_PLAY_PACKAGE_NAME')
  const keyFilename = envOptional('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE')
  if (!packageName || !/^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/.test(packageName) || !keyFilename) throw new StoreVerificationError('configuration')
  return { packageName, keyFilename, allowTest: process.env.NODE_ENV !== 'production' && envOptional('GOOGLE_PLAY_ALLOW_TEST_PURCHASES') === 'true' }
}

export function googlePlayApplicationId() { return settings().packageName }

/** Fetch current subscription state; never accept a client-supplied receipt JSON.
 * This verifies only. Entitlement persistence, linked-token revocation and
 * acknowledgement must follow as a separate durable workflow.
 */
export async function verifyGoogleSubscription(purchaseToken: string, expectedAccountId: string) {
  if (!googlePurchaseTokenInput.safeParse(purchaseToken).success) throw new StoreVerificationError('invalid_purchase')
  const { packageName, keyFilename, allowTest } = settings()
  let data: unknown
  try {
    const auth = new GoogleAuth({ keyFilename, scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
    const client = await auth.getClient()
    const result = await client.request({
      method: 'GET',
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
      timeout: 10000,
      retry: false,
    })
    data = result.data
  } catch (error) {
    // Google/Gaxios errors can contain the purchase token, authorization
    // headers and credential paths. Do not propagate or log the raw error.
    const status = (error as { response?: { status?: number } })?.response?.status
    throw new StoreVerificationError(status === 404 || status === 410 ? 'invalid_purchase' : 'provider_unavailable')
  }
  return { ...normalizeGoogleSubscription(data, expectedAccountId, allowTest), packageName, purchaseTokenHash: purchaseTokenHash(purchaseToken) }
}

/** Call only after durable entitlement activation. A timeout is ambiguous:
 * retry the complete workflow from a fresh provider read, never blindly POST.
 */
export async function acknowledgeGoogleSubscription(purchaseToken: string, productId: string) {
  if (!googlePurchaseTokenInput.safeParse(purchaseToken).success || !/^[A-Za-z0-9._-]{1,255}$/.test(productId)) throw new StoreVerificationError('invalid_purchase')
  const { packageName, keyFilename } = settings()
  try {
    const auth = new GoogleAuth({ keyFilename, scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
    const client = await auth.getClient()
    await client.request({
      method: 'POST',
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      data: {}, timeout: 10000, retry: false,
    })
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    throw new StoreVerificationError(status === 404 || status === 410 ? 'invalid_purchase' : 'provider_unavailable')
  }
}

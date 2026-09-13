import { BoundedAppleClient, appleVerificationDeadline, AppleVerificationTimeout } from './appleTransport.js'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { Environment, SignedDataVerifier, Type, Status, VerificationException, VerificationStatus } from '@apple/app-store-server-library'
import { envOptional } from '../../utils/env.js'
import { StoreVerificationError } from './googlePlay.js'

export const appleTransactionIdInput = z.string().regex(/^\d{1,32}$/)
const epoch = z.number().int().nonnegative().max(8_640_000_000_000_000)
const transactionSchema = z.object({
  transactionId: appleTransactionIdInput, originalTransactionId: appleTransactionIdInput,
  bundleId: z.string().min(1), productId: z.string().min(1),
  type: z.literal(Type.AUTO_RENEWABLE_SUBSCRIPTION),
  environment: z.enum([Environment.PRODUCTION, Environment.SANDBOX]),
  appAccountToken: z.uuid(), inAppOwnershipType: z.literal('PURCHASED'),
  purchaseDate: epoch, originalPurchaseDate: epoch, expiresDate: epoch, signedDate: epoch,
  revocationDate: epoch.optional(), isUpgraded: z.boolean().optional(),
  subscriptionGroupIdentifier: z.string().min(1),
})

/** Only accept data returned by Apple's signature verifier, never client JSON.
 * These are transaction facts, not a complete subscription entitlement decision.
 * Current subscription status/grace/retry and product mapping must follow.
 */
export function normalizeAppleTransaction(raw: unknown, expected: { transactionId: string; accountToken: string; bundleId: string; environment: Environment }, now = new Date()) {
  const parsed = transactionSchema.safeParse(raw)
  if (!parsed.success || !Number.isFinite(now.getTime())) throw new StoreVerificationError('invalid_purchase')
  const transaction = parsed.data
  if (transaction.appAccountToken.toLowerCase() !== expected.accountToken.toLowerCase()) throw new StoreVerificationError('account_mismatch')
  if (transaction.transactionId !== expected.transactionId || transaction.bundleId !== expected.bundleId || transaction.environment !== expected.environment) throw new StoreVerificationError('invalid_purchase')
  if (transaction.originalPurchaseDate > transaction.purchaseDate || transaction.expiresDate < transaction.purchaseDate || transaction.purchaseDate > now.getTime() || transaction.signedDate > now.getTime() + 300_000) throw new StoreVerificationError('invalid_purchase')
  return {
    platform: 'apple' as const, applicationId: transaction.bundleId,
    transactionId: transaction.transactionId, originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId, subscriptionGroupId: transaction.subscriptionGroupIdentifier,
    environment: transaction.environment === Environment.PRODUCTION ? 'production' as const : 'test' as const,
    purchasedAt: new Date(transaction.purchaseDate).toISOString(), originalPurchasedAt: new Date(transaction.originalPurchaseDate).toISOString(),
    expiresAt: new Date(transaction.expiresDate).toISOString(), signedAt: new Date(transaction.signedDate).toISOString(),
    revokedAt: transaction.revocationDate === undefined ? null : new Date(transaction.revocationDate).toISOString(),
    upgraded: transaction.isUpgraded === true, verifiedAt: now.toISOString(),
  }
}

async function clients() {
  const bundleId = envOptional('APPLE_STORE_BUNDLE_ID')
  const keyId = envOptional('APPLE_STORE_KEY_ID')
  const issuerId = envOptional('APPLE_STORE_ISSUER_ID')
  const privateKeyFile = envOptional('APPLE_STORE_PRIVATE_KEY_FILE')
  const environmentName = envOptional('APPLE_STORE_ENVIRONMENT')
  const appId = Number(envOptional('APPLE_STORE_APP_ID'))
  if (!bundleId || !keyId || !issuerId || !privateKeyFile || !['Production', 'Sandbox'].includes(environmentName ?? '') || !Number.isSafeInteger(appId) || appId <= 0) throw new StoreVerificationError('configuration')
  if (environmentName === 'Sandbox' && process.env.NODE_ENV === 'production') throw new StoreVerificationError('test_purchase')
  const environment = environmentName === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX
  try {
    const paths = z.array(z.string().min(1)).min(1).max(8).parse(JSON.parse(envOptional('APPLE_STORE_ROOT_CA_FILES') ?? '[]'))
    const [key, roots] = await Promise.all([readFile(privateKeyFile, 'utf8'), Promise.all(paths.map(path => readFile(path)))])
    return {
      bundleId, environment, appId,
      client: new BoundedAppleClient(key, keyId, issuerId, bundleId, environment),
      verifier: new SignedDataVerifier(roots, true, environment, bundleId, appId),
    }
  } catch { throw new StoreVerificationError('configuration') }
}

/** Request the transaction from Apple, then independently verify its signed JWS.
 * No fallback between production and sandbox, and no client-selected endpoint.
 */
export async function verifyAppleTransaction(transactionId: string, expectedAccountToken: string) {
  if (!appleTransactionIdInput.safeParse(transactionId).success || !z.uuid().safeParse(expectedAccountToken).success) throw new StoreVerificationError('invalid_purchase')
  return verifyTransactionWithClients(transactionId, expectedAccountToken, await clients())
}

async function decodeSigned<T>(signed: string | undefined, decode: (value: string) => Promise<T>): Promise<T> {
  if (!signed || signed.length > 100_000) throw new StoreVerificationError('invalid_purchase')
  try { return await appleVerificationDeadline(decode(signed)) } catch (error) {
    throw new StoreVerificationError((error instanceof AppleVerificationTimeout || (error instanceof VerificationException && error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE)) ? 'provider_unavailable' : 'invalid_purchase')
  }
}
async function verifyTransactionWithClients(transactionId: string, expectedAccountToken: string, context: Awaited<ReturnType<typeof clients>>) {
  const { client, verifier, bundleId, environment } = context
  let signed: string | undefined
  try {
    signed = (await client.getTransactionInfo(transactionId)).signedTransactionInfo
  } catch (error) {
    const status = (error as { httpStatusCode?: number }).httpStatusCode
    throw new StoreVerificationError(status === 404 ? 'invalid_purchase' : 'provider_unavailable')
  }
  const decoded = await decodeSigned(signed, value => verifier.verifyAndDecodeTransaction(value))
  return normalizeAppleTransaction(decoded, { transactionId, accountToken: expectedAccountToken, bundleId, environment })
}

const subscriptionStatus = z.union([z.literal(Status.ACTIVE), z.literal(Status.EXPIRED), z.literal(Status.BILLING_RETRY), z.literal(Status.BILLING_GRACE_PERIOD), z.literal(Status.REVOKED)])
const renewalSchema = z.object({
  originalTransactionId: appleTransactionIdInput, productId: z.string().min(1),
  environment: z.enum([Environment.PRODUCTION, Environment.SANDBOX]),
  signedDate: epoch, autoRenewStatus: z.union([z.literal(0), z.literal(1)]),
  gracePeriodExpiresDate: epoch.optional(),
})
const statusResponseSchema = z.object({
  bundleId: z.string(), appAppleId: z.number().int().positive(), environment: z.enum([Environment.PRODUCTION, Environment.SANDBOX]),
  data: z.array(z.object({ subscriptionGroupIdentifier: z.string().min(1), lastTransactions: z.array(z.object({
    originalTransactionId: appleTransactionIdInput, status: subscriptionStatus,
    signedTransactionInfo: z.string().min(1).max(100_000), signedRenewalInfo: z.string().min(1).max(100_000),
  })).max(100) })).max(100),
})

/** Apply only after signature verification of both transaction and renewal JWS. */
export function normalizeAppleSubscription(transaction: ReturnType<typeof normalizeAppleTransaction>, renewalRaw: unknown, statusRaw: unknown, now = new Date()) {
  const renewal = renewalSchema.safeParse(renewalRaw)
  const status = subscriptionStatus.safeParse(statusRaw)
  if (!renewal.success || !status.success || !Number.isFinite(now.getTime())) throw new StoreVerificationError('invalid_purchase')
  const expectedEnvironment = transaction.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX
  if (renewal.data.originalTransactionId !== transaction.originalTransactionId || renewal.data.productId !== transaction.productId || renewal.data.environment !== expectedEnvironment || renewal.data.signedDate > now.getTime() + 300_000) throw new StoreVerificationError('invalid_purchase')
  const graceExpiresAt = renewal.data.gracePeriodExpiresDate === undefined ? null : new Date(renewal.data.gracePeriodExpiresDate).toISOString()
  const accessExpiresAt = status.data === Status.BILLING_GRACE_PERIOD ? graceExpiresAt : transaction.expiresAt
  const accessEligible = (status.data === Status.ACTIVE || status.data === Status.BILLING_GRACE_PERIOD)
    && !transaction.revokedAt && !transaction.upgraded && !!accessExpiresAt && Date.parse(accessExpiresAt) > now.getTime()
    && Date.parse(transaction.purchasedAt) <= now.getTime()
  return { ...transaction, status: status.data, autoRenewing: renewal.data.autoRenewStatus === 1, graceExpiresAt, accessExpiresAt, accessEligible, verifiedAt: now.toISOString() }
}

/** Follow an owned transaction to its current original-transaction chain. Older
 * signed purchase data cannot extend access when the current chain is revoked.
 */
export async function verifyAppleSubscription(transactionId: string, expectedAccountToken: string) {
  if (!appleTransactionIdInput.safeParse(transactionId).success || !z.uuid().safeParse(expectedAccountToken).success) throw new StoreVerificationError('invalid_purchase')
  const context = await clients()
  const anchor = await verifyTransactionWithClients(transactionId, expectedAccountToken, context)
  let raw: unknown
  try { raw = await context.client.getAllSubscriptionStatuses(transactionId) } catch (error) {
    throw new StoreVerificationError((error as { httpStatusCode?: number }).httpStatusCode === 404 ? 'invalid_purchase' : 'provider_unavailable')
  }
  const response = statusResponseSchema.safeParse(raw)
  if (!response.success || response.data.bundleId !== context.bundleId || response.data.appAppleId !== context.appId || response.data.environment !== context.environment) throw new StoreVerificationError('invalid_purchase')
  const matches = response.data.data.flatMap(group => group.lastTransactions.filter(item => item.originalTransactionId === anchor.originalTransactionId).map(item => ({ ...item, groupId: group.subscriptionGroupIdentifier })))
  if (matches.length !== 1) throw new StoreVerificationError('invalid_purchase')
  const item = matches[0]
  const decoded = await decodeSigned(item.signedTransactionInfo, value => context.verifier.verifyAndDecodeTransaction(value))
  const latest = normalizeAppleTransaction(decoded, { transactionId: decoded.transactionId ?? '', accountToken: expectedAccountToken, bundleId: context.bundleId, environment: context.environment })
  if (latest.originalTransactionId !== anchor.originalTransactionId || latest.subscriptionGroupId !== anchor.subscriptionGroupId || latest.subscriptionGroupId !== item.groupId) throw new StoreVerificationError('invalid_purchase')
  const renewal = await decodeSigned(item.signedRenewalInfo, value => context.verifier.verifyAndDecodeRenewalInfo(value))
  return normalizeAppleSubscription(latest, renewal, item.status)
}

export const appleNotificationInput = z.object({ signedPayload: z.string().min(1).max(100_000) }).strict()
const notificationSchema = z.object({
  notificationUUID: z.uuid(), notificationType: z.string().min(1).max(100), subtype: z.string().max(100).optional(),
  version: z.literal('2.0'), signedDate: epoch,
  data: z.object({ bundleId: z.string().min(1), appAppleId: z.number().int().positive(), environment: z.enum([Environment.PRODUCTION, Environment.SANDBOX]), signedTransactionInfo: z.string().min(1).max(100_000).optional() }),
  // These payload families require their own handling, not subscription access.
  summary: z.never().optional(), externalPurchaseToken: z.never().optional(), appData: z.never().optional(),
})

/** Authenticate the envelope and nested transaction. Notification delivery is not
 * account authorization or a current entitlement decision: consumers must find
 * the immutable journal owner and freshly verify the current subscription chain.
 */
export async function verifyAppleNotification(signedPayload: string, now = new Date()) {
  if (!appleNotificationInput.safeParse({ signedPayload }).success || !Number.isFinite(now.getTime())) throw new StoreVerificationError('invalid_purchase')
  const context = await clients()
  const decoded = await decodeSigned(signedPayload, value => context.verifier.verifyAndDecodeNotification(value))
  const parsed = notificationSchema.safeParse(decoded)
  if (!parsed.success) throw new StoreVerificationError('invalid_purchase')
  const event = parsed.data
  if (event.signedDate > now.getTime() + 300_000 || event.data.bundleId !== context.bundleId || event.data.appAppleId !== context.appId || event.data.environment !== context.environment) throw new StoreVerificationError('invalid_purchase')
  const metadata = { notificationId: event.notificationUUID, notificationType: event.notificationType, subtype: event.subtype ?? null,
    applicationId: context.bundleId, environment: context.environment === Environment.PRODUCTION ? 'production' as const : 'test' as const,
    signedAt: new Date(event.signedDate).toISOString() }
  if (event.notificationType === 'TEST') return { ...metadata, transaction: null }
  const transaction = await decodeSigned(event.data.signedTransactionInfo, value => context.verifier.verifyAndDecodeTransaction(value))
  // This checks payload structure and application identity. Account ownership is
  // deliberately deferred until immutable-owner lookup and provider recheck.
  const facts = normalizeAppleTransaction(transaction, { transactionId: transaction.transactionId ?? '', accountToken: transaction.appAccountToken ?? '', bundleId: context.bundleId, environment: context.environment }, now)
  return { ...metadata, transaction: facts }
}

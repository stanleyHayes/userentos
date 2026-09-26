import { completeApplePurchase } from '../services/storeBilling/completeApplePurchase.js'
import { appleTransactionIdInput } from '../services/storeBilling/appleStore.js'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { snapshotPackageEntitlements, type StoreEntitlementSnapshot } from '../services/entitlements.js'
import { StoreProduct } from '../models/StoreProduct.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { getPurchaseAccount, storeProductInput } from '../services/storeBilling/catalog.js'
import { success, error } from '../utils/response.js'
import { recordAudit } from '../utils/audit.js'
import { param } from '../utils/params.js'
import { writeLimiter } from '../middleware/rateLimit.js'
import { completeGooglePurchase } from '../services/storeBilling/completePurchase.js'
import { googlePurchaseTokenInput, StoreVerificationError } from '../services/storeBilling/googlePlay.js'
import { StorePurchaseAccessError, StorePurchaseConflict } from '../services/storeBilling/purchaseJournal.js'

const router = Router()
router.use(authenticate)

// The same endpoint handles an SDK purchase callback and restored purchases.
// Account, product, price and entitlement claims never come from the caller.
router.post('/google/complete', requireRole('landlord', 'property_manager'), writeLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const parsed = z.object({ purchaseToken: googlePurchaseTokenInput }).strict().safeParse(req.body)
  if (!parsed.success) { error(res, 'A valid Google purchase token is required', 400); return }
  try {
    const result = await completeGooglePurchase(req.user!.userId, parsed.data.purchaseToken)
    success(res, result)
  } catch (err) {
    if (err instanceof StorePurchaseAccessError || (err instanceof StoreVerificationError && err.code === 'account_mismatch')) {
      error(res, 'This purchase cannot be linked to your account. Use the account that made the purchase or contact support.', 403); return
    }
    // License-test purchases are free, so only allowlisted review accounts hold them.
    if (err instanceof StoreVerificationError && err.code === 'test_purchase') {
      error(res, 'This is a Google Play test purchase, and test purchases are not accepted for this account.', 403); return
    }
    if (err instanceof StoreVerificationError && err.code === 'invalid_purchase') {
      error(res, 'Google could not verify this purchase for this app.', 422); return
    }
    if (err instanceof StorePurchaseConflict) {
      res.setHeader('Retry-After', '1')
      error(res, 'This purchase is being updated. Please retry.', 409); return
    }
    // A provider error can contain receipt/credential data. Never forward it to
    // the global error logger or describe an ambiguous failure as a rejection.
    res.setHeader('Retry-After', '30')
    error(res, 'Purchase processing is temporarily unavailable. Please retry; do not purchase again.', 503)
  }
})

router.post('/apple/complete', requireRole('landlord', 'property_manager'), writeLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const parsed = z.object({ transactionId: appleTransactionIdInput }).strict().safeParse(req.body)
  if (!parsed.success) { error(res, 'A valid Apple transaction ID is required', 400); return }
  try {
    const result = await completeApplePurchase(req.user!.userId, parsed.data.transactionId)
    success(res, result)
  } catch (err) {
    if (err instanceof StorePurchaseAccessError || (err instanceof StoreVerificationError && err.code === 'account_mismatch')) {
      error(res, 'This purchase cannot be linked to your account. Use the account that made the purchase or contact support.', 403); return
    }
    // Sandbox purchases (App Review, TestFlight) are free, so only allowlisted review accounts hold them.
    if (err instanceof StoreVerificationError && err.code === 'test_purchase') {
      error(res, 'This is an App Store sandbox purchase, and sandbox purchases are not accepted for this account.', 403); return
    }
    if (err instanceof StoreVerificationError && err.code === 'invalid_purchase') {
      error(res, 'Apple could not verify this purchase for this app.', 422); return
    }
    if (err instanceof StorePurchaseConflict) {
      res.setHeader('Retry-After', '1')
      error(res, 'This purchase is being updated. Please retry.', 409); return
    }
    // A provider error can contain receipt/credential data. Never forward it to
    // the global error logger or describe an ambiguous failure as a rejection.
    res.setHeader('Retry-After', '30')
    error(res, 'Purchase processing is temporarily unavailable. Please retry; do not purchase again.', 503)
  }
})

router.get('/catalog', requireRole('landlord', 'property_manager'), asyncHandler(async (req, res) => {
  const platform = z.enum(['apple', 'google']).safeParse(req.query.platform)
  if (!platform.success) { error(res, 'Choose apple or google', 400); return }
  const packages = await SubscriptionPackage.find({ isActive: true, price: { $gt: 0 } }).select('name billingCycle benefits maxProperties version').lean()
  const byId = new Map(packages.map(pkg => [pkg._id.toString(), pkg]))
  const mappings = await StoreProduct.find({ platform: platform.data, isActive: true, entitlementSnapshot: { $exists: true }, packageId: { $in: [...byId.keys()] } }).sort({ productId: 1, basePlanId: 1 }).lean()
  // Price and offers must come from the storefront SDK, not the web GHS price.
  success(res, { items: mappings.map(mapping => ({
    id: mapping._id.toString(), platform: mapping.platform, productId: mapping.productId, basePlanId: mapping.basePlanId,
    package: (() => {
      const snapshot = mapping.entitlementSnapshot as StoreEntitlementSnapshot
      return { id: mapping.packageId, name: snapshot.planName, version: snapshot.planVersion, billingCycle: snapshot.billingCycle, benefits: snapshot.benefits, maxProperties: snapshot.features['property.limit'] }
    })(),
  })) })
}))

router.post('/account', requireRole('landlord', 'property_manager'), asyncHandler(async (req, res) => {
  const account = await getPurchaseAccount(req.user!.userId)
  if (!account) { error(res, 'Account unavailable', 401); return }
  res.setHeader('Cache-Control', 'no-store')
  success(res, account)
}))

router.get('/products', requirePermission('subscriptions:manage'), asyncHandler(async (_req, res) => {
  const items = await StoreProduct.find().sort({ createdAt: -1 }).lean()
  success(res, { items: items.map(item => ({ ...item, id: item._id.toString() })) })
}))

router.post('/products', requirePermission('subscriptions:manage'), asyncHandler(async (req, res) => {
  const parsed = storeProductInput.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message, 400); return }
  const pkg = await SubscriptionPackage.findById(parsed.data.packageId).lean()
  if (!pkg || !pkg.isActive || pkg.price <= 0) { error(res, 'Choose an active paid package', 422); return }
  try {
    const entitlementSnapshot = await snapshotPackageEntitlements(pkg)
    const mapping = await StoreProduct.create({ ...parsed.data, entitlementSnapshot })
    await recordAudit(req, 'store-billing.product.create', 'StoreProduct', mapping._id.toString(), parsed.data)
    success(res, { ...mapping.toObject(), id: mapping._id.toString() }, 'Store product mapped', 201)
  } catch (err) {
    if ((err as { code?: number }).code === 11000) { error(res, 'This store product is already mapped. Its package association cannot be reassigned.', 409); return }
    throw err
  }
}))

router.patch('/products/:id', requirePermission('subscriptions:manage'), asyncHandler(async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(req.body)
  if (!parsed.success || !/^[a-f\d]{24}$/i.test(param(req.params.id))) { error(res, 'Only product availability can be changed', 400); return }
  const item = await StoreProduct.findOneAndUpdate({ _id: param(req.params.id), ...(parsed.data.isActive ? { entitlementSnapshot: { $exists: true } } : {}) }, { $set: parsed.data }, { returnDocument: 'after' }).lean()
  if (!item) { error(res, 'Mapping not found or missing its entitlement snapshot', 409); return }
  await recordAudit(req, 'store-billing.product.availability', 'StoreProduct', item._id.toString(), parsed.data)
  success(res, { ...item, id: item._id.toString() })
}))
export default router

/**
 * Marketplace payments: seller onboarding, split initialization and
 * verification (spec §8).
 */
import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { PaymentAccount } from '../models/PaymentAccount.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { getNumericFeature } from '../services/entitlements.js'
import { calculateSplit } from '../services/marketplace/split.js'
import { validateCoupon } from '../services/marketplace/coupons.js'
import {
  listBanks, resolveAccount, createSubaccount, updateSubaccount,
  initializeSplitTransaction, verifyTransaction,
} from '../services/marketplace/paystack.js'
import { logger } from '../utils/logger.js'

const router = Router()

const mask = (accountNumber: string) => `••••${accountNumber.slice(-4)}`

router.get('/banks', authenticate, asyncHandler(async (_req, res) => {
  try {
    success(res, { items: await listBanks() })
  } catch (err) {
    error(res, `Could not load the bank list: ${(err as Error).message}`, 502)
  }
}))

router.get('/account', authenticate, asyncHandler(async (req, res) => {
  const account = await PaymentAccount.findOne({ ownerId: req.user!.userId }).lean()
  success(res, account ? { ...account, id: String(account._id) } : null)
}))

const onboardSchema = z.object({
  businessName: z.string().min(2).max(120),
  bankCode: z.string().min(1).max(20),
  bankName: z.string().min(1).max(120),
  accountNumber: z.string().min(6).max(20).regex(/^\d+$/, 'Account number must be digits only'),
})

/**
 * Create or replace the seller's provider subaccount (spec §8.1).
 *
 * The account is only marked ready after the provider confirms creation — the
 * spec requires ready_to_receive_payments to follow provider success, not the
 * form submission.
 */
router.post('/account', authenticate, asyncHandler(async (req, res) => {
  const parsed = onboardSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { businessName, bankCode, bankName, accountNumber } = parsed.data

  const userId = req.user!.userId
  const user = await User.findById(userId).select('email firstName lastName').lean()

  // The platform's cut comes from the seller's plan, so the subaccount is
  // created with the right percentage_charge from the start.
  const platformFeePercent = await getNumericFeature(userId, 'platform.fee_percent')

  let resolvedName: string | undefined
  try {
    const resolved = await resolveAccount(accountNumber, bankCode)
    resolvedName = resolved.accountName
  } catch (err) {
    // Resolution is best-effort: not every Ghanaian bank supports it. Creation
    // below is the real gate.
    logger.warn(`[Marketplace] account resolution failed: ${(err as Error).message}`)
  }

  const existing = await PaymentAccount.findOne({ ownerId: userId })

  try {
    if (existing?.subaccountCode) {
      await updateSubaccount(existing.subaccountCode, {
        businessName, settlementBank: bankCode, accountNumber, platformFeePercent,
      })
      existing.businessName = businessName
      existing.bankCode = bankCode
      existing.bankName = bankName
      existing.accountNumberMasked = mask(accountNumber)
      existing.accountNameResolved = resolvedName
      existing.status = 'ready'
      existing.readyToReceivePayments = true
      existing.verifiedAt = new Date()
      existing.failureReason = undefined
      await existing.save()

      await recordAudit(req, 'payment_account.updated', 'PaymentAccount', String(existing._id), {
        bankCode, masked: existing.accountNumberMasked,
      })
      success(res, { ...existing.toObject(), id: String(existing._id) }, 'Payout account updated')
      return
    }

    const created = await createSubaccount({
      businessName,
      settlementBank: bankCode,
      accountNumber,
      platformFeePercent,
      contactEmail: (user as { email?: string } | null)?.email,
      contactName: user ? `${(user as { firstName?: string }).firstName ?? ''} ${(user as { lastName?: string }).lastName ?? ''}`.trim() : undefined,
    })

    const account = await PaymentAccount.create({
      ownerId: userId,
      provider: 'paystack',
      subaccountCode: created.subaccountCode,
      businessName,
      bankCode,
      bankName,
      accountNumberMasked: mask(accountNumber),
      accountNameResolved: resolvedName ?? created.accountName,
      status: 'ready',
      readyToReceivePayments: true,
      verifiedAt: new Date(),
    })

    await recordAudit(req, 'payment_account.created', 'PaymentAccount', String(account._id), {
      subaccountCode: created.subaccountCode, bankCode, masked: account.accountNumberMasked,
    })
    success(res, { ...account.toObject(), id: String(account._id) }, 'Payout account ready', 201)
  } catch (err) {
    const reason = (err as Error).message
    if (existing) {
      existing.status = 'failed'
      existing.readyToReceivePayments = false
      existing.failureReason = reason
      await existing.save()
    }
    error(res, `Could not set up payouts with the provider: ${reason}`, 502)
  }
}))

const initSchema = z.object({
  sellerId: z.string().min(1),
  amount: z.number().positive().max(10_000_000),
  email: z.string().email(),
  propertyId: z.string().optional(),
  storefrontId: z.string().optional(),
  /** When this payment buys a sponsorship, the campaign it activates once paid. */
  sponsorshipId: z.string().optional(),
  purpose: z.string().max(60).default('marketplace'),
  // NOTE: there is deliberately no discountAmount here. The discount is
  // derived server-side from couponCode; see below.
  couponCode: z.string().max(40).optional(),
  /** Client-supplied idempotency key (spec §15). */
  idempotencyKey: z.string().min(8).max(80).optional(),
})

/**
 * Start a split payment.
 *
 * The fee percentage is read from the seller's plan and SNAPSHOTTED onto the
 * transaction, so a later plan change never rewrites this payment's economics.
 */
/*
 * Authenticated. This was reachable with no credentials at all — `optionalAuth`
 * is global, so `req.user` was simply undefined and the handler carried on.
 * A route that asks a PSP to collect money should know who is asking, and
 * per-user coupon limits are unenforceable against an anonymous caller.
 * Nothing in apps/web or apps/mobile calls this endpoint, so requiring a
 * session breaks no existing flow.
 *
 * KNOWN GAP, deliberately not papered over: `amount` is still supplied by the
 * caller and there is no order or quote to check it against, so an
 * authenticated buyer can name their own price. Closing that needs a
 * server-side order/quote record — a design decision, not a one-line guard —
 * and inventing a price rule here would be guessing at policy. See the review
 * notes; this is the top open item on this route.
 */
router.post('/initialize', authenticate, asyncHandler(async (req, res) => {
  const parsed = initSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const input = parsed.data

  // Idempotency: replay of the same key returns the original transaction
  // rather than charging twice.
  if (input.idempotencyKey) {
    const existing = await MarketplaceTransaction.findOne({ reference: input.idempotencyKey }).lean()
    if (existing) {
      success(res, {
        reference: existing.reference,
        accessCode: existing.providerAccessCode,
        alreadyInitialized: true,
      }, 'Payment already initialized')
      return
    }
  }

  const account = await PaymentAccount.findOne({ ownerId: input.sellerId }).lean()
  if (!account?.subaccountCode || !account.readyToReceivePayments) {
    error(res, 'This seller cannot receive payments yet', 409)
    return
  }

  /*
   * Derive the discount; never accept one.
   *
   * This route took `discountAmount` straight from the request body and fed it
   * to calculateSplit. It is also unauthenticated (guest checkout), so anyone
   * could POST amount: 1000 with discountAmount: 999 and buy a GHS 1000 item
   * for one cedi — the seller's payout is computed from the discounted figure.
   * The coupon code was recorded on the transaction but never validated or
   * redeemed, so usage limits and expiry did nothing here either.
   *
   * The discount now comes from validateCoupon, the same path /promotions/
   * validate uses, which enforces existence, active status, the date window,
   * minimum spend, per-seller scope and usage limits. An invalid coupon is
   * refused outright rather than silently ignored, so a buyer is never charged
   * full price by a code they believe applied.
   */
  let discountAmount = 0
  let couponCode: string | undefined
  let discountSource: 'platform' | 'seller' | undefined

  if (input.couponCode) {
    const coupon = await validateCoupon({
      code: input.couponCode,
      userId: req.user!.userId,
      amount: input.amount,
      sellerId: input.sellerId,
      propertyId: input.propertyId,
    })
    if (!coupon.valid) { error(res, coupon.reason ?? 'That coupon cannot be used.', 422); return }
    discountAmount = coupon.discountAmount
    couponCode = input.couponCode.trim().toUpperCase()
    discountSource = coupon.fundingSource
  }

  const platformFeePercent = await getNumericFeature(input.sellerId, 'platform.fee_percent')
  const split = calculateSplit({
    grossAmount: input.amount,
    platformFeePercent,
    discountAmount,
  })

  const reference = input.idempotencyKey ?? `MKT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

  const transaction = await MarketplaceTransaction.create({
    reference,
    buyerId: req.user!.userId,
    buyerEmail: input.email,
    sellerId: input.sellerId,
    storefrontId: input.storefrontId,
    propertyId: input.propertyId,
    sponsorshipId: input.sponsorshipId,
    purpose: input.purpose,
    currency: 'GHS',
    grossAmount: split.grossAmount,
    platformFeePercent: split.platformFeePercent,
    platformFeeAmount: split.platformFeeAmount,
    sellerExpectedAmount: split.sellerExpectedAmount,
    feeBearer: split.feeBearer,
    discountAmount: split.discountAmount,
    // The normalised code and the funding source that validateCoupon resolved,
    // so reconciliation knows whose margin paid for the discount.
    couponCode,
    discountSource,
    subaccountCode: account.subaccountCode,
    status: 'initialized',
  })

  try {
    const init = await initializeSplitTransaction({
      email: input.email,
      amount: split.payableAmount,
      reference,
      subaccountCode: account.subaccountCode,
      feeBearer: split.feeBearer,
      metadata: { propertyId: input.propertyId, sellerId: input.sellerId, purpose: input.purpose },
    })

    transaction.providerAccessCode = init.accessCode
    transaction.providerReference = init.reference
    transaction.status = 'pending'
    await transaction.save()

    success(res, {
      reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
      payableAmount: split.payableAmount,
      platformFeeAmount: split.platformFeeAmount,
      sellerExpectedAmount: split.sellerExpectedAmount,
    }, 'Payment initialized', 201)
  } catch (err) {
    transaction.status = 'failed'
    await transaction.save()
    error(res, `Could not start the payment: ${(err as Error).message}`, 502)
  }
}))

/** Server-side verification — never trust the browser redirect (spec §8.4). */
router.get('/verify/:reference', asyncHandler(async (req, res) => {
  const reference = param(req.params.reference)
  const transaction = await MarketplaceTransaction.findOne({ reference })
  if (!transaction) { error(res, 'Transaction not found', 404); return }

  try {
    const verified = await verifyTransaction(reference)
    if (verified.status === 'success' && transaction.status !== 'paid') {
      transaction.status = 'paid'
      transaction.verifiedAt = new Date()
      transaction.processorFeeAmount = verified.fees
      await transaction.save()
    }
    success(res, {
      reference,
      status: transaction.status,
      grossAmount: transaction.grossAmount,
      platformFeeAmount: transaction.platformFeeAmount,
      sellerExpectedAmount: transaction.sellerExpectedAmount,
    })
  } catch (err) {
    error(res, `Could not verify with the provider: ${(err as Error).message}`, 502)
  }
}))

/** Seller's own transactions. */
router.get('/transactions', authenticate, asyncHandler(async (req, res) => {
  const items = await MarketplaceTransaction.find({ sellerId: req.user!.userId })
    .sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((t) => ({ ...t, id: String(t._id) })), total: items.length })
}))

/** Admin reconciliation view (spec §14). */
router.get('/admin/transactions', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {}
  if (req.query.status) filter.status = req.query.status
  if (req.query.sellerId) filter.sellerId = req.query.sellerId

  const items = await MarketplaceTransaction.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  const grossTotal = items.reduce((sum, t) => sum + t.grossAmount, 0)
  const feeTotal = items.reduce((sum, t) => sum + t.platformFeeAmount, 0)

  success(res, {
    items: items.map((t) => ({ ...t, id: String(t._id) })),
    total: items.length,
    grossTotal,
    platformFeeTotal: feeTotal,
  })
}))

export default router

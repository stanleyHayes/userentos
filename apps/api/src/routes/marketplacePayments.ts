/**
 * Marketplace payments: seller onboarding, split initialization and
 * verification (spec §8).
 */
import { Router } from 'express'
import type { Types } from 'mongoose'
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
  initializePlatformTransaction,
} from '../services/marketplace/paystack.js'
import { logger } from '../utils/logger.js'
import { applySuccessfulCharge, BINDING_KEY, SETTLEABLE_STATUSES } from '../services/marketplace/settle.js'
import { resolveQuote } from '../services/marketplace/pricing.js'
import { reconcileCheckout } from '../services/marketplace/reconcile.js'
import { isDuplicateKey as duplicateOn, requireIdempotencyKey } from '../services/payments/checkout.js'

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
  /*
   * What is being bought. The SERVER prices it — see services/marketplace/
   * pricing.ts. There is deliberately no `amount` and no `sellerId` here:
   * both used to come from the request body, which let an authenticated buyer
   * name their own price and nominate who got paid.
   */
  // A free string, deliberately: resolveQuote is the one place that decides
  // what can be paid for, and it gives a specific reason. A zod enum here
  // would reject an unpriceable purpose with "expected service_booking",
  // which tells the caller nothing about why.
  purpose: z.string().min(1).max(60),
  /** The order being paid for, for purposes that have one. */
  bookingId: z.string().optional(),
  /** The campaign a sponsorship payment is for. Its PRICE still comes from
   *  the server's own record, never from the request. */
  sponsorshipId: z.string().max(64).optional(),
  /** Receipt address. Not used to identify anyone. */
  email: z.string().email(),
  // No discountAmount either — the discount is derived from couponCode below.
  couponCode: z.string().max(40).optional(),
  /** Client-supplied idempotency key (spec §15). Scoped to the buyer; never
   *  the provider reference. Required — here or as the Idempotency-Key header. */
  idempotencyKey: z.string().min(8).max(80).optional(),
})

/**
 * The provider reference, always minted here.
 *
 * It used to be the client's idempotency key when one was sent. Rent, wallet
 * deposits and orders share one Paystack account, so a buyer could send the
 * reference of their own successful wallet deposit: Paystack refused the
 * duplicate, the row was kept as failed, and /verify then found the deposit's
 * success and marked the order paid.
 */
const newReference = (prefix: 'MKT' | 'SPN') =>
  `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`

/** The replayed response for an idempotency key this buyer already used. */
async function replayed(buyerId: string, idempotencyKey: string) {
  const existing = await MarketplaceTransaction.findOne({ buyerId, idempotencyKey }).lean()
  return existing
    ? { reference: existing.reference, accessCode: existing.providerAccessCode, alreadyInitialized: true }
    : null
}

/** How long an unfinished checkout holds one of its coupon's uses. */
const COUPON_HOLD_MS = 30 * 60_000

/**
 * Start a split payment.
 *
 * Both the price and the payee come from the server: `resolveQuote` reads them
 * off the order being paid for, so a buyer can neither choose what they pay
 * nor who receives it. A purpose the server cannot price is refused outright
 * rather than trusted.
 *
 * The fee percentage is read from the seller's plan and SNAPSHOTTED onto the
 * transaction, so a later plan change never rewrites this payment's economics.
 *
 * Authenticated: this was once reachable with no credentials at all, because
 * `optionalAuth` is global and the handler simply carried on with req.user
 * undefined.
 */
router.post('/initialize', authenticate, asyncHandler(async (req, res) => {
  const parsed = initSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const input = parsed.data

  const buyerId = req.user!.userId

  // Idempotency: this buyer replaying the same key gets the original
  // transaction back rather than a second charge. Required (428 without one),
  // from the body as before or the Idempotency-Key header.
  const idempotencyKey = requireIdempotencyKey(req, res, input.idempotencyKey)
  if (!idempotencyKey) return
  {
    const replay = await replayed(buyerId, idempotencyKey)
    if (replay) { success(res, replay, 'Payment already initialized'); return }
  }

  /*
   * One open checkout per order. A second initialize for the same booking or
   * sponsorship — another tab, another device, a new key — resumes the
   * checkout already under way instead of opening a second charge that could
   * also settle. Enforced by a unique index on openOrderKey, cleared when the
   * checkout is paid, fails or is abandoned. A checkout older than the coupon
   * hold is asked about first: if the provider says it will never be paid, it
   * is closed and a fresh one is opened.
   */
  let openOrderKey = ''
  const openCheckout = async (): Promise<boolean> => {
    const open = await MarketplaceTransaction.findOne({ openOrderKey })
    if (!open) return false
    if (Date.now() - new Date(open.createdAt).getTime() > COUPON_HOLD_MS) {
      const outcome = await reconcileCheckout(open, { abandonAfterMs: COUPON_HOLD_MS }).catch(() => 'open' as const)
      if (outcome === 'closed') return false
      if (outcome === 'paid') { error(res, 'This order has already been paid.', 409); return true }
    }
    res.status(409).json({
      success: false,
      error: 'A checkout for this order is already in progress. Complete it before starting another.',
      code: 'PAYMENT_IN_PROGRESS',
      // Only the buyer who opened it may resume it.
      ...(open.buyerId === buyerId ? { data: { reference: open.reference, accessCode: open.providerAccessCode, status: open.status, alreadyInitialized: true } } : {}),
    })
    return true
  }

  /** Create the row; a concurrent request with the same key, or for the same order, loses to the first. */
  const createTransaction = async (fields: Record<string, unknown>) => {
    try {
      return await MarketplaceTransaction.create({
        ...fields, buyerId, idempotencyKey, providerBound: true, openOrderKey,
      })
    } catch (err) {
      if (duplicateOn(err)) {
        const replay = await replayed(buyerId, idempotencyKey)
        if (replay) { success(res, replay, 'Payment already initialized'); return null }
        if (duplicateOn(err, 'openOrderKey') && await openCheckout()) return null
      }
      throw err
    }
  }

  /** A checkout the provider refused to open is closed, freeing its order. */
  const failCheckout = (transaction: { _id: Types.ObjectId }) => MarketplaceTransaction.updateOne(
    { _id: transaction._id, status: { $in: SETTLEABLE_STATUSES } },
    { $set: { status: 'failed', failureReason: 'initialization_failed' }, $unset: { openOrderKey: 1 } },
  )

  // Price and payee, both from the server's own records.
  const quote = await resolveQuote({
    purpose: input.purpose,
    buyerId: req.user!.userId,
    bookingId: input.bookingId,
    sponsorshipId: input.sponsorshipId,
  })
  if (!quote.ok) { error(res, quote.reason, quote.status); return }

  openOrderKey = quote.payee === 'platform' ? `sponsorship:${quote.sponsorshipId}` : `booking:${quote.bookingId}`
  if (await openCheckout()) return

  /*
   * A platform charge has no seller, no subaccount and no split: the buyer is
   * paying Rentos for something Rentos provides. Sponsorship is the case that
   * exists today — campaigns were created 'pending_payment' and settlement
   * already knew how to activate them, but nothing could charge for one, so
   * they sat unpaid forever.
   *
   * Coupons are deliberately not applied here. validateCoupon resolves a
   * funding source of 'platform' or 'seller', and on a charge with no seller
   * half of that has no meaning; a discount on platform revenue is a pricing
   * decision, not a checkout one.
   */
  if (quote.payee === 'platform') {
    const reference = newReference('SPN')

    const transaction = await createTransaction({
      reference,
      buyerEmail: input.email,
      sponsorshipId: quote.sponsorshipId,
      purpose: input.purpose,
      currency: 'GHS',
      grossAmount: quote.amount,
      // The whole charge is platform revenue; there is nobody to split with.
      platformFeePercent: 100,
      platformFeeAmount: quote.amount,
      sellerExpectedAmount: 0,
      feeBearer: 'platform',
      discountAmount: 0,
      status: 'initialized',
    })
    if (!transaction) return

    try {
      const init = await initializePlatformTransaction({
        email: input.email,
        amount: quote.amount,
        reference,
        metadata: {
          [BINDING_KEY]: String(transaction._id),
          purpose: input.purpose,
          sponsorshipId: quote.sponsorshipId,
          description: quote.description,
        },
      })

      // Conditional: a webhook or sweep may already have moved this row.
      await MarketplaceTransaction.updateOne(
        { _id: transaction._id, status: 'initialized' },
        { $set: { providerAccessCode: init.accessCode, providerReference: init.reference, status: 'pending' } },
      )

      success(res, {
        reference,
        authorizationUrl: init.authorizationUrl,
        accessCode: init.accessCode,
        payableAmount: quote.amount,
        platformFeeAmount: quote.amount,
        sellerExpectedAmount: 0,
      }, 'Payment initialized', 201)
    } catch (err) {
      await failCheckout(transaction)
      error(res, `Could not start the payment: ${(err as Error).message}`, 502)
    }
    return
  }

  const account = await PaymentAccount.findOne({ ownerId: quote.sellerId }).lean()
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
    // A use is only counted when a payment settles, so checkouts already
    // under way with this code count against its limits here.
    const unsettled = {
      couponCode: input.couponCode.trim().toUpperCase(),
      status: { $in: SETTLEABLE_STATUSES },
      createdAt: { $gt: new Date(Date.now() - COUPON_HOLD_MS) },
    }
    const [mine, total] = await Promise.all([
      MarketplaceTransaction.countDocuments({ ...unsettled, buyerId }),
      MarketplaceTransaction.countDocuments(unsettled),
    ])
    const coupon = await validateCoupon({
      code: input.couponCode,
      userId: buyerId,
      amount: quote.amount,
      sellerId: quote.sellerId,
      inFlight: { mine, total },
    })
    if (!coupon.valid) { error(res, coupon.reason ?? 'That coupon cannot be used.', 422); return }
    discountAmount = coupon.discountAmount
    couponCode = input.couponCode.trim().toUpperCase()
    discountSource = coupon.fundingSource
  }

  const platformFeePercent = await getNumericFeature(quote.sellerId, 'platform.fee_percent')
  const split = calculateSplit({
    grossAmount: quote.amount,
    platformFeePercent,
    discountAmount,
  })

  const reference = newReference('MKT')

  const transaction = await createTransaction({
    reference,
    buyerEmail: input.email,
    sellerId: quote.sellerId,
    bookingId: quote.bookingId,
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
  if (!transaction) return

  try {
    const init = await initializeSplitTransaction({
      email: input.email,
      amount: split.payableAmount,
      reference,
      subaccountCode: account.subaccountCode,
      feeBearer: split.feeBearer,
      metadata: {
        [BINDING_KEY]: String(transaction._id),
        bookingId: quote.bookingId, sellerId: quote.sellerId, purpose: input.purpose, description: quote.description,
      },
    })

    // Conditional: a webhook or sweep may already have moved this row.
    await MarketplaceTransaction.updateOne(
      { _id: transaction._id, status: 'initialized' },
      { $set: { providerAccessCode: init.accessCode, providerReference: init.reference, status: 'pending' } },
    )

    success(res, {
      reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
      payableAmount: split.payableAmount,
      platformFeeAmount: split.platformFeeAmount,
      sellerExpectedAmount: split.sellerExpectedAmount,
    }, 'Payment initialized', 201)
  } catch (err) {
    await failCheckout(transaction)
    error(res, `Could not start the payment: ${(err as Error).message}`, 502)
  }
}))

/**
 * Server-side verification — never trust the browser redirect (spec §8.4).
 *
 * Authenticated and scoped to the buyer: anyone holding a reference could
 * otherwise drive settlement of an order that is not theirs and read its
 * economics back.
 */
router.get('/verify/:reference', authenticate, asyncHandler(async (req, res) => {
  const reference = param(req.params.reference)
  const isAdmin = req.user!.roles.some((r) => r === 'admin' || r === 'super_admin')
  const transaction = await MarketplaceTransaction.findOne(isAdmin ? { reference } : { reference, buyerId: req.user!.userId })
  if (!transaction) { error(res, 'Transaction not found', 404); return }

  try {
    const verified = await verifyTransaction(reference)
    // The same rules the webhook applies. This path used to set status='paid'
    // with no amount check, so a charge the webhook would have REFUSED for a
    // mismatch could be accepted just by polling here instead.
    await applySuccessfulCharge(transaction, verified, 'verify')
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

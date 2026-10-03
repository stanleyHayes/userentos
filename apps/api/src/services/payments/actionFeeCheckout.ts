/**
 * Collecting a pay-per-action fee (services/actionFees.ts), on the same rules
 * as a paid plan: the client's Idempotency-Key replays a retried request, one
 * open collection per thing being paid for (Payment.openCollectionKey), and
 * the Payment is saved before the provider is called so an interrupted
 * initiation is still reconcilable. What the fee unlocks is applied only once
 * the payment is verified (finalize.ts → applyActionFee).
 */
import type { Request, Response } from 'express'
import { z } from 'zod'
import { Payment, type IPayment } from '../../models/Payment.js'
import { Agreement } from '../../models/Agreement.js'
import { User } from '../../models/User.js'
import { success, error } from '../../utils/response.js'
import { logger } from '../../utils/logger.js'
import { collectionCorrelator, getProvider, isMethodAvailable, unavailableMethodError } from './index.js'
import { answerRetry, isDuplicateKey, requireIdempotencyKey, respondCollectionInProgress, respondCollectionRefused, respondCollectionUncertain } from './checkout.js'
import { CollectionRefusedError, type ProviderId } from './types.js'
import { recordCollectionInitiation, recordRefusedCollection, recordUncertainCollection } from './collectionInitiation.js'
import { ACTION_FEES, PASSPORT_EXPORT_WINDOW_MS, feeQuote, type ActionFeePurpose } from '../actionFees.js'

const bodySchema = z.object({
  method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']),
  phone: z.string().min(9).max(15).optional(),
})

export interface ActionFeeCheckout {
  purpose: ActionFeePurpose
  /** What is being paid for: the agreement, or the payer for a passport export. */
  subjectId: string
  narration: string
}

export async function startActionFeeCheckout(req: Request, res: Response, checkout: ActionFeeCheckout): Promise<void> {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { method, phone } = parsed.data
  if (method !== 'bank_transfer' && !phone) { error(res, 'Enter the mobile money number to charge'); return }
  const idempotencyKey = requireIdempotencyKey(req, res)
  if (!idempotencyKey) return

  const userId = req.user!.userId
  const fee = feeQuote(checkout.purpose)
  const replayed = async () => {
    const existing = await Payment.findOne({ idempotencyKey, tenantId: userId }).lean()
    if (!existing) return false
    if (existing.purpose !== checkout.purpose || existing.purposeMeta?.subjectId !== checkout.subjectId || existing.method !== method) {
      error(res, 'Idempotency-Key was already used for a different payment', 409); return true
    }
    return answerRetry(res, existing, { fee })
  }
  if (await replayed()) return

  if (!isMethodAvailable(method as ProviderId)) { const unavailable = unavailableMethodError(); error(res, unavailable.message, unavailable.status); return }

  const openCollectionKey = `${checkout.purpose}:${checkout.subjectId}`
  const inFlight = async () => {
    const open = await Payment.findOne({ openCollectionKey }).lean()
    if (!open) return false
    // The other party's payment is theirs: say it is under way, show nothing of it.
    if (open.tenantId !== userId) res.status(409).json({ success: false, error: 'The other party is already paying this fee. Check back in a few minutes.', code: 'PAYMENT_IN_PROGRESS' })
    else respondCollectionInProgress(res, open)
    return true
  }
  if (await inFlight()) return

  const reference = `${ACTION_FEES[checkout.purpose].referencePrefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  let payment: IPayment | undefined
  try {
    const provider = getProvider(method as ProviderId)
    const providerRef = collectionCorrelator(provider, reference)
    payment = await Payment.create({
      collectionSource: provider.source,
      providerRef,
      openCollectionKey,
      tenantId: userId,
      amount: fee.amount,
      method,
      status: 'pending',
      reference,
      purpose: checkout.purpose,
      purposeMeta: { subjectId: checkout.subjectId },
      idempotencyKey,
    })
    const result = await provider.initiateCollection({
      amount: fee.amount,
      phone: phone ?? '',
      reference,
      providerRef,
      narration: checkout.narration,
      payerEmail: req.user!.email,
    })
    const recorded = await recordCollectionInitiation(payment._id.toString(), result)
    if (!recorded) throw new Error('Payment record unavailable after initiation')
    success(res, { payment: { ...recorded, id: recorded._id.toString() }, instructions: result.instructions, fee }, `Approve the GH₵${fee.amount} payment on your phone`, 201)
  } catch (err) {
    if (!payment && isDuplicateKey(err)) {
      if (await replayed()) return
      if (isDuplicateKey(err, 'openCollectionKey') && await inFlight()) return
    }
    if (payment && err instanceof CollectionRefusedError) {
      const refused = await recordRefusedCollection(payment._id.toString(), err.reason).catch(() => null)
      if (refused) { respondCollectionRefused(res, refused, err.reason); return }
    }
    if (payment) {
      await recordUncertainCollection(payment._id.toString()).catch(() => undefined)
      respondCollectionUncertain(res, payment, err)
      return
    }
    throw err
  }
}

/**
 * What a verified fee payment buys. Safe to call more than once: the
 * agreement is unlocked only if it is not already, and a passport export is
 * credited only by the call that stamps feeAppliedAt on the payment.
 */
export async function applyActionFee(payment: IPayment): Promise<void> {
  const subjectId = String(payment.purposeMeta?.subjectId ?? '')
  if (!subjectId) { logger.error(`[Payments] fee payment ${payment.reference} has no subject`); return }
  const paymentId = String(payment._id)

  // Each unlock is safe to repeat, so a retry after a failure (or two callers
  // at once) applies it exactly once.
  if (payment.purpose === 'agreement_fee') {
    await Agreement.updateOne({ _id: subjectId, signingFeePaidAt: { $exists: false } }, { $set: { signingFeePaidAt: new Date(), signingFeePaymentId: paymentId } })
  } else if (payment.purpose === 'passport_export') {
    await User.updateOne(
      { _id: payment.tenantId, passportExportPaymentIds: { $ne: paymentId } },
      { $inc: { passportExportCredits: 1 }, $push: { passportExportPaymentIds: paymentId } },
    )
  }
  // Marked last: if the unlock above failed, the payment stays unmarked and
  // recoverActionFees retries it.
  await Payment.updateOne({ _id: payment._id, feeAppliedAt: { $exists: false } }, { $set: { feeAppliedAt: new Date() } })
}

/**
 * Completed fee payments whose unlock never ran (a database error between the
 * payment completing and the unlock). Run by the scheduler.
 */
export async function recoverActionFees(limit = 50): Promise<{ checked: number; applied: number }> {
  const stuck = await Payment.find({ purpose: { $in: ['agreement_fee', 'passport_export'] }, status: 'completed', feeAppliedAt: { $exists: false } }).limit(limit)
  let applied = 0
  for (const payment of stuck) {
    try {
      await applyActionFee(payment)
      applied += 1
    } catch (err) {
      logger.error(`[Payments] fee unlock for ${payment.reference} still failing: ${(err as Error).message}`)
    }
  }
  return { checked: stuck.length, applied }
}

/**
 * Take one paid passport export, or reuse the one taken in the last half
 * hour (a failed download, a second link). False when none is available.
 */
export async function usePassportExport(userId: string, now = new Date()): Promise<boolean> {
  const windowOpen = await User.exists({ _id: userId, passportExportUnlockedUntil: { $gt: now } })
  if (windowOpen) return true
  const used = await User.updateOne(
    { _id: userId, passportExportCredits: { $gte: 1 } },
    { $inc: { passportExportCredits: -1 }, $set: { passportExportUnlockedUntil: new Date(now.getTime() + PASSPORT_EXPORT_WINDOW_MS) } },
  )
  return used.modifiedCount === 1
}

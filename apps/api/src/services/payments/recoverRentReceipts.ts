import { randomUUID } from 'node:crypto'
import { Payment } from '../../models/Payment.js'
import { issueRentReceipt, RentReceiptError } from './rentReceipt.js'

const due = (now: Date) => ({ purpose: 'rent' as const, status: 'completed', rentReceipt: { $exists: false }, $or: [{ receiptIssueNextAttemptAt: { $exists: false } }, { receiptIssueNextAttemptAt: { $lte: now } }] })

/** A crashed claim expires. Issuance itself remains conditional on the payment's immutable facts. */
export async function recoverRentReceipt(paymentId: string, now = new Date()): Promise<'issued' | 'deferred' | 'skipped'> {
  const claim = randomUUID()
  const payment = await Payment.findOneAndUpdate({ _id: paymentId, ...due(now) }, {
    $set: { receiptIssueClaim: claim, receiptIssueNextAttemptAt: new Date(now.getTime() + 60_000) },
    $inc: { receiptIssueAttempts: 1 },
  }, { returnDocument: 'after' }).lean()
  if (!payment) return 'skipped'
  try {
    await issueRentReceipt(String(payment._id), payment.tenantId)
    await Payment.updateOne({ _id: payment._id, receiptIssueClaim: claim }, { $unset: { receiptIssueClaim: '', receiptIssueNextAttemptAt: '', receiptIssueFailure: '' } })
    return 'issued'
  } catch (failure) {
    const incomplete = failure instanceof RentReceiptError
    const delay = incomplete ? 24 * 60 * 60_000 : Math.min(60 * 60_000, 60_000 * 2 ** Math.min(payment.receiptIssueAttempts ?? 1, 6))
    await Payment.updateOne({ _id: payment._id, receiptIssueClaim: claim }, { $set: {
      receiptIssueFailure: incomplete ? 'details_or_state' : 'temporary_failure',
      receiptIssueNextAttemptAt: new Date(now.getTime() + delay),
    }, $unset: { receiptIssueClaim: '' } })
    return 'deferred'
  }
}

export async function recoverRentReceipts(limit = 50) {
  const now = new Date()
  const candidates = await Payment.find(due(now)).sort({ receiptIssueNextAttemptAt: 1, _id: 1 }).limit(Math.max(1, Math.min(100, Math.floor(limit) || 50))).select('_id').lean()
  const result = { issued: 0, deferred: 0, skipped: 0 }
  for (const payment of candidates) {
    try { result[await recoverRentReceipt(String(payment._id), now)]++ }
    catch { result.deferred++ } // A database failure leaves the claim eligible after expiry.
  }
  return result
}

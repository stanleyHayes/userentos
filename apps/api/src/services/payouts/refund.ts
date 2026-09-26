/**
 * Payout refunds, applied durably.
 *
 * A refund used to be a plain creditWallet after the payout went terminal. If
 * that write failed the payout stayed failed with refunded:true and nothing
 * ever retried it — and creditWallet is not idempotent, so a naive retry
 * would have credited twice. Now the refund is captured as `refundIntent` in
 * the same conditional update that makes the payout terminal (failed,
 * declined or reversed), and applied through the durable wallet-credit
 * journal, keyed `payout-refund:v1:<payoutId>`. Any worker can finish it; no
 * worker can apply it twice.
 */
import { Payout } from '../../models/Payout.js'
import { applyWalletCredit, prepareWalletCredit } from '../payments/durableWalletCredit.js'

/** Apply a payout's captured refund. True once the money is back in the wallet. */
export async function applyPayoutRefund(payoutId: string): Promise<boolean> {
  const payout = await Payout.findById(payoutId).lean()
  if (!payout?.refundIntent || payout.refundIntent.version !== 1) return false
  if (payout.refundCompletedAt) return true
  const intent = payout.refundIntent
  await prepareWalletCredit(intent)
  const applied = await applyWalletCredit(intent.operationKey)
  if (applied) await Payout.updateOne({ _id: payout._id, refundCompletedAt: { $exists: false } }, { $set: { refundCompletedAt: new Date() }, $unset: { refundNextAttemptAt: '' } })
  return applied
}

/**
 * Scheduled recovery: finish every claimed refund that has not been applied.
 * Each payout is claimed (next attempt pushed out) before it is worked, so
 * overlapping runs do not both try. `scope` narrows the run (tests share a
 * database).
 */
export async function recoverPayoutRefunds(opts: { now?: Date; limit?: number; scope?: Record<string, unknown> } = {}) {
  const { now = new Date(), limit = 50, scope = {} } = opts
  const due: Record<string, unknown> = {
    ...scope,
    'refundIntent.version': 1,
    refundCompletedAt: { $exists: false },
    $or: [{ refundNextAttemptAt: { $exists: false } }, { refundNextAttemptAt: { $lte: now } }],
  }
  const payouts = await Payout.find(due).sort({ refundNextAttemptAt: 1, _id: 1 }).limit(limit).select('_id').lean()
  const result = { completed: 0, deferred: 0 }
  for (const payout of payouts) {
    try {
      const claimed = await Payout.updateOne({ ...due, _id: payout._id }, { $set: { refundNextAttemptAt: new Date(now.getTime() + 5 * 60_000) } })
      if (!claimed.modifiedCount) continue
      if (await applyPayoutRefund(String(payout._id))) result.completed++
      else result.deferred++
    } catch { result.deferred++ }
  }
  return result
}

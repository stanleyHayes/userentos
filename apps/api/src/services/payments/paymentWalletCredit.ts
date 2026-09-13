import { Payment } from '../../models/Payment.js'
import { Wallet } from '../../models/Wallet.js'
import { prepareWalletCredit, applyWalletCredit } from './durableWalletCredit.js'
import { round2 } from '../../utils/money.js'

export function paymentCreditIntent(payment: { _id: unknown; purpose: string; tenantId: string; landlordId?: string; amount: number; reference: string }) {
  if (payment.purpose !== 'rent' && payment.purpose !== 'wallet_deposit') return undefined
  const userId = payment.purpose === 'rent' ? payment.landlordId : payment.tenantId
  const amount = round2(payment.amount)
  if (!userId || !payment.reference || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('Payment credit terms require resolution before completion')
  return { version: 1, operationKey: `payment-credit:v1:${String(payment._id)}`, userId, amount, type: payment.purpose === 'rent' ? 'rent_payment' : 'deposit', reference: payment.reference }
}

/** Only explicitly captured intents are recoverable; legacy completion is not evidence of missing credit. */
export async function recoverPaymentWalletCredit(paymentId: string): Promise<boolean> {
  const payment = await Payment.findById(paymentId).lean()
  if (!payment?.walletCreditIntent || payment.walletCreditIntent.version !== 1) return false
  const intent = payment.walletCreditIntent
  await prepareWalletCredit(intent)
  const applied = await applyWalletCredit(intent.operationKey)
  if (applied) await Payment.updateOne({ _id: payment._id, walletCreditIntent: intent, walletCreditCompletedAt: { $exists: false } }, { $set: { walletCreditCompletedAt: new Date() }, $unset: { walletCreditNextAttemptAt: '' } })
  return applied
}

export async function recoverPaymentWalletCredits() {
  // Completed journals can still own an uncleared wallet slot after a crash.
  const slots = await Wallet.find({ pendingCredit: { $exists: true } }).sort({ updatedAt: 1 }).limit(50).select('pendingCredit').lean()
  const result = { completed: 0, deferred: 0 }
  for (const wallet of slots) {
    try { await applyWalletCredit(wallet.pendingCredit!.operationKey) } catch { result.deferred++ }
  }
  const now = new Date()
  const payments = await Payment.find({ 'walletCreditIntent.version': 1, walletCreditCompletedAt: { $exists: false }, $or: [{ walletCreditNextAttemptAt: { $exists: false } }, { walletCreditNextAttemptAt: { $lte: now } }] }).sort({ walletCreditNextAttemptAt: 1, _id: 1 }).limit(50).select('_id').lean()
  for (const payment of payments) {
    try {
      await Payment.updateOne({ _id: payment._id, walletCreditCompletedAt: { $exists: false } }, { $set: { walletCreditNextAttemptAt: new Date(now.getTime() + 5 * 60_000) } })
      if (await recoverPaymentWalletCredit(String(payment._id))) result.completed++
      else result.deferred++
    } catch { result.deferred++ }
  }
  return result
}

import { Payment } from '../../models/Payment.js'
import { User } from '../../models/User.js'
import type { SubscriptionTerms } from './subscriptionTerms.js'

export function subscriptionPeriod(start: Date, cycle: 'monthly' | 'yearly') {
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid subscription start')
  const end = new Date(start)
  const day = start.getUTCDate()
  end.setUTCDate(1)
  if (cycle === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return end
}

interface Grant { paymentId: string; startsAt: string; endsAt: string; terms: SubscriptionTerms }
export interface Subscriber { _id?: unknown; subscriptionSnapshotJson?: string; subscriptionPaymentId?: string; subscriptionPackageId?: string; subscriptionPlanVersion?: number; subscriptionStartDate?: Date; subscriptionEndDate?: Date }

/** Old snapshots cannot survive a free/admin assignment that changes the subscription dates. */
export async function currentPaidSubscription(user: Subscriber, now = new Date()) {
  if (!user.subscriptionSnapshotJson) return null
  try {
    const grant = JSON.parse(user.subscriptionSnapshotJson) as Grant
    if (grant.paymentId !== user.subscriptionPaymentId || grant.terms.packageId !== user.subscriptionPackageId || grant.terms.packageVersion !== user.subscriptionPlanVersion || new Date(user.subscriptionStartDate!).toISOString() !== grant.startsAt || new Date(user.subscriptionEndDate!).toISOString() !== grant.endsAt) return null
    const features = JSON.parse(grant.terms.featuresJson) as Record<string, boolean | number | string>
    const active = Date.parse(grant.startsAt) <= now.getTime() && Date.parse(grant.endsAt) > now.getTime() && !!await Payment.exists({ _id: grant.paymentId, tenantId: String(user._id), purpose: 'subscription', status: 'completed' })
    return { active, ...grant, features }
  } catch { return { active: false } }
}

/** Retry dates derive from paidAt, never from the time a recovery worker runs. */
export async function activatePaidSubscription(paymentId: string, now = new Date()): Promise<boolean> {
  const payment = await Payment.findById(paymentId).lean()
  if (!payment || payment.purpose !== 'subscription' || payment.status !== 'completed' || !payment.subscriptionTerms) return false
  if (payment.subscriptionActivatedAt) return true
  const terms = payment.subscriptionTerms
  const start = new Date(payment.subscriptionCoverageStartsAt ?? payment.paidAt ?? '')
  if (terms.version !== 1 || payment.amount !== terms.amount || !Number.isFinite(start.getTime()) || start.getTime() > now.getTime()) return false
  const end = payment.subscriptionCoverageEndsAt ?? subscriptionPeriod(start, terms.billingCycle)
  if (!payment.subscriptionCoverageStartsAt || !payment.subscriptionCoverageEndsAt) {
    const prepared = await Payment.updateOne({ _id: payment._id, status: 'completed', paidAt: payment.paidAt, amount: payment.amount, subscriptionTerms: terms, subscriptionCoverageStartsAt: { $exists: false }, subscriptionCoverageEndsAt: { $exists: false } }, { $set: { subscriptionCoverageStartsAt: start, subscriptionCoverageEndsAt: end } }, { overwriteImmutable: true, runValidators: true })
    if (!prepared.modifiedCount) return false
  }
  if (end <= now) {
    await Payment.updateOne({ _id: payment._id }, { $set: { subscriptionActivationResult: 'expired', subscriptionActivatedAt: now } })
    return true
  }
  const grant: Grant = { paymentId, startsAt: start.toISOString(), endsAt: end.toISOString(), terms }
  const updated = await User.updateOne({
    _id: payment.tenantId, deletedAt: { $exists: false }, suspendedAt: { $exists: false }, roles: { $in: ['landlord', 'property_manager'] },
    $or: [{ subscriptionStartDate: { $exists: false } }, { subscriptionStartDate: { $lt: start } }, { subscriptionStartDate: start, subscriptionPaymentId: { $lte: paymentId } }],
  }, { $set: { subscriptionPackageId: terms.packageId, subscriptionPlanVersion: terms.packageVersion, subscriptionStartDate: start, subscriptionEndDate: end, subscriptionPaymentId: paymentId, subscriptionSnapshotJson: JSON.stringify(grant) } })
  let result: 'applied' | 'superseded' = 'applied'
  if (!updated.matchedCount) {
    const newer = await User.exists({ _id: payment.tenantId, deletedAt: { $exists: false }, $or: [{ subscriptionStartDate: { $gt: start } }, { subscriptionStartDate: start, subscriptionPaymentId: { $gt: paymentId } }] })
    if (!newer) return false
    result = 'superseded'
  }
  await Payment.updateOne({ _id: payment._id, subscriptionActivatedAt: { $exists: false } }, { $set: { subscriptionActivatedAt: now, subscriptionActivationResult: result }, $unset: { subscriptionNextAttemptAt: '' } })
  return true
}

export async function recoverPaidSubscriptions() {
  const now = new Date()
  const payments = await Payment.find({ purpose: 'subscription', status: 'completed', 'subscriptionTerms.version': 1, subscriptionActivatedAt: { $exists: false }, $or: [{ subscriptionNextAttemptAt: { $exists: false } }, { subscriptionNextAttemptAt: { $lte: now } }] }).sort({ subscriptionNextAttemptAt: 1, _id: 1 }).limit(50).select('_id').lean()
  const result = { completed: 0, deferred: 0 }
  for (const payment of payments) {
    try {
      await Payment.updateOne({ _id: payment._id, subscriptionActivatedAt: { $exists: false } }, { $set: { subscriptionNextAttemptAt: new Date(now.getTime() + 5 * 60_000) } })
      if (await activatePaidSubscription(String(payment._id), now)) result.completed++
      else result.deferred++
    } catch { result.deferred++ }
  }
  return result
}

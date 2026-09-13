import { User } from '../models/User.js'
import { subscriptionPeriod, type Subscriber } from './payments/paidSubscription.js'

/** A free/admin assignment supersedes the observed subscription, not a concurrent renewal. */
export async function assignSubscription(observed: Subscriber & { _id: unknown }, pkg: { _id: unknown; version?: number; billingCycle: 'monthly' | 'yearly' }, now = new Date()) {
  const end = subscriptionPeriod(now, pkg.billingCycle)
  const updated = await User.findOneAndUpdate({
    _id: String(observed._id), deletedAt: { $exists: false },
    subscriptionPackageId: observed.subscriptionPackageId === undefined ? { $exists: false } : observed.subscriptionPackageId,
    subscriptionStartDate: observed.subscriptionStartDate === undefined ? { $exists: false } : observed.subscriptionStartDate,
    subscriptionEndDate: observed.subscriptionEndDate === undefined ? { $exists: false } : observed.subscriptionEndDate,
    subscriptionPaymentId: observed.subscriptionPaymentId === undefined ? { $exists: false } : observed.subscriptionPaymentId,
  }, { $set: { subscriptionPackageId: String(pkg._id), subscriptionPlanVersion: pkg.version ?? 1, subscriptionStartDate: now, subscriptionEndDate: end }, $unset: { subscriptionPaymentId: '', subscriptionSnapshotJson: '' } }, { returnDocument: 'after', runValidators: true })
  return updated
}

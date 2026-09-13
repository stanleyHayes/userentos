import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { currentPaidSubscription, type Subscriber } from './payments/paidSubscription.js'

interface SubscriptionSnapshot extends Pick<Subscriber, 'subscriptionPaymentId' | 'subscriptionSnapshotJson' | 'subscriptionStartDate' | 'subscriptionPlanVersion'> {
  userId: string
  packageId: string
  expiresAt: Date
}
interface FreePackage {
  id: string
  price: number
  version: number
}

/** Compare-and-set prevents a stale scheduler read from overwriting a renewal. */
export async function expireSubscription(snapshot: SubscriptionSnapshot, fallback: FreePackage, now: Date): Promise<{ downgradedFrom?: string }> {
  if (fallback.price !== 0 || !fallback.id || !Number.isInteger(fallback.version) || fallback.version < 1 || !Number.isFinite(now.getTime()) || snapshot.expiresAt.getTime() > now.getTime() || !Number.isFinite(snapshot.expiresAt.getTime())) return {}
  const paid = await currentPaidSubscription({ ...snapshot, _id: snapshot.userId, subscriptionPackageId: snapshot.packageId, subscriptionEndDate: snapshot.expiresAt }, now)
  if ((snapshot.subscriptionPaymentId || snapshot.subscriptionSnapshotJson) && (!paid || !('terms' in paid))) return {}
  const pkg = paid && 'terms' in paid ? { price: paid.terms.amount, name: paid.terms.packageName } : await SubscriptionPackage.findById(snapshot.packageId).select('price name').lean()
  // Missing or malformed plans require review, not perpetual access from
  // silently clearing their expiry date.
  if (!pkg || !Number.isFinite(pkg.price) || pkg.price < 0) return {}
  const filter = {
    _id: snapshot.userId,
    deletedAt: { $exists: false },
    subscriptionPackageId: snapshot.packageId,
    subscriptionEndDate: snapshot.expiresAt,
    subscriptionPaymentId: snapshot.subscriptionPaymentId === undefined ? { $exists: false } : snapshot.subscriptionPaymentId,
    ...(snapshot.subscriptionSnapshotJson ? { subscriptionSnapshotJson: snapshot.subscriptionSnapshotJson } : {}),
  }
  if (pkg.price === 0) {
    await User.updateOne(filter, { $unset: { subscriptionEndDate: 1, subscriptionPaymentId: 1, subscriptionSnapshotJson: 1 } })
    return {}
  }
  const result = await User.updateOne(filter, {
    $set: { subscriptionPackageId: fallback.id, subscriptionPlanVersion: fallback.version, subscriptionStartDate: now },
    $unset: { subscriptionEndDate: 1, subscriptionPaymentId: 1, subscriptionSnapshotJson: 1 },
  })
  return result.modifiedCount === 1 ? { downgradedFrom: pkg.name } : {}
}

import { snapshotPackageEntitlements } from '../entitlements.js'
import { round2 } from '../../utils/money.js'

export interface SubscriptionTerms {
  version: number
  capturedAt: Date
  packageId: string
  packageVersion: number
  packageName: string
  amount: number
  currency: string
  billingCycle: 'monthly' | 'yearly'
  benefits: string[]
  /** A scalar prevents dotted feature keys or nested updates changing saved terms. */
  featuresJson: string
}

export async function captureSubscriptionTerms(pkg: Parameters<typeof snapshotPackageEntitlements>[0] & { price: number }): Promise<SubscriptionTerms> {
  const amount = round2(pkg.price)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('Invalid paid subscription price')
  const snapshot = await snapshotPackageEntitlements(pkg)
  if (!snapshot.planId) throw new Error('Subscription package identifier is missing')
  return { version: 1, capturedAt: new Date(), packageId: snapshot.planId, packageVersion: snapshot.planVersion, packageName: snapshot.planName, amount, currency: 'GHS', billingCycle: snapshot.billingCycle, benefits: snapshot.benefits, featuresJson: JSON.stringify(snapshot.features) }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { expireSubscription } from '../services/subscriptionExpiry.js'

vi.mock('../models/User.js', () => ({ User: { updateOne: vi.fn() } }))
vi.mock('../models/SubscriptionPackage.js', () => ({ SubscriptionPackage: { findById: vi.fn() } }))
const snapshot = { userId: 'user', packageId: 'old-plan', expiresAt: new Date('2026-09-01T00:00:00Z') }
const now = new Date('2026-09-13T00:00:00Z')
const fallback = { id: 'free', price: 0, version: 3 }
function plan(price: number) {
  vi.mocked(SubscriptionPackage.findById).mockReturnValue({ select: () => ({ lean: async () => ({ price, name: 'Previous plan' }) }) } as never)
}
beforeEach(() => {
  vi.clearAllMocks()
  plan(100)
  vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never)
})
describe('subscription expiry compare-and-set', () => {
  it('replaces only the observed expired package and date and pins the fallback version', async () => {
    expect(await expireSubscription(snapshot, fallback, now)).toEqual({ downgradedFrom: 'Previous plan' })
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'user', deletedAt: { $exists: false }, subscriptionPackageId: 'old-plan', subscriptionEndDate: snapshot.expiresAt, subscriptionPaymentId: { $exists: false } }, {
      $set: { subscriptionPackageId: 'free', subscriptionPlanVersion: 3, subscriptionStartDate: now }, $unset: { subscriptionEndDate: 1, subscriptionPaymentId: 1, subscriptionSnapshotJson: 1 },
    })
  })
  it('does not report a downgrade when concurrent renewal or reassignment wins', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 0 } as never)
    expect(await expireSubscription(snapshot, fallback, now)).toEqual({})
  })
  it('also guards free-plan expiry cleanup against a concurrent paid upgrade', async () => {
    plan(0)
    await expireSubscription(snapshot, fallback, now)
    expect(User.updateOne).toHaveBeenCalledWith(expect.objectContaining({ subscriptionPackageId: snapshot.packageId, subscriptionEndDate: snapshot.expiresAt }), { $unset: { subscriptionEndDate: 1, subscriptionPaymentId: 1, subscriptionSnapshotJson: 1 } })
  })
  it('refuses a paid default fallback', async () => {
    expect(await expireSubscription(snapshot, { ...fallback, price: 20 }, now)).toEqual({})
    expect(User.updateOne).not.toHaveBeenCalled()
  })
  it.each([new Date('2027-01-01'), new Date('invalid')])('does not change a non-expired or invalid date %s', async expiresAt => {
    await expireSubscription({ ...snapshot, expiresAt }, fallback, now)
    expect(User.updateOne).not.toHaveBeenCalled()
  })
  it('retains expiry when the original package is missing', async () => {
    vi.mocked(SubscriptionPackage.findById).mockReturnValue({ select: () => ({ lean: async () => null }) } as never)
    await expireSubscription(snapshot, fallback, now)
    expect(User.updateOne).not.toHaveBeenCalled()
  })
  it('expires exactly at the coverage boundary', async () => {
    await expireSubscription({ ...snapshot, expiresAt: now }, fallback, now)
    expect(User.updateOne).toHaveBeenCalledOnce()
  })
  it('propagates write failure for retry without reporting success', async () => {
    vi.mocked(User.updateOne).mockRejectedValue(new Error('database unavailable'))
    await expect(expireSubscription(snapshot, fallback, now)).rejects.toThrow('database unavailable')
  })
})

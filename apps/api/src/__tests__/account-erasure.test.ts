import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every model the erasure touches, as a mock whose writes resolve and whose
// lookups find nothing — each test overrides only what it is about.
const { modelMock } = vi.hoisted(() => {
  const empty = () => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'sort', 'limit', 'lean']) chain[method] = () => chain
    chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve)
    return chain
  }
  const leanNull = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) })
  return {
    modelMock: () => ({
      deleteMany: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      exists: vi.fn().mockResolvedValue(null),
      find: vi.fn(() => empty()),
      findOne: vi.fn(() => leanNull()),
    }),
  }
})

vi.mock('../services/avatarStorage.js', () => ({ eraseAvatars: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/documentErasure.js', () => ({ erasePersonalDocuments: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/propertyImages.js', () => ({ propertyImageAssets: vi.fn(() => []), eraseStoredAssets: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/accountClosure.js', () => ({ releaseStorefrontDomains: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/erasureLedger.js', () => ({ markAccountErasureComplete: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../models/User.js', () => ({ User: { exists: vi.fn(), find: vi.fn(), deleteOne: vi.fn() } }))
vi.mock('../models/Conversation.js', () => ({ Message: modelMock(), Conversation: modelMock() }))
vi.mock('../models/Affiliate.js', () => ({ AffiliateProfile: modelMock(), AffiliateAttribution: modelMock(), AffiliateCommission: modelMock() }))
vi.mock('../models/Promotion.js', () => ({ Promotion: modelMock(), CouponRedemption: modelMock() }))
vi.mock('../models/Document.js', () => ({ DocumentModel: modelMock() }))
for (const name of [
  'UserBlock', 'RefreshToken', 'BiometricToken', 'DeviceToken', 'Notification', 'TenantProfile', 'ProfileAccess', 'Favorite', 'CreditScore',
  'Review', 'Achievement', 'PaymentStreak', 'Payout', 'PayoutAccount', 'PaymentAccount', 'WebhookSubscription', 'BusinessReview', 'BusinessInquiry',
  'Lead', 'Viewing', 'Application', 'Delegation', 'FeatureFlag', 'ContentReport', 'Employment', 'PropertyExpense', 'BlogPost', 'Property', 'Agreement',
  'Payment', 'MarketplaceTransaction', 'Dispute', 'MoveOut', 'MaintenanceRequest', 'Sponsorship', 'Worker', 'ServiceBooking', 'Business',
  'BusinessListing', 'Storefront', 'AgencyProfile',
]) vi.doMock(`../models/${name}.js`, () => ({ [name]: modelMock() }))

const { User } = await import('../models/User.js')
const { Message, Conversation } = await import('../models/Conversation.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { Payout } = await import('../models/Payout.js')
const { PayoutAccount } = await import('../models/PayoutAccount.js')
const { PaymentAccount } = await import('../models/PaymentAccount.js')
const { WebhookSubscription } = await import('../models/WebhookSubscription.js')
const { BusinessReview } = await import('../models/BusinessReview.js')
const { BusinessInquiry } = await import('../models/BusinessInquiry.js')
const { Lead } = await import('../models/Lead.js')
const { Viewing } = await import('../models/Viewing.js')
const { Application } = await import('../models/Application.js')
const { Delegation } = await import('../models/Delegation.js')
const { AffiliateAttribution } = await import('../models/Affiliate.js')
const { FeatureFlag } = await import('../models/FeatureFlag.js')
const { ContentReport } = await import('../models/ContentReport.js')
const { DocumentModel } = await import('../models/Document.js')
const { Employment } = await import('../models/Employment.js')
const { PropertyExpense } = await import('../models/PropertyExpense.js')
const { markAccountErasureComplete } = await import('../services/erasureLedger.js')
const { eraseAccountRecords, purgeExpiredAccounts, ACCOUNT_ERASURE_DELAY_MS } = await import('../services/accountErasure.js')

const cutoff = new Date('2026-08-14T00:00:00Z')
const uid = '6aa5e860ed2f39b2f1054b45'
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(User.exists).mockResolvedValue({ _id: uid } as never)
  vi.mocked(User.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
  vi.mocked(Payout.exists).mockResolvedValue(null)
  vi.mocked(Message.deleteMany).mockResolvedValue({} as never)
  vi.mocked(TenantProfile.deleteMany).mockResolvedValue({} as never)
})

describe('retryable account erasure', () => {
  it('refuses to touch related data when the account is active, absent or not yet due', async () => {
    vi.mocked(User.exists).mockResolvedValue(null)
    expect(await eraseAccountRecords(uid, cutoff)).toBe(false)
    expect(User.exists).toHaveBeenCalledWith({ _id: uid, deletedAt: { $lt: cutoff } })
    expect(Message.deleteMany).not.toHaveBeenCalled()
    expect(User.deleteOne).not.toHaveBeenCalled()
  })
  it('erases duplicate message previews and unread counters as well as messages', async () => {
    expect(await eraseAccountRecords(uid, cutoff)).toBe(true)
    expect(Conversation.updateMany).toHaveBeenCalledWith({ 'lastMessage.senderId': uid }, { $unset: { lastMessage: 1 } })
    expect(Conversation.updateMany).toHaveBeenCalledWith({ participants: uid }, { $pull: { participants: uid }, $unset: { [`unreadCount.${uid}`]: 1 } })
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: uid, deletedAt: { $lt: cutoff } })
    expect(markAccountErasureComplete).toHaveBeenCalledWith(uid)
  })
  it('waits for remaining operations after failure and leaves the tombstone for retry', async () => {
    vi.mocked(Message.deleteMany).mockRejectedValueOnce(new Error('database unavailable'))
    let settle: () => void = () => {}
    const pending = new Promise<void>(resolve => { settle = resolve })
    vi.mocked(TenantProfile.deleteMany).mockReturnValueOnce(pending as never)
    let finished = false
    const result = eraseAccountRecords(uid, cutoff).catch(() => { finished = true })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(finished).toBe(false)
    expect(User.deleteOne).not.toHaveBeenCalled()
    settle()
    await result
    expect(finished).toBe(true)
    expect(User.deleteOne).not.toHaveBeenCalled()
    expect(markAccountErasureComplete).not.toHaveBeenCalled()
    expect(await eraseAccountRecords(uid, cutoff)).toBe(true)
  })
  it('reports an unmatched final deletion as skipped', async () => {
    vi.mocked(User.deleteOne).mockResolvedValueOnce({ deletedCount: 0 } as never)
    expect(await eraseAccountRecords(uid, cutoff)).toBe(false)
    expect(markAccountErasureComplete).not.toHaveBeenCalled()
  })
  it('continues past a failed account and traverses bounded pages using the last ID', async () => {
    const nextUid = '6aa5e860ed2f39b2f1054b46'
    const lean = vi.fn().mockResolvedValueOnce([{ _id: uid }, { _id: nextUid }]).mockResolvedValueOnce([])
    const limit = vi.fn(() => ({ lean }))
    vi.mocked(User.find).mockReturnValue({ select: () => ({ sort: () => ({ limit }) }) } as never)
    vi.mocked(Message.deleteMany).mockRejectedValueOnce(new Error('transient failure'))
    const now = new Date(cutoff.getTime() + ACCOUNT_ERASURE_DELAY_MS)
    expect(await purgeExpiredAccounts(now)).toEqual({ removed: 1, failed: 1, skipped: 0 })
    expect(User.deleteOne).toHaveBeenCalledTimes(1)
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: nextUid, deletedAt: { $lt: cutoff } })
    expect(User.find).toHaveBeenLastCalledWith({ deletedAt: { $lt: cutoff }, _id: { $gt: nextUid } })
    expect(limit).toHaveBeenCalledWith(100)
  })

  it('removes personal data that has no retention reason, from the subject side only', async () => {
    expect(await eraseAccountRecords(uid, cutoff)).toBe(true)
    expect(PayoutAccount.deleteMany).toHaveBeenCalledWith({ userId: uid })
    expect(PaymentAccount.deleteMany).toHaveBeenCalledWith({ ownerId: uid })
    expect(WebhookSubscription.deleteMany).toHaveBeenCalledWith({ userId: uid })
    expect(BusinessReview.updateMany).toHaveBeenCalledWith({ authorId: uid }, { $set: { authorName: 'Deleted User' } })
    expect(BusinessInquiry.deleteMany).toHaveBeenCalledWith({ requesterId: uid })
    expect(Lead.updateMany).toHaveBeenCalledWith({ requesterId: uid }, { $set: { contactName: 'Deleted User', contactPhone: 'removed' }, $unset: { contactEmail: 1, message: 1, requesterId: 1 } })
    expect(Viewing.updateMany).toHaveBeenCalledWith({ requesterId: uid }, { $set: { viewerName: 'Deleted User', viewerPhone: 'removed' }, $unset: { requesterId: 1 } })
    expect(Application.deleteMany).toHaveBeenCalledWith({ tenantId: uid, status: { $ne: 'approved' } })
    expect(Delegation.deleteMany).toHaveBeenCalledWith({ $or: [{ ownerId: uid }, { delegateId: uid }] })
    expect(AffiliateAttribution.updateMany).toHaveBeenCalledWith({ referredUserId: uid }, { $unset: { referredUserId: 1, sessionId: 1 } })
    expect(FeatureFlag.updateMany).toHaveBeenCalledWith({ $or: [{ enabledForUserIds: uid }, { disabledForUserIds: uid }] }, { $pull: { enabledForUserIds: uid, disabledForUserIds: uid } })
    expect(ContentReport.updateMany).toHaveBeenCalledWith({ reporterId: uid }, { $set: { reporterId: expect.stringMatching(/^deleted-/) }, $unset: { ipAddress: 1 } })
    expect(JSON.stringify(vi.mocked(ContentReport.updateMany).mock.calls[0][1])).not.toContain(uid)
    expect(DocumentModel.updateMany).toHaveBeenCalledWith({ accessControl: uid }, { $pull: { accessControl: uid } })
    expect(Employment.deleteMany).toHaveBeenCalledWith({ userId: uid, status: { $in: ['pending', 'declined'] } })
    expect(PropertyExpense.deleteMany).toHaveBeenCalledWith({ landlordId: uid })
  })

  it('keeps the tombstone while a payout is still in flight, so its destination survives', async () => {
    vi.mocked(Payout.exists).mockResolvedValueOnce({ _id: 'payout' } as never)
    await expect(eraseAccountRecords(uid, cutoff)).rejects.toThrow('payout is still in flight')
    expect(Payout.exists).toHaveBeenCalledWith({ userId: uid, status: { $in: ['requested', 'processing'] } })
    expect(PayoutAccount.deleteMany).not.toHaveBeenCalled()
    expect(User.deleteOne).not.toHaveBeenCalled()
  })
})

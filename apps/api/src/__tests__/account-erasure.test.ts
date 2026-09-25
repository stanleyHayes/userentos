import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '../models/User.js'
import { Message, Conversation } from '../models/Conversation.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { eraseAccountRecords, purgeExpiredAccounts, ACCOUNT_ERASURE_DELAY_MS } from '../services/accountErasure.js'

vi.mock('../services/avatarStorage.js', () => ({ eraseAvatars: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/documentErasure.js', () => ({ erasePersonalDocuments: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../models/User.js', () => ({ User: { exists: vi.fn(), find: vi.fn(), deleteOne: vi.fn() } }))
vi.mock('../models/UserBlock.js', () => ({ UserBlock: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/RefreshToken.js', () => ({ RefreshToken: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/BiometricToken.js', () => ({ BiometricToken: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/DeviceToken.js', () => ({ DeviceToken: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/Notification.js', () => ({ Notification: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/TenantProfile.js', () => ({ TenantProfile: { deleteMany: vi.fn() } }))
vi.mock('../models/ProfileAccess.js', () => ({ ProfileAccess: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/Favorite.js', () => ({ Favorite: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/CreditScore.js', () => ({ CreditScore: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/Achievement.js', () => ({ Achievement: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/PaymentStreak.js', () => ({ PaymentStreak: { deleteMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/Review.js', () => ({ Review: { updateMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../models/Conversation.js', () => ({ Message: { deleteMany: vi.fn() }, Conversation: { updateMany: vi.fn().mockResolvedValue({}) } }))
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

const cutoff = new Date('2026-08-14T00:00:00Z')
const uid = '6aa5e860ed2f39b2f1054b45'
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(User.exists).mockResolvedValue({ _id: uid } as never)
  vi.mocked(User.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
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
    expect(await eraseAccountRecords(uid, cutoff)).toBe(true)
  })
  it('reports an unmatched final deletion as skipped', async () => {
    vi.mocked(User.deleteOne).mockResolvedValueOnce({ deletedCount: 0 } as never)
    expect(await eraseAccountRecords(uid, cutoff)).toBe(false)
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
})

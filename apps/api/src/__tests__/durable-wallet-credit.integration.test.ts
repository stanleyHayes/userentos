import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Wallet } from '../models/Wallet.js'
import { WalletCredit } from '../models/WalletCredit.js'
import { applyWalletCredit, prepareWalletCredit } from '../services/payments/durableWalletCredit.js'
import { debitWallet } from '../services/payments/walletLedger.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('durable standalone wallet credit', () => {
  const users: string[] = []
  beforeAll(async () => { await mongoose.connect(uri); await Promise.all([Wallet.init(), WalletCredit.init()]) })
  afterAll(async () => { await Wallet.deleteMany({ userId: { $in: users } }); await WalletCredit.deleteMany({ userId: { $in: users } }); await mongoose.disconnect() })
  function terms() {
    const userId = `wallet-credit-${new mongoose.Types.ObjectId()}`; users.push(userId)
    return { operationKey: `payment:${userId}`, userId, amount: 100, type: 'rent_payment', reference: '$literal-reference' }
  }
  it('concurrent preparation and application credit once and preserve literal references', async () => {
    const t = terms()
    await Promise.all(Array.from({ length: 8 }, () => prepareWalletCredit(t)))
    await Promise.all(Array.from({ length: 8 }, () => applyWalletCredit(t.operationKey)))
    expect(await applyWalletCredit(t.operationKey)).toBe(true)
    const wallet = await Wallet.findOne({ userId: t.userId }).lean()
    expect(wallet?.balance).toBe(100)
    expect(wallet?.transactions).toHaveLength(1)
    expect(wallet?.transactions[0].reference).toBe('$literal-reference')
    expect(wallet?.pendingCredit).toBeUndefined()
  })
  it('rejects key reuse with different terms before another balance mutation', async () => {
    const t = terms(); await prepareWalletCredit(t); await applyWalletCredit(t.operationKey)
    await expect(prepareWalletCredit({ ...t, amount: 200 })).rejects.toThrow('conflicts')
    await expect(prepareWalletCredit({ ...t, userId: 'another-user' })).rejects.toThrow('conflicts')
    expect((await Wallet.findOne({ userId: t.userId }).lean())?.balance).toBe(100)
  })
  it('recovers a crash before balance mutation from the reserved slot', async () => {
    const t = terms(); await prepareWalletCredit(t)
    await Wallet.create({ userId: t.userId, balance: 0, pendingCredit: { operationKey: t.operationKey, claim: 'crashed', phase: 'prepared' } })
    expect(await applyWalletCredit(t.operationKey)).toBe(true)
    expect((await Wallet.findOne({ userId: t.userId }).lean())?.balance).toBe(100)
  })
  it('retains an applied marker when journal completion fails and never reapplies the balance', async () => {
    const t = terms(); await prepareWalletCredit(t)
    const spy = vi.spyOn(WalletCredit, 'updateOne').mockRejectedValueOnce(new Error('Database unavailable'))
    try { await expect(applyWalletCredit(t.operationKey)).rejects.toThrow('Database unavailable') } finally { spy.mockRestore() }
    let wallet = await Wallet.findOne({ userId: t.userId }).lean()
    expect(wallet?.balance).toBe(100)
    expect(wallet?.pendingCredit?.phase).toBe('applied')
    expect(await applyWalletCredit(t.operationKey)).toBe(true)
    wallet = await Wallet.findOne({ userId: t.userId }).lean()
    expect(wallet?.balance).toBe(100)
    expect(wallet?.transactions).toHaveLength(1)
    expect(wallet?.pendingCredit).toBeUndefined()
  })
  it('releases a completed but uncleared slot without blocking subsequent credits', async () => {
    const t = terms(); await prepareWalletCredit(t); await applyWalletCredit(t.operationKey)
    await Wallet.updateOne({ userId: t.userId }, { $set: { pendingCredit: { operationKey: t.operationKey, claim: 'uncleared', phase: 'applied' } } })
    const next = { ...t, operationKey: t.operationKey + ':next', amount: 20 }
    await prepareWalletCredit(next)
    expect(await applyWalletCredit(next.operationKey)).toBe(false)
    expect(await applyWalletCredit(t.operationKey)).toBe(true)
    expect(await applyWalletCredit(next.operationKey)).toBe(true)
    expect((await Wallet.findOne({ userId: t.userId }).lean())?.balance).toBe(120)
  })
  it('keeps permanent deduplication after embedded history rolls off and across debits', async () => {
    const t = terms(); await prepareWalletCredit(t); await applyWalletCredit(t.operationKey)
    await Wallet.updateOne({ userId: t.userId }, { $set: { transactions: Array.from({ length: 500 }, (_, i) => ({ type: 'fixture', amount: 0, balanceAfter: 100, reference: `old-${i}`, description: 'fixture', createdAt: new Date().toISOString() })) } })
    expect(await debitWallet(t.userId, 20, { type: 'withdrawal', reference: 'fixture-debit' })).toBe(true)
    expect(await applyWalletCredit(t.operationKey)).toBe(true)
    expect((await Wallet.findOne({ userId: t.userId }).lean())?.balance).toBe(80)
  })
  it('a delayed worker rechecks completed state after reserving an already released wallet', async () => {
    const t = terms(); await prepareWalletCredit(t)
    const oldPending = await WalletCredit.findOne({ operationKey: t.operationKey }).lean()
    await applyWalletCredit(t.operationKey)
    const spy = vi.spyOn(WalletCredit, 'findOne').mockReturnValueOnce({ lean: async () => oldPending } as unknown as ReturnType<typeof WalletCredit.findOne>)
    try { expect(await applyWalletCredit(t.operationKey)).toBe(true) } finally { spy.mockRestore() }
    const wallet = await Wallet.findOne({ userId: t.userId }).lean()
    expect(wallet?.balance).toBe(100)
    expect(wallet?.transactions).toHaveLength(1)
    expect(wallet?.pendingCredit).toBeUndefined()
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])('rejects invalid or unrepresentable credit amount %s', async amount => {
    const t = terms()
    await expect(prepareWalletCredit({ ...t, amount })).rejects.toThrow('Invalid wallet credit terms')
    expect(await WalletCredit.countDocuments({ operationKey: t.operationKey })).toBe(0)
  })
})

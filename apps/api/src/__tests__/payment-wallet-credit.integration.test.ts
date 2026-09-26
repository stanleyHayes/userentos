import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/notify.js', () => ({ notifyPaymentConfirmed: vi.fn(), notifyPaymentReceived: vi.fn() }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('../models/AuditLog.js', () => ({ AuditLog: { create: vi.fn().mockResolvedValue({}) } }))
import { Payment } from '../models/Payment.js'
import { Wallet } from '../models/Wallet.js'
import { WalletCredit } from '../models/WalletCredit.js'
import { finalizePayment } from '../services/payments/finalize.js'
import { recoverPaymentWalletCredit, paymentCreditIntent } from '../services/payments/paymentWalletCredit.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('payment confirmation wallet credit recovery', () => {
  const ids: mongoose.Types.ObjectId[] = [], users: string[] = []
  beforeAll(async () => { await mongoose.connect(uri); await Promise.all([Wallet.init(), WalletCredit.init()]) })
  afterAll(async () => { await Payment.deleteMany({ _id: { $in: ids } }); await Wallet.deleteMany({ userId: { $in: users } }); await WalletCredit.deleteMany({ userId: { $in: users } }); await mongoose.disconnect() })
  async function fixture(purpose: 'rent' | 'wallet_deposit' = 'rent') {
    const id = new mongoose.Types.ObjectId(), tenantId = String(new mongoose.Types.ObjectId()), landlordId = String(new mongoose.Types.ObjectId())
    ids.push(id); users.push(tenantId, landlordId)
    return Payment.create({ _id: id, tenantId, landlordId, agreementId: 'fixture-agreement', purpose, amount: 100, method: 'bank_transfer', reference: `CREDIT-${id}`, status: 'pending' })
  }
  async function confirm(payment: Awaited<ReturnType<typeof fixture>>) {
    return finalizePayment({ reference: payment.reference, providerRef: `provider-${payment._id}`, status: 'completed', currency: 'GHS', amount: payment.amount, timestamp: new Date().toISOString(), raw: {} }, { source: 'reconciliation' })
  }
  it('requires the saved rail for settlement and prevents changing that rail later', async () => {
    const id = new mongoose.Types.ObjectId(), tenantId = String(new mongoose.Types.ObjectId()); ids.push(id); users.push(tenantId)
    const p = await Payment.create({ _id: id, tenantId, purpose: 'wallet_deposit', amount: 100, method: 'mtn_momo', reference: `SOURCE-${id}`, status: 'pending', collectionSource: 'paystack' })
    await Payment.updateOne({ _id: id }, { $set: { collectionSource: 'simulated' } })
    expect((await Payment.findById(id))?.collectionSource).toBe('paystack')
    const event = { reference: p.reference, providerRef: `provider-${id}`, status: 'completed' as const, amount: 100, currency: 'GHS', timestamp: new Date().toISOString(), raw: {} }
    for (const providerSource of [undefined, 'simulated', 'mtn_momo'] as const) {
      expect(await finalizePayment(event, { source: 'webhook', providerSource })).toBe(false)
      expect((await Payment.findById(id))?.status).toBe('pending')
    }
    expect(await Wallet.findOne({ userId: tenantId })).toBeNull()
    expect(await finalizePayment(event, { source: 'webhook', providerSource: 'paystack' })).toBe(true)
    expect((await Wallet.findOne({ userId: tenantId }))?.balance).toBe(100)
  })
  it('refuses an ambiguous provider-reference fallback', async () => {
    const a = await fixture('wallet_deposit'), b = await fixture('wallet_deposit')
    const ref = `ambiguous-${a._id}`
    await Payment.updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { providerRef: ref } })
    expect(await finalizePayment({ reference: '', providerRef: ref, status: 'completed', amount: 100, currency: 'GHS', timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })).toBe(false)
    expect(await Payment.countDocuments({ _id: { $in: [a._id, b._id] }, status: 'pending' })).toBe(2)
    expect(await Wallet.countDocuments({ userId: { $in: [a.tenantId, b.tenantId] } })).toBe(0)
  })
  it('ignores unsupported statuses rather than interpreting them as completion', async () => {
    const p = await fixture('wallet_deposit')
    expect(await finalizePayment({ reference: p.reference, providerRef: 'unexpected-ref', status: 'unrecognized' as never, currency: 'GHS', amount: 100, timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })).toBe(false)
    expect((await Payment.findById(p._id))?.status).toBe('pending')
    expect(await Wallet.findOne({ userId: p.tenantId })).toBeNull()
  })
  it.each([undefined, null])('records pending references when the previous value is %s', async previous => {
    const p = await fixture('wallet_deposit')
    if (previous === null) await Payment.updateOne({ _id: p._id }, { $set: { providerRef: null } })
    expect(await finalizePayment({ reference: p.reference, providerRef: 'new-pending-ref', status: 'pending', amount: 100, currency: 'GHS', timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })).toBe(false)
    expect(await Payment.findById(p._id).lean()).toMatchObject({ status: 'pending', providerRef: 'new-pending-ref', lastProviderCheckAt: expect.any(String) })
    expect(await Wallet.findOne({ userId: p.tenantId })).toBeNull()
  })
  it('does not let a stale pending event replace completed provider evidence', async () => {
    const p = await fixture('wallet_deposit')
    const original = Payment.updateOne.bind(Payment)
    const spy = vi.spyOn(Payment, 'updateOne').mockImplementationOnce((...args: Parameters<typeof Payment.updateOne>) => {
      return (async () => {
        await original({ _id: p._id }, { $set: { status: 'completed', providerRef: 'confirmed-ref', providerStatus: 'completed' } })
        return original(...args)
      })() as ReturnType<typeof Payment.updateOne>
    })
    try {
      await finalizePayment({ reference: p.reference, providerRef: 'stale-pending-ref', status: 'pending', amount: 100, currency: 'GHS', timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })
    } finally { spy.mockRestore() }
    expect(await Payment.findById(p._id).lean()).toMatchObject({ status: 'completed', providerRef: 'confirmed-ref', providerStatus: 'completed' })
  })
  it('does not overwrite a provider reference assigned after the pending-event read', async () => {
    const p = await fixture('wallet_deposit')
    const original = Payment.updateOne.bind(Payment)
    const spy = vi.spyOn(Payment, 'updateOne').mockImplementationOnce((...args: Parameters<typeof Payment.updateOne>) => {
      return (async () => {
        await original({ _id: p._id }, { $set: { providerRef: 'first-ref' } })
        return original(...args)
      })() as ReturnType<typeof Payment.updateOne>
    })
    try {
      await finalizePayment({ reference: p.reference, providerRef: 'later-ref', status: 'pending', amount: 100, currency: 'GHS', timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })
    } finally { spy.mockRestore() }
    expect((await Payment.findById(p._id))?.providerRef).toBe('first-ref')
  })
  it.each([undefined, 'USD', 'NGN', 'ghs'])('holds unverified currency %s until a GHS confirmation arrives', async currency => {
    const p = await fixture('wallet_deposit')
    expect(await finalizePayment({ reference: p.reference, providerRef: `provider-${p._id}`, status: 'completed', currency, amount: p.amount, timestamp: new Date().toISOString(), raw: {} }, { source: 'webhook' })).toBe(false)
    const held = await Payment.findById(p._id).lean()
    expect(held?.status).toBe('processing')
    expect(held?.failureReason).toContain('currency_unverified')
    expect(held?.walletCreditIntent).toBeUndefined()
    expect(await Wallet.findOne({ userId: p.tenantId })).toBeNull()
    expect(await confirm(p)).toBe(true)
    expect((await Wallet.findOne({ userId: p.tenantId }))?.balance).toBe(100)
    expect((await Payment.findById(p._id))?.failureReason).toBeUndefined()
  })
  it.each(['rent', 'wallet_deposit'] as const)('credits the recorded beneficiary once on repeated %s confirmations', async purpose => {
    const p = await fixture(purpose)
    expect(await confirm(p)).toBe(true)
    expect(await confirm(p)).toBe(false)
    const saved = await Payment.findById(p._id).lean()
    const beneficiary = purpose === 'rent' ? p.landlordId : p.tenantId
    expect(saved?.walletCreditIntent).toMatchObject({ version: 1, amount: 100, userId: beneficiary })
    expect(saved?.walletCreditCompletedAt).toBeInstanceOf(Date)
    expect((await Wallet.findOne({ userId: beneficiary }).lean())?.balance).toBe(100)
    expect(await WalletCredit.countDocuments({ operationKey: saved?.walletCreditIntent?.operationKey })).toBe(1)
  })
  it('keeps an intent after a failed journal preparation and recovers without replaying confirmation', async () => {
    const p = await fixture()
    const spy = vi.spyOn(WalletCredit, 'updateOne').mockRejectedValueOnce(new Error('Temporary journal outage'))
    try { expect(await confirm(p)).toBe(true) } finally { spy.mockRestore() }
    const saved = await Payment.findById(p._id).lean()
    expect(saved?.status).toBe('completed')
    expect(saved?.walletCreditIntent?.amount).toBe(100)
    expect(saved?.walletCreditCompletedAt).toBeUndefined()
    expect(await Wallet.findOne({ userId: p.landlordId })).toBeNull()
    expect(await recoverPaymentWalletCredit(String(p._id))).toBe(true)
    expect((await Wallet.findOne({ userId: p.landlordId }).lean())?.balance).toBe(100)
  })
  it('recovers an interruption immediately after confirmation and preserves original terms', async () => {
    const p = await fixture()
    const intent = paymentCreditIntent(p)
    await Payment.findOneAndUpdate({ _id: p._id }, { $set: { status: 'completed', walletCreditIntent: intent } }, { overwriteImmutable: true, runValidators: true })
    await Payment.updateOne({ _id: p._id }, { $set: { amount: 200, landlordId: 'edited-owner', 'walletCreditIntent.amount': 200 } })
    expect(await recoverPaymentWalletCredit(String(p._id))).toBe(true)
    expect((await Wallet.findOne({ userId: p.landlordId }).lean())?.balance).toBe(100)
    expect(await Wallet.findOne({ userId: 'edited-owner' })).toBeNull()
    expect(await recoverPaymentWalletCredit(String(p._id))).toBe(true)
    expect((await Wallet.findOne({ userId: p.landlordId }).lean())?.balance).toBe(100)
  })
  it('does not automatically credit historical completed payments without an intent', async () => {
    const p = await fixture()
    await Payment.updateOne({ _id: p._id }, { $set: { status: 'completed' } })
    expect(await recoverPaymentWalletCredit(String(p._id))).toBe(false)
    expect(await Wallet.findOne({ userId: p.landlordId })).toBeNull()
  })
})

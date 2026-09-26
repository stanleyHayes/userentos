import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Payment } from '../models/Payment.js'
import { Payout } from '../models/Payout.js'
import { MarketplaceTransaction } from '../models/MarketplaceTransaction.js'
import { syncPaymentIndexes } from '../scripts/syncPaymentIndexes.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

describe.skipIf(!hasTestMongo)('payment uniqueness indexes', () => {
  const tag = String(new mongoose.Types.ObjectId())
  const tenants = [`idx-a-${tag}`, `idx-b-${tag}`]
  let n = 0
  const payment = (fields: Record<string, unknown>) => Payment.create({
    tenantId: tenants[0], purpose: 'wallet_deposit', amount: 10, method: 'mtn_momo', status: 'pending', reference: `IDX-${tag}-${++n}`, ...fields,
  })
  const duplicate = (err: unknown) => (err as { code?: number }).code

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    // What production still has: the old global idempotency key index.
    await Payment.collection.createIndex({ idempotencyKey: 1 }, { name: 'idempotencyKey_1', unique: true, sparse: true }).catch(() => undefined)
  })
  afterAll(async () => {
    await Payment.deleteMany({ tenantId: { $in: tenants } })
    await Payout.deleteMany({ userId: { $in: tenants } })
    await MarketplaceTransaction.deleteMany({ buyerId: { $in: tenants } })
    await mongoose.disconnect()
  })

  it('the migration builds the new indexes and drops the global idempotency key, and is safe to re-run', async () => {
    const first = await syncPaymentIndexes()
    expect(first.built).toEqual(expect.arrayContaining([
      'payments.payment_idempotency_per_payer', 'payments.payment_one_open_collection', 'payments.payment_provider_ref_per_source',
      'payouts.payout_provider_ref_unique', 'marketplacetransactions.marketplace_one_open_order',
    ]))
    expect(first.built).not.toContain('payments.idempotencyKey_1')
    expect(first.built).not.toContain('payouts.providerRef_1')
    const second = await syncPaymentIndexes()
    expect(second.dropped).toEqual([])
  })

  it('lets two payers use the same idempotency key, but not one payer twice', async () => {
    const key = `shared-key-${tag}`
    await payment({ tenantId: tenants[0], idempotencyKey: key })
    await payment({ tenantId: tenants[1], idempotencyKey: key })
    expect(duplicate(await payment({ tenantId: tenants[0], idempotencyKey: key }).catch((e: unknown) => e))).toBe(11000)
  })

  it('refuses a second payment with the same correlator on the same rail', async () => {
    const ref = `PROV-${tag}`
    await payment({ collectionSource: 'paystack', providerRef: ref })
    expect(duplicate(await payment({ collectionSource: 'paystack', providerRef: ref }).catch((e: unknown) => e))).toBe(11000)
    // Another rail's id space is separate.
    await payment({ collectionSource: 'mtn_momo', providerRef: ref })
  })

  it('allows one open collection per obligation', async () => {
    const key = `rent:agreement-${tag}:2026-09-01:2026-09-30`
    await payment({ openCollectionKey: key })
    expect(duplicate(await payment({ openCollectionKey: key }).catch((e: unknown) => e))).toBe(11000)
    // Terminal payments no longer hold the key.
    await payment({ status: 'failed' })
  })

  it('refuses a second payout with the same transfer handle', async () => {
    const doc = (i: number) => ({ userId: tenants[0], amount: 20, status: 'processing' as const, reference: `PO-${tag}-${i}`, providerRef: `TRF_${tag}`, destination: { type: 'mobile_money', accountNumber: '0244000000', bankName: 'MTN', accountName: 'Fixture', recipientCode: 'RCP_1' } })
    await Payout.create(doc(1))
    expect(duplicate(await Payout.create(doc(2)).catch((e: unknown) => e))).toBe(11000)
  })
})

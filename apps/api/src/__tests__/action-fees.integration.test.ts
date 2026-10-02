import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  notify: vi.fn().mockResolvedValue(undefined),
  notifyAgreementSigned: vi.fn().mockResolvedValue(undefined),
  notifyAgreementFullySigned: vi.fn().mockResolvedValue(undefined),
  notifyPaymentConfirmed: vi.fn().mockResolvedValue(undefined),
  notifyPaymentReceived: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/ml/valuationLog.js', () => ({ attachObservedRent: vi.fn().mockResolvedValue(undefined) }))

process.env.PAYMENTS_PROVIDER_MODE = 'simulated'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Agreement } = await import('../models/Agreement.js')
const { Payment } = await import('../models/Payment.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { Business } = await import('../models/Business.js')
const { FeatureFlag } = await import('../models/FeatureFlag.js')
const { invalidateFlagCache } = await import('../services/featureFlags.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: agreementsRouter } = await import('../routes/agreements.js')
const { default: passportRouter } = await import('../routes/tenantPassport.js')
const { onSimulatedComplete } = await import('../services/payments/simulator.js')
const { finalizePayment } = await import('../services/payments/finalize.js')
const { applyActionFee, recoverActionFees } = await import('../services/payments/actionFeeCheckout.js')

// The server wires simulated completions to finalize (src/index.ts); this test app does the same.
onSimulatedComplete((event) => { void finalizePayment(event, { source: 'simulator', providerSource: 'simulated' }) })

// The fee switches are global, so this suite gets a database of its own:
// switching a fee on here must not reach suites running alongside it.
const uri = testMongoUri.replace(/(\/[^/?]+)$/, '$1_fees')

type Json = { success: boolean; data?: Record<string, unknown> & { id?: string; termsHash?: string; signingFee?: { due: boolean; amount?: number }; payment?: { id: string } }; error?: string; code?: string; fee?: { amount: number } }

describe.skipIf(!hasTestMongo)('GH₵5 pay-per-action fees (brief §08)', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let server: Server
  let base = ''
  let keySeq = 0
  const headers = (userId: string, roles: string[], extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`,
    'Content-Type': 'application/json',
    ...extra,
  })
  const asLandlord = headers(landlordId, ['landlord'])
  const asTenant = headers(tenantId, ['tenant'])
  const call = async (path: string, h: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, json: await response.json() as Json }
  }
  const setFlag = async (key: string, enabled: boolean) => {
    await FeatureFlag.updateOne({ key }, { $set: { key, enabled, description: 'test' } }, { upsert: true })
    invalidateFlagCache()
  }
  const newAgreement = async () => {
    const created = await call('/agreements', asLandlord, 'POST', { propertyId, tenantId, startDate: '2026-11-01', endDate: '2027-11-01', rentAmount: 1500, securityDeposit: 1500, advanceMonths: 1, terms: ['Rent due on the 1st'] })
    expect(created.status).toBe(201)
    return created.json.data!.id!
  }
  const sign = async (id: string, h: Record<string, string>, name: string) => {
    const view = await call(`/agreements/${id}`, h)
    return call(`/agreements/${id}/sign`, h, 'POST', { signatureName: name, termsHash: view.json.data!.termsHash, consent: true })
  }
  const pay = (path: string, h: Record<string, string>) => call(path, { ...h, 'Idempotency-Key': `fee-test-key-${Date.now()}-${keySeq++}` }, 'POST', { method: 'mtn_momo', phone: '0241234567' })
  const settle = async (paymentId: string) => {
    for (let i = 0; i < 40; i += 1) {
      const payment = await Payment.findById(paymentId).lean()
      if (payment?.status === 'completed' && payment.feeAppliedAt) return payment
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('simulated payment never completed')
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await mongoose.connection.dropDatabase()
    await User.create([
      { _id: landlordId, email: `fee-landlord-${landlordId}@rentos.test`, phone: '0240000071', firstName: 'Fee', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: tenantId, email: `fee-tenant-${tenantId}@rentos.test`, phone: '0240000072', firstName: 'Fee', lastName: 'Tenant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
    ])
    await TenantProfile.create({ userId: tenantId, dateOfBirth: '1990-01-01', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian', highestEducation: 'none', employmentStatus: 'employed', occupation: 'Teacher', monthlyIncome: 3000, employmentDuration: '1_3yrs', hasSpouse: false, hasChildren: false, numberOfOccupants: 1, numberOfDependents: 0, smoker: false, noiseLevel: 'quiet', workSchedule: 'day', pets: false, personalReferences: [{ name: 'A', relationship: 'friend', phone: '1' }, { name: 'B', relationship: 'friend', phone: '2' }], professionalReferences: [{ name: 'C', title: 'Head', company: 'School', phone: '3' }], previousRentals: [{ address: '1 Road', city: 'Accra', duration: '1y', canContact: true }], emergencyContact: { name: 'D', phone: '4' }, idType: 'ghana_card', idNumber: 'GHA-123456789-0', idVerified: true, incomeVerified: true })
    const property = await Property.create({ landlordId, title: 'Fee fixture', description: 'Fixture', type: 'apartment', address: { street: '1 Fee St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1500, rentDurationMonths: 12, advanceMonths: 1 })
    propertyId = property.id
    const app = express()
    app.use(express.json())
    app.use('/agreements', agreementsRouter)
    app.use('/tenant-passport', passportRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [landlordId, tenantId] } }), TenantProfile.deleteMany({ userId: tenantId }),
      Property.deleteOne({ _id: propertyId }), Agreement.deleteMany({ propertyId }), Payment.deleteMany({ tenantId: { $in: [landlordId, tenantId] } }),
      Business.deleteMany({ ownerId: landlordId }), FeatureFlag.deleteMany({ key: { $in: ['fees.agreement_signing', 'fees.passport_export'] } }),
    ])
    invalidateFlagCache()
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  it('never charges for an agreement created while the fee was off (grandfathered)', async () => {
    await setFlag('fees.agreement_signing', false)
    const id = await newAgreement()
    await setFlag('fees.agreement_signing', true)
    const view = await call(`/agreements/${id}`, asTenant)
    expect(view.json.data!.signingFee).toMatchObject({ due: false })
    expect((await sign(id, asTenant, 'Fee Tenant')).status).toBe(200)
    await Agreement.deleteOne({ _id: id })
  })

  it('lets the tenant view for free, asks GH₵5 to sign or download, and unlocks both parties once paid', { timeout: 20_000 }, async () => {
    await setFlag('fees.agreement_signing', true)
    const id = await newAgreement()

    const view = await call(`/agreements/${id}`, asTenant)
    expect(view.status).toBe(200)
    expect(view.json.data!.signingFee).toMatchObject({ due: true, amount: 5 })

    const refused = await sign(id, asTenant, 'Fee Tenant')
    expect(refused.status).toBe(402)
    expect(refused.json).toMatchObject({ code: 'AGREEMENT_FEE_REQUIRED', fee: { amount: 5 } })
    expect((await call(`/agreements/${id}/document-link`, asLandlord, 'POST')).status).toBe(402)
    // The landlord's own signature is not what the fee pays for.
    expect((await sign(id, asLandlord, 'Fee Landlord')).status).toBe(200)

    // A retry key is required to start a real collection.
    expect((await call(`/agreements/${id}/signing-fee`, asTenant, 'POST', { method: 'mtn_momo', phone: '0241234567' })).status).toBe(428)
    const started = await pay(`/agreements/${id}/signing-fee`, asTenant)
    expect(started.status).toBe(201)
    // One open charge per agreement, whoever starts the second one.
    const second = await pay(`/agreements/${id}/signing-fee`, asLandlord)
    expect(second.status).toBe(409)
    expect(second.json.data).toBeUndefined()

    const payment = await settle(started.json.data!.payment!.id)
    expect(payment).toMatchObject({ purpose: 'agreement_fee', amount: 5 })
    expect(payment.agreementId).toBeUndefined()

    expect((await call(`/agreements/${id}`, asTenant)).json.data!.signingFee).toMatchObject({ due: false })
    expect((await sign(id, asTenant, 'Fee Tenant')).status).toBe(200)
    expect((await call(`/agreements/${id}/document-link`, asLandlord, 'POST')).status).toBe(200)
    expect((await pay(`/agreements/${id}/signing-fee`, asTenant)).status).toBe(409)
    await Agreement.deleteOne({ _id: id })
  })

  it('charges nothing while the switch is off, even on an agreement that required it', async () => {
    await setFlag('fees.agreement_signing', true)
    const id = await newAgreement()
    await setFlag('fees.agreement_signing', false)
    expect((await call(`/agreements/${id}`, asTenant)).json.data!.signingFee).toMatchObject({ due: false })
    expect((await sign(id, asTenant, 'Fee Tenant')).status).toBe(200)
    await Agreement.deleteOne({ _id: id })
  })

  it('charges GH₵5 per passport export, with a half-hour retry window', { timeout: 20_000 }, async () => {
    await setFlag('fees.passport_export', false)
    expect((await call('/tenant-passport/me/document-link', asTenant, 'POST')).status).toBe(200)

    await setFlag('fees.passport_export', true)
    const status = await call('/tenant-passport/me/export-status', asTenant)
    expect(status.json.data).toMatchObject({ active: true, amount: 5, credits: 0, unlockedUntil: null })
    const refused = await call('/tenant-passport/share', asTenant, 'POST')
    expect(refused.status).toBe(402)
    expect(refused.json.code).toBe('PASSPORT_EXPORT_FEE_REQUIRED')

    const started = await pay('/tenant-passport/export-fee', asTenant)
    expect(started.status).toBe(201)
    await settle(started.json.data!.payment!.id)
    expect((await call('/tenant-passport/me/export-status', asTenant)).json.data).toMatchObject({ credits: 1 })

    expect((await call('/tenant-passport/share', asTenant, 'POST')).status).toBe(200)
    // The retry window: a download straight after costs nothing more.
    expect((await call('/tenant-passport/me/document-link', asTenant, 'POST')).status).toBe(200)
    expect((await call('/tenant-passport/me/export-status', asTenant)).json.data).toMatchObject({ credits: 0 })

    await User.updateOne({ _id: tenantId }, { $set: { passportExportUnlockedUntil: new Date(Date.now() - 1000) } })
    expect((await call('/tenant-passport/me/document-link', asTenant, 'POST')).status).toBe(402)
  })

  it('applies a paid unlock exactly once, and the recovery sweep finishes one that failed midway', { timeout: 20_000 }, async () => {
    await setFlag('fees.passport_export', true)
    await User.updateOne({ _id: tenantId }, { $set: { passportExportCredits: 0 }, $unset: { passportExportPaymentIds: 1 } })
    const started = await pay('/tenant-passport/export-fee', asTenant)
    expect(started.status).toBe(201)
    const paid = await settle(started.json.data!.payment!.id)
    const credits = async () => (await User.findById(tenantId).select('passportExportCredits').lean())?.passportExportCredits
    expect(await credits()).toBe(1)

    // Running the unlock again (a webhook retry, two callers at once) adds nothing.
    const doc = await Payment.findById(paid._id)
    await applyActionFee(doc!)
    await applyActionFee(doc!)
    expect(await credits()).toBe(1)

    // A failure after the credit but before the payment was marked: the sweep
    // marks it and does not credit twice.
    await Payment.updateOne({ _id: paid._id }, { $unset: { feeAppliedAt: 1 } })
    const swept = await recoverActionFees()
    expect(swept).toMatchObject({ checked: 1, applied: 1 })
    expect(await credits()).toBe(1)
    expect((await Payment.findById(paid._id).lean())?.feeAppliedAt).toBeTruthy()
    expect(await recoverActionFees()).toMatchObject({ checked: 0 })

    // A failure before the credit: the sweep adds the missing credit.
    await User.updateOne({ _id: tenantId }, { $set: { passportExportCredits: 0 }, $pull: { passportExportPaymentIds: String(paid._id) } })
    await Payment.updateOne({ _id: paid._id }, { $unset: { feeAppliedAt: 1 } })
    await recoverActionFees()
    expect(await credits()).toBe(1)
  })
})

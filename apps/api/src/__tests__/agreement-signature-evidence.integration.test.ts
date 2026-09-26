import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyAgreementSigned: vi.fn().mockResolvedValue(undefined),
  notifyAgreementFullySigned: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/ml/valuationLog.js', () => ({ attachObservedRent: vi.fn().mockResolvedValue(undefined) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Property } = await import('../models/Property.js')
const { Agreement } = await import('../models/Agreement.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { Business } = await import('../models/Business.js')
const { SIGNATURE_CONSENT_STATEMENT, agreementTermsHash } = await import('../services/agreementEvidence.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: agreementsRouter } = await import('../routes/agreements.js')

const uri = testMongoUri
type Evidence = { role: string; userId: string; signatureName: string; signedAt: string; ipAddress?: string; userAgent?: string; termsHash: string; agreementVersion: number; consentStatement: string; consentVersion: number }
type View = { id: string; status: string; version: number; termsHash: string; signatureConsentStatement?: string; signatureEvidence: Evidence[]; landlordSignature?: string; tenantSignature?: string }

describe.skipIf(!hasTestMongo)('electronic signature evidence', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  let propertyId = ''
  let agreementId = ''
  let server: Server
  let base = ''
  const headers = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json', 'User-Agent': `evidence-test/${roles[0]}` })
  const asLandlord = headers(landlordId, ['landlord'])
  const asTenant = headers(tenantId, ['tenant'])
  const call = async (path: string, h: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}/agreements${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = await response.json() as { data: View; error?: string }
    return { status: response.status, data: json.data, error: json.error }
  }
  const sign = (h: Record<string, string>, body: Record<string, unknown>) => call(`/${agreementId}/sign`, h, 'POST', body)

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: landlordId, email: `sig-landlord-${landlordId}@rentos.test`, phone: '0240000061', firstName: 'Sig', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: tenantId, email: `sig-tenant-${tenantId}@rentos.test`, phone: '0240000062', firstName: 'Sig', lastName: 'Tenant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
    ])
    await TenantProfile.create({ userId: tenantId, dateOfBirth: '1990-01-01', gender: 'female', maritalStatus: 'single', nationality: 'Ghanaian', highestEducation: 'none', employmentStatus: 'employed', occupation: 'Teacher', monthlyIncome: 3000, employmentDuration: '1_3yrs', hasSpouse: false, hasChildren: false, numberOfOccupants: 1, numberOfDependents: 0, smoker: false, noiseLevel: 'quiet', workSchedule: 'day', pets: false, personalReferences: [{ name: 'A', relationship: 'friend', phone: '1' }, { name: 'B', relationship: 'friend', phone: '2' }], professionalReferences: [{ name: 'C', title: 'Head', company: 'School', phone: '3' }], previousRentals: [{ address: '1 Road', city: 'Accra', duration: '1y', canContact: true }], emergencyContact: { name: 'D', phone: '4' }, idType: 'ghana_card', idNumber: 'GHA-123456789-0', idVerified: true, incomeVerified: true })
    const property = await Property.create({ landlordId, title: 'Signature fixture', description: 'Fixture', type: 'apartment', address: { street: '1 Sign St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1500, rentDurationMonths: 12, advanceMonths: 1 })
    propertyId = property.id
    const app = express()
    app.set('trust proxy', false)
    app.use(express.json())
    app.use('/agreements', agreementsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const created = await call('', asLandlord, 'POST', { propertyId, tenantId, startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 1500, securityDeposit: 1500, advanceMonths: 1, terms: ['Rent due on the 1st'] })
    agreementId = created.data.id
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: [landlordId, tenantId] } }), TenantProfile.deleteMany({ userId: tenantId }),
      Property.deleteOne({ _id: propertyId }), Agreement.deleteMany({ propertyId }),
      Business.deleteMany({ ownerId: landlordId }),
    ])
    await mongoose.disconnect()
  })

  it('publishes the terms fingerprint and consent statement signers must see', async () => {
    const { data } = await call(`/${agreementId}`, asTenant)
    expect(data.termsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(data.termsHash).toBe(agreementTermsHash((await Agreement.findById(agreementId).lean())!))
    expect(data.signatureConsentStatement).toBe(SIGNATURE_CONSENT_STATEMENT)
  })

  it('refuses a signature without the terms fingerprint or explicit consent', async () => {
    const { data } = await call(`/${agreementId}`, asLandlord)
    expect((await sign(asLandlord, { signatureName: 'Sig Landlord', consent: true })).status).toBe(400)
    expect((await sign(asLandlord, { signatureName: 'Sig Landlord', termsHash: data.termsHash })).status).toBe(400)
    expect((await sign(asLandlord, { signatureName: 'Sig Landlord', termsHash: data.termsHash, consent: false })).status).toBe(400)
    expect((await Agreement.findById(agreementId).lean())?.signatureEvidence).toEqual([])
  })

  it('records who, when, where, which terms and what consent for each signature', async () => {
    const { data: before } = await call(`/${agreementId}`, asLandlord)
    const signed = await sign(asLandlord, { signatureName: 'Sig Landlord', termsHash: before.termsHash, consent: true })
    expect(signed.status).toBe(200)
    expect(signed.data.status).toBe('pending_signatures')
    const [entry] = (await Agreement.findById(agreementId).lean())!.signatureEvidence
    expect(entry).toMatchObject({
      role: 'landlord', userId: landlordId, signatureName: 'Sig Landlord', termsHash: before.termsHash, agreementVersion: 1,
      consentStatement: SIGNATURE_CONSENT_STATEMENT, consentVersion: 1, userAgent: 'evidence-test/landlord', ipAddress: expect.stringContaining('127.0.0.1'),
    })
    expect(entry.signedAt).toBeInstanceOf(Date)
    expect((await sign(asLandlord, { signatureName: 'Sig Landlord', termsHash: before.termsHash, consent: true })).status).toBe(409)
  })

  it('rejects a signature over terms that changed after the signer opened them', async () => {
    const { data: seenByTenant } = await call(`/${agreementId}`, asTenant)
    const edited = await call(`/${agreementId}`, asLandlord, 'PATCH', { rentAmount: 1800 })
    expect(edited.status).toBe(200)
    expect(edited.data.version).toBe(2)
    expect(edited.data.termsHash).not.toBe(seenByTenant.termsHash)

    const stale = await sign(asTenant, { signatureName: 'Sig Tenant', termsHash: seenByTenant.termsHash, consent: true })
    expect(stale.status).toBe(409)
    const stored = (await Agreement.findById(agreementId).lean())!
    expect(stored.tenantSignature).toBeUndefined()
    // The landlord's version-1 signature survives the edit as history.
    expect(stored.signatureEvidence.map((e) => [e.role, e.agreementVersion])).toEqual([['landlord', 1]])
  })

  it('activates once both parties sign the current version and hides the counterparty device data', async () => {
    // An approved business in the lease's city: the old code sent it a
    // "a tenant just moved in" notice on activation.
    await Business.create({ ownerId: landlordId, name: 'Nearby Movers', category: 'moving', phone: '0240000000', city: 'Accra', approvalStatus: 'approved' })
    const { data: current } = await call(`/${agreementId}`, asLandlord)
    expect((await sign(asLandlord, { signatureName: 'Sig Landlord', termsHash: current.termsHash, consent: true })).status).toBe(200)
    const done = await sign(asTenant, { signatureName: 'Sig Tenant', termsHash: current.termsHash, consent: true })
    expect(done.status).toBe(200)
    expect(done.data.status).toBe('active')
    expect((await Property.findById(propertyId).lean())?.status).toBe('occupied')

    const stored = (await Agreement.findById(agreementId).lean())!
    expect(stored.signatureEvidence.map((e) => [e.role, e.agreementVersion])).toEqual([['landlord', 1], ['landlord', 2], ['tenant', 2]])
    // No local business is told about a lease going live.
    expect(stored.activatedAt).toBeInstanceOf(Date)
    // The old notice was fire-and-forget after the response; give it time to land.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const { notify } = await import('../services/notify.js')
    expect(vi.mocked(notify)).not.toHaveBeenCalledWith(expect.objectContaining({ category: 'promotion' }))

    const landlordView = (await call(`/${agreementId}`, asLandlord)).data.signatureEvidence
    const tenantEntry = landlordView.find((e) => e.role === 'tenant')!
    expect(tenantEntry).toMatchObject({ signatureName: 'Sig Tenant', termsHash: current.termsHash })
    expect(tenantEntry).not.toHaveProperty('ipAddress')
    expect(tenantEntry).not.toHaveProperty('userAgent')
    expect(landlordView.find((e) => e.role === 'landlord')).toHaveProperty('userAgent', 'evidence-test/landlord')
  })

  it('embeds the terms fingerprint and signature evidence in the agreement PDF', async () => {
    const { data } = await call(`/${agreementId}`, asTenant)
    const token = jwt.sign({ userId: tenantId, purpose: 'download', scope: 'agreement-document' }, config.jwtSecret, { expiresIn: '5m' })
    const pdf = Buffer.from(await (await fetch(`${base}/agreements/${agreementId}/document.pdf?token=${token}`)).arrayBuffer()).toString('latin1')
    expect(pdf).toContain(data.termsHash)
    expect(pdf).toContain('Signature Evidence')
    expect(pdf).toContain('Sig Tenant')
  })

  it('keeps evidence immutable after signing', async () => {
    const forge = [
      { $set: { 'signatureEvidence.0.signatureName': 'Forged' } },
      { $set: { signatureEvidence: [] } },
      { $pull: { signatureEvidence: { role: 'tenant' } } },
      { $unset: { signatureEvidence: 1 } },
      { $push: { signatureEvidence: { $each: [], $position: 0 } } },
    ]
    for (const update of forge) {
      await expect(Agreement.updateOne({ _id: agreementId }, update)).rejects.toThrow(/append-only/)
      await expect(Agreement.findOneAndUpdate({ _id: agreementId }, update)).rejects.toThrow(/append-only/)
    }
    await expect(Agreement.replaceOne({ _id: agreementId }, { propertyId })).rejects.toThrow(/append-only/)

    const doc = (await Agreement.findById(agreementId))!
    doc.signatureEvidence.pop()
    await expect(doc.save()).rejects.toThrow(/append-only/)

    const unrelated = (await Agreement.findById(agreementId))!
    unrelated.renewalStatus = 'tenant_declined'
    await expect(unrelated.save()).resolves.toBeTruthy()
    expect((await Agreement.findById(agreementId).lean())!.signatureEvidence).toHaveLength(3)
  })

  it('still saves legacy agreements that predate signature evidence', async () => {
    const { insertedId } = await mongoose.connection.collection('agreements').insertOne({ propertyId, landlordId, tenantId, status: 'active', startDate: '2025-01-01', endDate: '2026-01-01', rentAmount: 900, landlordSignature: 'x', tenantSignature: 'y', version: 1, complianceFlags: [] })
    const legacy = (await Agreement.findById(insertedId))!
    legacy.status = 'expired'
    await expect(legacy.save()).resolves.toBeTruthy()
  })
})

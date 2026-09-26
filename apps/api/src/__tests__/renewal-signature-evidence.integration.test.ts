import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Agreement } = await import('../models/Agreement.js')
const { RenewalOffer } = await import('../models/RenewalOffer.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { agreementTermsHash, SIGNATURE_CONSENT_STATEMENT } = await import('../services/agreementEvidence.js')
const { default: renewalsRouter } = await import('../routes/renewals.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('renewals change an active lease only with the tenant\'s e-signature (Act 772)', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  let agreementId = ''
  let server: Server
  let base = ''
  const as = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json', 'User-Agent': `renewal-test/${roles[0]}` })
  const asLandlord = as(landlordId, ['landlord'])
  const asTenant = as(tenantId, ['tenant'])
  const call = async (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = await response.json() as { data?: Record<string, unknown>; error?: string }
    return { status: response.status, data: json.data, error: json.error }
  }
  const offerBody = { proposedRent: 1250, proposedEndDate: '2028-01-01', message: 'Another year?' }
  const landlordSignature = { signatureName: 'Lara Landlord', consent: true }
  const makeOffer = async () => {
    const res = await call(`/renewals/agreement/${agreementId}`, asLandlord, 'POST', { ...offerBody, ...landlordSignature })
    expect(res.status).toBe(201)
    const [offer] = ((await call('/renewals', asTenant)).data!.items as Record<string, unknown>[])
    return offer
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([
      { _id: landlordId, email: `renew-landlord-${landlordId}@rentos.test`, phone: '0240007001', firstName: 'Lara', lastName: 'Landlord', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' },
      { _id: tenantId, email: `renew-tenant-${tenantId}@rentos.test`, phone: '0240007002', firstName: 'Tia', lastName: 'Tenant', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
    ])
    const app = express()
    app.set('trust proxy', true)
    app.use(express.json())
    app.use('/renewals', renewalsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await RenewalOffer.deleteMany({ tenantId })
    await Agreement.deleteMany({ tenantId })
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await User.deleteMany({ _id: { $in: [landlordId, tenantId] } })
    await mongoose.disconnect()
  })
  const activeLease = async () => {
    const lease = await Agreement.create({ propertyId: `renew-prop-${tenantId}`, landlordId, tenantId, status: 'active', startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: 1000, advanceMonths: 1, landlordSignature: '2025-12-20T00:00:00.000Z', tenantSignature: '2025-12-21T00:00:00.000Z' })
    agreementId = lease.id
    return lease
  }

  it('requires the landlord to sign the terms they offer, and shows the tenant the fingerprint without the landlord\'s device', async () => {
    await activeLease()
    expect((await call(`/renewals/agreement/${agreementId}`, asLandlord, 'POST', offerBody)).status).toBe(400)
    expect((await call(`/renewals/agreement/${agreementId}`, asLandlord, 'POST', { ...offerBody, ...landlordSignature, proposedEndDate: '2026-06-01' })).status).toBe(400)
    const offer = await makeOffer()
    expect(offer.termsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(offer.signatureConsentStatement).toBe(SIGNATURE_CONSENT_STATEMENT)
    expect(offer.landlordEvidence).toMatchObject({ role: 'landlord', signatureName: 'Lara Landlord', termsHash: offer.termsHash, agreementVersion: 2 })
    expect(offer.landlordEvidence).not.toHaveProperty('ipAddress')
    expect(offer.landlordEvidence).not.toHaveProperty('userAgent')
  })

  it('leaves the lease untouched until the tenant signs the exact renewed terms', async () => {
    await activeLease()
    const offer = await makeOffer()
    expect((await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: true })).status).toBe(400)
    expect((await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: true, signatureName: 'Tia Tenant', termsHash: 'a'.repeat(64), consent: true })).status).toBe(409)
    expect((await call(`/renewals/${offer.id}/respond`, asLandlord, 'POST', { accept: true, signatureName: 'Lara Landlord', termsHash: offer.termsHash, consent: true })).status).toBe(403)
    expect(await Agreement.findById(agreementId).lean()).toMatchObject({ rentAmount: 1000, endDate: '2027-01-01', version: 1, renewalStatus: 'pending' })
    expect((await RenewalOffer.findById(offer.id).lean())?.status).toBe('pending')
  })

  it('applies the renewal with both signatures recorded against the new version\'s terms', async () => {
    await activeLease()
    const offer = await makeOffer()
    const res = await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: true, signatureName: 'Tia Tenant', termsHash: offer.termsHash, consent: true })
    expect(res.status).toBe(200)
    expect(res.data!.tenantEvidence).toMatchObject({ role: 'tenant', signatureName: 'Tia Tenant' })

    const renewed = await Agreement.findById(agreementId).lean()
    expect(renewed).toMatchObject({ rentAmount: 1250, endDate: '2028-01-01', version: 2, renewalStatus: 'renewed', tenantSignatureName: 'Tia Tenant', landlordSignatureName: 'Lara Landlord' })
    const current = renewed!.signatureEvidence.filter((e) => e.agreementVersion === 2)
    expect(current.map((e) => e.role).sort()).toEqual(['landlord', 'tenant'])
    // The PDF recomputes this hash — the signatures cover exactly the terms now in force.
    const hash = agreementTermsHash(renewed!)
    expect(current.every((e) => e.termsHash === hash)).toBe(true)
    expect(hash).toBe(offer.termsHash)
    const tenantEntry = current.find((e) => e.role === 'tenant')!
    expect(tenantEntry).toMatchObject({ consentStatement: SIGNATURE_CONSENT_STATEMENT, userAgent: 'renewal-test/tenant' })
    expect(tenantEntry.ipAddress).toBeTruthy()

    // Accepting twice cannot apply the terms twice.
    expect((await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: true, signatureName: 'Tia Tenant', termsHash: offer.termsHash, consent: true })).status).toBe(409)
  })

  it('refuses an offer whose lease changed after it was made', async () => {
    await activeLease()
    const offer = await makeOffer()
    await Agreement.updateOne({ _id: agreementId }, { $set: { status: 'terminated' } })
    expect((await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: true, signatureName: 'Tia Tenant', termsHash: offer.termsHash, consent: true })).status).toBe(409)
    expect((await Agreement.findById(agreementId).lean())?.rentAmount).toBe(1000)
  })

  it('still lets the tenant decline without signing', async () => {
    await activeLease()
    const offer = await makeOffer()
    expect((await call(`/renewals/${offer.id}/respond`, asTenant, 'POST', { accept: false })).status).toBe(200)
    expect(await Agreement.findById(agreementId).lean()).toMatchObject({ rentAmount: 1000, renewalStatus: 'tenant_declined', version: 1 })
  })
})

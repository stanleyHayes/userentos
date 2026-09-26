import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const previousCloudName = process.env.CLOUDINARY_CLOUD_NAME
process.env.CLOUDINARY_CLOUD_NAME = 'rentos-test'
vi.mock('../utils/cloudinary.js', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }),
  signedDownloadUrl: vi.fn(),
}))
vi.mock('../services/hosting/index.js', () => ({ hostingProvider: () => ({ detachDomain: vi.fn().mockResolvedValue({ ok: true }) }) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { RefreshToken } = await import('../models/RefreshToken.js')
const { DeviceToken } = await import('../models/DeviceToken.js')
const { BiometricToken } = await import('../models/BiometricToken.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { ProfileAccess } = await import('../models/ProfileAccess.js')
const { WebhookSubscription } = await import('../models/WebhookSubscription.js')
const { Property } = await import('../models/Property.js')
const { Agreement } = await import('../models/Agreement.js')
const { Worker } = await import('../models/Worker.js')
const { ServiceBooking } = await import('../models/ServiceBooking.js')
const { Business } = await import('../models/Business.js')
const { BusinessListing } = await import('../models/BusinessListing.js')
const { Storefront } = await import('../models/Storefront.js')
const { StorefrontDomain } = await import('../models/StorefrontDomain.js')
const { MarketplaceTransaction } = await import('../models/MarketplaceTransaction.js')
const { Promotion } = await import('../models/Promotion.js')
const { AgencyProfile } = await import('../models/AgencyProfile.js')
const { deleteFromCloudinary } = await import('../utils/cloudinary.js')
const { erasureLedger } = await import('../services/erasureLedger.js')
const { resolveStorefrontByHost } = await import('../services/storefront.js')
const { eraseAccountRecords } = await import('../services/accountErasure.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: usersRouter } = await import('../routes/users.js')
const { default: workersRouter } = await import('../routes/workers.js')
const { default: businessesRouter } = await import('../routes/businesses.js')
const { default: propertiesRouter } = await import('../routes/properties.js')
const { default: agencyRouter } = await import('../routes/agency.js')
const { default: tenantProfileRouter } = await import('../routes/tenantProfile.js')
const { default: tenantPassportRouter } = await import('../routes/tenantPassport.js')

const oid = () => new mongoose.Types.ObjectId()
const DAY = 24 * 60 * 60 * 1000

describe.skipIf(!hasTestMongo)('closing an account takes everything public down at once and erases it later', () => {
  const run = oid().toHexString().slice(-8)
  const [subject, landlord, viewer, admin, closedOnly, emailed, retrying] = [oid(), oid(), oid(), oid(), oid(), oid(), oid()]
  const id = (value: mongoose.Types.ObjectId) => String(value)
  const uid = id(subject)
  const city = `Closurecity${run}`
  const slug = `closure-${run}`
  const ids = {
    referencedProperty: oid(), freeProperty: oid(), worker: oid(), business: oid(), storefront: oid(), agency: oid(),
    closedOnlyWorker: oid(), closedOnlyBusiness: oid(), closedOnlyProperty: oid(),
  }
  let server: Server
  let base = ''
  let shareToken = ''
  const token = (userId: mongoose.Types.ObjectId, roles: string[], permissions: string[] = []) =>
    jwt.sign({ userId: id(userId), roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })
  const get = (path: string, as?: string) => fetch(`${base}${path}`, { headers: as ? { Authorization: `Bearer ${as}` } : {} })
  const listed = async (path: string, as: string, pick: (body: never) => Array<{ _id?: string; id?: string; business?: { id?: string; _id?: string } }>) => {
    const body = await (await get(path, as)).json() as never
    return pick(body).map((row) => String(row.business?.id ?? row.business?._id ?? row.id ?? row._id))
  }
  const viewerToken = () => token(viewer, ['tenant'])

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const person = (_id: mongoose.Types.ObjectId, extra: Record<string, unknown> = {}) => ({
      _id, email: `closure-${id(_id)}@rentos.test`, phone: `0209${id(_id).slice(-6)}`, firstName: 'Efua', lastName: `Closure${run}`,
      passwordHash: 'fixture', roles: ['tenant', 'landlord'], activeRole: 'tenant', sessionVersion: 0, ...extra,
    })
    await User.collection.insertMany([
      person(subject, { profileImage: 'https://res.cloudinary.com/rentos-test/image/upload/v1/rentos/avatars/old.jpg' }),
      person(landlord, { roles: ['landlord'], activeRole: 'landlord' }),
      person(viewer),
      person(admin, { roles: ['super_admin'], activeRole: 'super_admin' }),
      person(closedOnly, { deletedAt: new Date() }),
      person(emailed),
      person(retrying),
    ])
    const approvedProperty = (_id: mongoose.Types.ObjectId, landlordId: string, images: string[], imageAssets: Array<{ url: string; publicId: string }> = []) => ({
      _id, landlordId, title: `Closure flat ${run}`, description: 'A flat', type: 'apartment', status: 'available', listingStatus: 'approved',
      address: { street: '1 Closure Rd', city, region: 'Greater Accra' }, rentAmount: 1000, rentDurationMonths: 12, advanceMonths: 6,
      images, imageAssets, embedding: [0.1, 0.2], createdAt: new Date(), updatedAt: new Date(),
    })
    await Property.collection.insertMany([
      approvedProperty(ids.referencedProperty, uid, ['https://res.cloudinary.com/x/image/upload/v1/rentos/properties/a1.jpg'], [{ url: 'https://res.cloudinary.com/x/image/upload/v1/rentos/properties/a1.jpg', publicId: 'rentos/properties/a1' }]),
      approvedProperty(ids.freeProperty, uid, ['https://res.cloudinary.com/rentos-test/image/upload/v2/rentos/properties/b1.jpg']),
      approvedProperty(ids.closedOnlyProperty, id(closedOnly), []),
    ])
    await Agreement.collection.insertOne({ propertyId: id(ids.referencedProperty), landlordId: uid, tenantId: id(viewer), status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', rentAmount: 1000 })
    const worker = (_id: mongoose.Types.ObjectId, userId: string) => ({
      _id, userId, name: 'Efua Closure', phone: '0244000001', email: 'efua@example.test', photo: 'https://example.test/efua.jpg', location: city,
      trades: ['plumbing'], status: 'available', approvalStatus: 'approved', verificationLevel: 'none', rating: 0, completedJobs: 0,
    })
    await Worker.collection.insertMany([worker(ids.worker, uid), worker(ids.closedOnlyWorker, id(closedOnly))])
    await ServiceBooking.collection.insertOne({ requesterId: id(viewer), requesterRole: 'tenant', workerId: id(ids.worker), workerUserId: uid, description: 'Fix tap', status: 'completed' })
    const business = (_id: mongoose.Types.ObjectId, ownerId: string) => ({ _id, ownerId, name: `Closure Movers ${run}`, category: 'moving', phone: '0244000002', email: 'movers@example.test', city, approvalStatus: 'approved', createdAt: new Date() })
    await Business.collection.insertMany([business(ids.business, uid), business(ids.closedOnlyBusiness, id(closedOnly))])
    await BusinessListing.collection.insertOne({ businessId: id(ids.business), title: 'Van hire', type: 'service', isActive: true })
    await Storefront.collection.insertOne({ _id: ids.storefront, ownerType: 'user', ownerId: uid, slug, name: 'Efua Homes', status: 'active', contact: { phone: '0244000003', email: 'shop@example.test' }, branding: {} })
    await StorefrontDomain.collection.insertOne({ storefrontId: id(ids.storefront), domain: `${slug}.example.test`, verificationToken: 'txt', status: 'active', tlsStatus: 'active' })
    await MarketplaceTransaction.collection.insertOne({ reference: `CLOSE-${run}`, buyerEmail: 'buyer@example.test', buyerId: id(viewer), sellerId: uid, storefrontId: id(ids.storefront), purpose: 'marketplace', currency: 'GHS', grossAmount: 10, platformFeePercent: 5, platformFeeAmount: 0.5, sellerExpectedAmount: 9.5, status: 'paid' })
    await Promotion.collection.insertOne({ ownerId: uid, storefrontId: id(ids.storefront), code: `CLOSE${run}`.toUpperCase(), type: 'fixed', value: 5, fundingSource: 'seller', status: 'active', startAt: new Date(), endAt: new Date(Date.now() + DAY) })
    await AgencyProfile.collection.insertOne({ _id: ids.agency, ownerId: uid, name: 'Efua Agency', slug: `agency-${slug}`, phone: '0244000004', city })
    await TenantProfile.collection.insertOne({ userId: uid, occupation: 'Nurse', monthlyIncome: 4000 })
    await ProfileAccess.collection.insertOne({ requesterId: id(landlord), tenantId: uid, status: 'approved', requestedAt: new Date() })
    await WebhookSubscription.collection.insertOne({ userId: uid, url: 'https://hooks.example.test', events: ['dispute.filed'], secret: 'whsec', isActive: true })
    await RefreshToken.collection.insertOne({ userId: uid, tokenHash: `closure-${run}`, expiresAt: new Date(Date.now() + DAY) })
    await BiometricToken.collection.insertOne({ userId: uid, tokenHash: `closure-bio-${run}`, deviceId: 'phone', expiresAt: new Date(Date.now() + DAY) })
    await DeviceToken.collection.insertOne({ userId: uid, token: `ExponentPushToken[closure-${run}]`, platform: 'expo' })

    const app = express()
    app.use(express.json())
    app.use('/api/users', usersRouter)
    app.use('/api/workers', workersRouter)
    app.use('/api/businesses', businessesRouter)
    app.use('/api/properties', propertiesRouter)
    app.use('/api/agency', agencyRouter)
    app.use('/api/tenant-profile', tenantProfileRouter)
    app.use('/api/tenant-passport', tenantPassportRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    const everyone = [subject, landlord, viewer, admin, closedOnly, emailed, retrying]
    await Promise.all([
      User.collection.deleteMany({ _id: { $in: everyone } }),
      Property.collection.deleteMany({ 'address.city': city }),
      Agreement.collection.deleteMany({ propertyId: id(ids.referencedProperty) }),
      Worker.collection.deleteMany({ _id: { $in: [ids.worker, ids.closedOnlyWorker] } }),
      ServiceBooking.collection.deleteMany({ workerId: id(ids.worker) }),
      Business.collection.deleteMany({ _id: { $in: [ids.business, ids.closedOnlyBusiness] } }),
      BusinessListing.collection.deleteMany({ businessId: id(ids.business) }),
      Storefront.collection.deleteMany({ _id: ids.storefront }),
      StorefrontDomain.collection.deleteMany({ storefrontId: id(ids.storefront) }),
      MarketplaceTransaction.collection.deleteMany({ reference: `CLOSE-${run}` }),
      Promotion.collection.deleteMany({ ownerId: uid }),
      AgencyProfile.collection.deleteMany({ ownerId: uid }),
      TenantProfile.collection.deleteMany({ userId: { $in: [uid, id(emailed)] } }),
      ProfileAccess.collection.deleteMany({ tenantId: uid }),
      WebhookSubscription.collection.deleteMany({ userId: uid }),
      RefreshToken.collection.deleteMany({ userId: uid }),
      BiometricToken.collection.deleteMany({ userId: uid }),
      DeviceToken.collection.deleteMany({ userId: uid }),
      AuditLog.collection.deleteMany({ entityId: { $in: everyone.map(id) } }),
      erasureLedger().collection.deleteMany({ subjectId: { $in: everyone.map(id) } }),
    ])
    await mongoose.disconnect()
    if (previousCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME
    else process.env.CLOUDINARY_CLOUD_NAME = previousCloudName
  })

  it('shows the profiles and shares while the account is open', async () => {
    expect(await listed(`/api/workers?location=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).toContain(id(ids.worker))
    expect(await listed(`/api/businesses?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).toContain(id(ids.business))
    expect(await listed(`/api/properties?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).toContain(id(ids.freeProperty))
    expect(await resolveStorefrontByHost(`${slug}.userentos.com`)).toEqual({ slug })
    expect((await get(`/api/agency/agency-${slug}`)).status).toBe(200)
    expect((await get(`/api/tenant-profile/${uid}`, token(landlord, ['landlord']))).status).toBe(200)
    const shared = await (await fetch(`${base}/api/tenant-passport/share`, { method: 'POST', headers: { Authorization: `Bearer ${token(subject, ['tenant'])}` } })).json()
    shareToken = shared.data.token
    expect((await get(`/api/tenant-passport/shared/${shareToken}/json`)).status).toBe(200)
  })

  it('hides every public profile of an account that is closed, even if its take-down never ran', async () => {
    // closedOnly has deletedAt but approved, active profiles — the defensive filter alone must hide them.
    expect(await listed(`/api/workers?location=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).not.toContain(id(ids.closedOnlyWorker))
    expect(await listed(`/api/businesses?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).not.toContain(id(ids.closedOnlyBusiness))
    expect(await listed(`/api/properties?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).not.toContain(id(ids.closedOnlyProperty))
    expect((await get(`/api/workers/${id(ids.closedOnlyWorker)}`, viewerToken())).status).toBe(404)
    expect((await get(`/api/businesses/${id(ids.closedOnlyBusiness)}`, viewerToken())).status).toBe(404)
    expect((await get(`/api/properties/${id(ids.closedOnlyProperty)}`, viewerToken())).status).toBe(404)
  })

  it('fails closed, touching nothing, when the erasure ledger cannot record the deletion', async () => {
    const create = vi.spyOn(erasureLedger(), 'create').mockRejectedValueOnce(new Error('ledger unavailable'))
    const res = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(subject, ['tenant'])}` } })
    expect(res.status).toBe(500)
    create.mockRestore()
    const untouched = await User.findById(uid).lean()
    expect(untouched).toMatchObject({ firstName: 'Efua', email: `closure-${uid}@rentos.test` })
    expect(await Worker.findById(ids.worker).lean()).toMatchObject({ approvalStatus: 'approved' })
  })

  it('takes listings, profiles, storefront, domain, promotions and agency page down at closure', async () => {
    const res = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(subject, ['tenant'])}` } })
    expect(res.status).toBe(200)
    expect((await res.json()).message).toContain('taken down')

    expect(await listed(`/api/workers?location=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).not.toContain(id(ids.worker))
    expect(await listed(`/api/businesses?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).not.toContain(id(ids.business))
    expect(await listed(`/api/properties?city=${city}`, viewerToken(), (b: { data: { items: never[] } }) => b.data.items)).toEqual([])
    expect(await resolveStorefrontByHost(`${slug}.userentos.com`)).toBeNull()
    expect(await resolveStorefrontByHost(`${slug}.example.test`)).toBeNull()
    expect((await get(`/api/agency/agency-${slug}`)).status).toBe(404)

    expect(await Property.find({ landlordId: uid }).distinct('listingStatus')).toEqual(['withdrawn'])
    expect(await Worker.findById(ids.worker).lean()).toMatchObject({ status: 'offline', approvalStatus: 'rejected' })
    expect(await Business.findById(ids.business).lean()).toMatchObject({ approvalStatus: 'rejected' })
    expect(await BusinessListing.findOne({ businessId: id(ids.business) }).lean()).toMatchObject({ isActive: false })
    expect(await Storefront.findById(ids.storefront).lean()).toMatchObject({ status: 'archived' })
    expect(await StorefrontDomain.countDocuments({ storefrontId: id(ids.storefront) })).toBe(0)
    expect(await Promotion.findOne({ ownerId: uid }).lean()).toMatchObject({ status: 'disabled' })
    expect(await WebhookSubscription.countDocuments({ userId: uid })).toBe(0)
  })

  it('stops sharing the tenant profile and every passport link, and ends every session', async () => {
    expect((await get(`/api/tenant-profile/${uid}`, token(landlord, ['landlord']))).status).toBe(404)
    expect(await ProfileAccess.findOne({ tenantId: uid }).lean()).toMatchObject({ status: 'revoked' })
    expect((await get(`/api/tenant-passport/shared/${shareToken}/json`)).status).toBe(404)
    expect((await get(`/api/tenant-passport/shared/${shareToken}/pdf`)).status).toBe(404)

    expect(await RefreshToken.findOne({ userId: uid }).lean()).toMatchObject({ revokedReason: 'gdpr_deletion' })
    expect(await BiometricToken.countDocuments({ userId: uid })).toBe(0)
    expect(await DeviceToken.countDocuments({ userId: uid })).toBe(0)
    const tomb = await User.findOne({ _id: uid, deletedAt: { $exists: true } }).lean()
    expect(tomb).toMatchObject({ firstName: 'Deleted', lastName: 'User', sessionVersion: 1 })
  })

  it('records the closure in the ledger by id only, and in the audit log', async () => {
    const entries = await erasureLedger().find({ subjectId: uid }).lean()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ scope: 'account', source: 'self_service' })
    expect(entries[0].completedAt).toBeUndefined()
    expect(JSON.stringify(entries)).not.toMatch(/Efua|Closure|rentos\.test|0209/)
    expect(await AuditLog.findOne({ action: 'users.delete', entityId: uid }).lean()).toMatchObject({ userId: uid, details: JSON.stringify({ source: 'self_service' }) })
  })

  it('erases or anonymises everything after the grace period, and completes the ledger entry', async () => {
    expect(await eraseAccountRecords(uid, new Date(Date.now() - DAY))).toBe(false)
    expect(await eraseAccountRecords(uid, new Date(Date.now() + 31 * DAY))).toBe(true)

    const referenced = await Property.findById(ids.referencedProperty).lean()
    expect(referenced).toMatchObject({ images: [], imageAssets: [], listingStatus: 'withdrawn' })
    expect(referenced).not.toHaveProperty('embedding')
    expect(await Property.exists({ _id: ids.freeProperty })).toBeNull()
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/properties/a1', 'image', 'upload')
    // A photo uploaded before storage ids were recorded is found from its URL (the legacy backfill).
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/properties/b1', 'image', 'upload')
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/avatars/old', 'image')

    const worker = await Worker.findById(ids.worker).lean()
    expect(worker).toMatchObject({ name: 'Closed profile', phone: 'removed', status: 'offline' })
    for (const gone of ['email', 'photo', 'userId']) expect(worker).not.toHaveProperty(gone)
    expect(await Business.exists({ _id: ids.business })).toBeNull()
    expect(await BusinessListing.countDocuments({ businessId: id(ids.business) })).toBe(0)
    const storefront = await Storefront.findById(ids.storefront).lean()
    expect(storefront).toMatchObject({ name: 'Closed storefront', status: 'archived' })
    expect(storefront).not.toHaveProperty('contact')
    expect(await Promotion.countDocuments({ ownerId: uid })).toBe(0)
    expect(await AgencyProfile.countDocuments({ ownerId: uid })).toBe(0)
    expect(await TenantProfile.countDocuments({ userId: uid })).toBe(0)
    expect(await ProfileAccess.countDocuments({ tenantId: uid })).toBe(0)
    expect(await User.collection.countDocuments({ _id: subject })).toBe(0)
    expect((await get(`/api/tenant-passport/shared/${shareToken}/json`)).status).toBe(404)

    const [entry] = await erasureLedger().find({ subjectId: uid }).lean()
    expect(entry.completedAt).toBeInstanceOf(Date)
    expect(entry.expiresAt!.getTime()).toBeGreaterThan(entry.completedAt!.getTime())
  })

  it('makes admin deletion the same closure — soft-delete, ledger, audit — never a hard delete', async () => {
    const adminToken = token(admin, ['super_admin'])
    const res = await fetch(`${base}/api/users/${id(emailed)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'email_request', reason: 'Emailed deletion request' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).message).toContain('30 days')
    const tomb = await User.findOne({ _id: emailed, deletedAt: { $exists: true } }).lean()
    expect(tomb).toMatchObject({ firstName: 'Deleted', sessionVersion: 1 })
    expect(await AuditLog.findOne({ action: 'users.delete', entityId: id(emailed) }).lean())
      .toMatchObject({ userId: id(admin), details: JSON.stringify({ source: 'email_request', reason: 'Emailed deletion request' }) })
    expect(await erasureLedger().findOne({ subjectId: id(emailed) }).lean()).toMatchObject({ scope: 'account', source: 'email_request' })

    expect((await fetch(`${base}/api/users/${id(admin)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(403)
    expect((await fetch(`${base}/api/users/not-an-id`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(404)
  })

  it('tells the user a recorded closure that did not finish will complete, and a retry finishes it', async () => {
    const as = { Authorization: `Bearer ${token(retrying, ['tenant'])}` }
    const updateMany = vi.spyOn(Worker, 'updateMany').mockRejectedValueOnce(new Error('database blip'))
    const first = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: as })
    updateMany.mockRestore()
    expect(first.status).toBe(503)
    expect((await first.json()).error).toContain('recorded')
    expect(await erasureLedger().countDocuments({ subjectId: id(retrying) })).toBe(1)

    expect((await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: as })).status).toBe(200)
    expect(await User.findOne({ _id: retrying, deletedAt: { $exists: true } }).lean()).toMatchObject({ firstName: 'Deleted' })
  })
})

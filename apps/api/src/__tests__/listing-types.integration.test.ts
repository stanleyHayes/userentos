import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sms = vi.hoisted(() => ({ sendSMS: vi.fn(async () => true), smsConfigured: () => true }))
vi.mock('../services/sms.js', () => sms)

import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { Lead } from '../models/Lead.js'
import { Notification } from '../models/Notification.js'
import { Storefront } from '../models/Storefront.js'
import { FeatureFlag } from '../models/FeatureFlag.js'
import { invalidateFlagCache } from '../services/featureFlags.js'
import { DIRECT_WHATSAPP_FLAG } from '../services/listingContact.js'
import publicRegistryRouter from '../routes/publicRegistry.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

// Product brief §04 and §05: one listing record says what it is for, gets a
// short shareable link, and its WhatsApp button reaches the right agent with
// the property already in the message.
describe.skipIf(!hasTestMongo)('listing types, shareable references and WhatsApp enquiries', () => {
  const agentId = new mongoose.Types.ObjectId()
  const landlordId = new mongoose.Types.ObjectId()
  const tenantId = new mongoose.Types.ObjectId()
  const propertyIds: string[] = []
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertMany([
      { _id: agentId, email: `agent-${agentId}@rentos.test`, phone: '0244123456', firstName: 'Ama', lastName: 'Agent', roles: ['property_manager'], activeRole: 'property_manager', professionalType: 'agency', verificationStatus: 'verified', passwordHash: 'x' },
      { _id: landlordId, email: `owner-${landlordId}@rentos.test`, phone: '0200000000', firstName: 'Kofi', lastName: 'Owner', roles: ['landlord'], activeRole: 'landlord', passwordHash: 'x' },
      { _id: tenantId, email: `tenant-${tenantId}@rentos.test`, phone: '0277777777', firstName: 'Esi', lastName: 'Tenant', roles: ['tenant'], activeRole: 'tenant', passwordHash: 'x' },
    ])
    await Storefront.create({ ownerType: 'user', ownerId: String(agentId), slug: `abc-props-${String(agentId).slice(-6)}`, name: 'ABC Properties', contact: { whatsapp: '+233 50 111 2222' } })
    const app = express(); app.use(express.json()); app.use('/api/public/properties', publicRegistryRouter)
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/public/properties`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      Property.deleteMany({ _id: { $in: propertyIds } }),
      User.deleteMany({ _id: { $in: [agentId, landlordId, tenantId] } }),
      Lead.deleteMany({ agentId: String(agentId) }),
      Notification.deleteMany({ userId: String(agentId) }),
      Storefront.deleteMany({ ownerId: String(agentId) }),
    ])
    await mongoose.disconnect()
  })
  beforeEach(() => sms.sendSMS.mockClear())

  async function listing(fields: Record<string, unknown>) {
    const property = await Property.create({
      landlordId: String(agentId), title: 'Fixture listing', description: 'A bright home near the junction.', type: 'apartment',
      address: { street: '9 Private Lane', city: 'Accra', region: 'Greater Accra', neighborhood: 'East Legon' },
      rentAmount: 2500, rentDurationMonths: 12, advanceMonths: 2, bedrooms: 2, bathrooms: 1, images: ['https://example.test/1.jpg', 'https://example.test/2.jpg'],
      amenities: ['Water', 'Security'], listingStatus: 'approved', ...fields,
    })
    propertyIds.push(String(property._id))
    return property
  }

  const token = (id: mongoose.Types.ObjectId, role: string) => jwt.sign({ userId: String(id), roles: [role], activeRole: role, permissions: [], purpose: 'session', sessionVersion: 0, sid: `sid-${id}` }, config.jwtSecret, { expiresIn: '10m' })

  it('gives every new listing a short reference, and fills in what a sale or short let does not have', async () => {
    const rent = await listing({ title: 'For rent' })
    expect(rent.listingRef).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/)
    expect(rent.listingType).toBe('rent')

    const sale = await listing({ title: 'For sale', listingType: 'sale', rentAmount: 850000, rentDurationMonths: undefined, advanceMonths: undefined })
    expect(sale.rentDurationMonths).toBe(0)
    expect(sale.advanceMonths).toBe(0)

    const shortLet = await listing({ title: 'Short let', listingType: 'short_let', rentAmount: 450, rentDurationMonths: undefined, advanceMonths: undefined })
    expect(shortLet.stayType).toBe('short_stay')
    expect(shortLet.listingRef).not.toBe(rent.listingRef)
  })

  it('filters the registry by purpose, counting older untyped listings as rentals', async () => {
    const legacy = await listing({ title: 'Legacy untyped rental' })
    await Property.collection.updateOne({ _id: legacy._id }, { $unset: { listingType: '' } })
    const forSale = await listing({ title: 'Unique sale fixture', listingType: 'sale', rentAmount: 990000, rentDurationMonths: undefined, advanceMonths: undefined })

    const rentals = (await (await fetch(`${base}/search?listingType=rent&pageSize=50`)).json()).data.items as { id: string; listingType: string }[]
    expect(rentals.some((item) => item.id === String(legacy._id))).toBe(true)
    expect(rentals.some((item) => item.id === String(forSale._id))).toBe(false)

    const sales = (await (await fetch(`${base}/search?listingType=sale&pageSize=50`)).json()).data.items as { id: string; listingType: string; ref: string }[]
    const hit = sales.find((item) => item.id === String(forSale._id))
    expect(hit).toMatchObject({ listingType: 'sale', ref: forSale.listingRef })
  })

  it('serves the full property page by its reference, with the agent but without their phone or the street', async () => {
    const property = await listing({ title: 'Ref page fixture' })
    const response = await fetch(`${base}/${property.listingRef!.toLowerCase()}`)
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data).toMatchObject({
      id: String(property._id), ref: property.listingRef, listingType: 'rent', description: 'A bright home near the junction.',
      images: ['https://example.test/1.jpg', 'https://example.test/2.jpg'], amenities: ['Water', 'Security'], rentDurationMonths: 12, advanceMonths: 2,
      url: expect.stringMatching(new RegExp(`/property/${property.listingRef!.toLowerCase()}$`)),
      // Direct WhatsApp is off unless an admin switches it on (contact protection).
      agent: { name: 'ABC Properties', type: 'Agency', identityVerified: true, whatsapp: false },
    })
    const raw = JSON.stringify(data)
    expect(raw).not.toContain('9 Private Lane')
    expect(raw).not.toContain('0244123456')
    expect(raw).not.toContain('501112222')
    expect((await fetch(`${base}/ZZZZZZZ`)).status).toBe(404)
  })

  it("keeps the agent's number private by default: no WhatsApp link and no lead", async () => {
    const property = await listing({ title: 'Private number fixture' })
    const response = await fetch(`${base}/${property.listingRef}/whatsapp`, { method: 'POST', headers: { Authorization: `Bearer ${token(tenantId, 'tenant')}` } })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/message on RentOS/)
    expect(await Lead.countDocuments({ propertyId: String(property._id) })).toBe(0)
  })

  describe('when an admin switches direct WhatsApp on', () => {
    beforeAll(async () => {
      await FeatureFlag.create({ key: DIRECT_WHATSAPP_FLAG, description: 'test', enabled: true })
      invalidateFlagCache()
    })
    afterAll(async () => {
      await FeatureFlag.deleteMany({ key: DIRECT_WHATSAPP_FLAG })
      invalidateFlagCache()
    })

  it('opens WhatsApp with the property in the message and records a signed-in tenant as a lead, alerting the agent once', async () => {
    const property = await listing({ title: 'WhatsApp fixture flat' })
    const tap = () => fetch(`${base}/${property.listingRef}/whatsapp`, { method: 'POST', headers: { Authorization: `Bearer ${token(tenantId, 'tenant')}` } })

    const first = await tap()
    expect(first.status).toBe(200)
    const { url } = (await first.json()).data
    expect(url.startsWith('https://wa.me/233501112222?text=')).toBe(true)
    const text = decodeURIComponent(url.split('text=')[1])
    expect(text).toContain('Hello, I am interested in this property:')
    expect(text).toContain('WhatsApp fixture flat')
    expect(text).toContain('East Legon, Accra')
    expect(text).toContain(`Ref ${property.listingRef}`)

    await tap()
    const leads = await Lead.find({ propertyId: String(property._id) }).lean()
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({ requesterId: String(tenantId), contactName: 'Esi Tenant', channel: 'whatsapp' })
    // The enquirer's own number stays private even then.
    expect(leads[0].contactPhone).toBeUndefined()

    await vi.waitFor(async () => {
      const notices = await Notification.find({ userId: String(agentId), message: /WhatsApp fixture flat/ }).lean()
      expect(notices).toHaveLength(1)
      expect(notices[0].message).not.toContain('Esi')
      expect(sms.sendSMS).toHaveBeenCalledTimes(1)
    })
    const [to, smsText] = sms.sendSMS.mock.calls[0] as unknown as [string, string]
    expect(to).toBe('0244123456')
    expect(smsText).toContain('"WhatsApp fixture flat"')
    expect(smsText).toContain(`/agent/leads?lead=${String(leads[0]._id)}`)
  })

  it('does not create a lead for an anonymous tap, and says so when the agent has no WhatsApp number', async () => {
    const property = await listing({ title: 'Anonymous tap fixture' })
    expect((await fetch(`${base}/${property.listingRef}/whatsapp`, { method: 'POST' })).status).toBe(200)
    expect(await Lead.countDocuments({ propertyId: String(property._id) })).toBe(0)

    // A landlord's personal phone is never used unless they put it on a website.
    const owned = await listing({ title: 'No number fixture', landlordId: String(landlordId) })
    const response = await fetch(`${base}/${owned.listingRef}/whatsapp`, { method: 'POST' })
    expect(response.status).toBe(409)
  })
  })
})

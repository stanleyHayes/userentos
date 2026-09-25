import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { AgencyProfile } from '../models/AgencyProfile.js'
import { Property } from '../models/Property.js'
import router from '../routes/agency.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('agency REAC licence and public page', () => {
  const landlordId = new mongoose.Types.ObjectId()
  const adminId = new mongoose.Types.ObjectId()
  const owner = String(landlordId)
  const name = `Licence Fixture ${Date.now().toString(36)}`
  let server: Server
  const url = (path: string) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agency${path}`
  const token = (userId: string, roles: string[]) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' })
  const landlord = () => token(owner, ['landlord'])
  const admin = () => token(String(adminId), ['admin'])
  const save = (body: Record<string, unknown>) => fetch(url('/me'), { method: 'POST', headers: landlord(), body: JSON.stringify({ name, phone: '0241234567', city: 'Accra', ...body }) })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.collection.insertMany([
      { _id: landlordId, email: `agency-${owner}@rentos.test`, roles: ['landlord'], activeRole: 'landlord', passwordHash: 'x' },
      { _id: adminId, email: `agency-admin-${owner}@rentos.test`, roles: ['admin'], activeRole: 'admin', passwordHash: 'x' },
    ])
    await Property.collection.insertMany([
      { landlordId: owner, title: `Approved ${owner}`, status: 'available', listingStatus: 'approved' },
      { landlordId: owner, title: `Unreviewed ${owner}`, status: 'available', listingStatus: 'pending_review' },
    ])
    const app = express(); app.use(express.json()); app.use('/api/agency', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Promise.all([AgencyProfile.deleteMany({ ownerId: owner }), Property.deleteMany({ landlordId: owner }), User.deleteMany({ _id: { $in: [landlordId, adminId] } })])
    await mongoose.disconnect()
  })

  it('shows a self-reported licence as unverified, hides the owner id and unreviewed listings', async () => {
    const created = await (await save({ reacLicenceNumber: ' REAC/AG/2026/0042 ' })).json()
    expect(created.data.reacLicenceNumber).toBe('REAC/AG/2026/0042')
    const page = await (await fetch(url(`/${created.data.slug}`))).json()
    expect(page.data.agency.licence).toEqual({ number: 'REAC/AG/2026/0042', verified: false })
    expect(JSON.stringify(page.data.agency)).not.toContain(owner)
    expect(page.data.listings.map((l: { title: string }) => l.title)).toEqual([`Approved ${owner}`])
  })

  it('lets only an admin verify, and a changed number drops the verification', async () => {
    const agency = await AgencyProfile.findOne({ ownerId: owner }).lean()
    const id = String(agency!._id)
    expect((await fetch(url(`/${id}/licence`), { method: 'PATCH', headers: landlord(), body: JSON.stringify({ verified: true }) })).status).toBe(403)
    const pending = await (await fetch(url('/admin/licences'), { headers: admin() })).json()
    expect(pending.data.items.some((item: { id: string }) => item.id === id)).toBe(true)
    const verified = await (await fetch(url(`/${id}/licence`), { method: 'PATCH', headers: admin(), body: JSON.stringify({ verified: true }) })).json()
    expect(verified.data.licence).toEqual({ number: 'REAC/AG/2026/0042', verified: true })

    await save({ reacLicenceNumber: 'REAC/AG/2026/9999' })
    const page = await (await fetch(url(`/${agency!.slug}`))).json()
    expect(page.data.agency.licence).toEqual({ number: 'REAC/AG/2026/9999', verified: false })
  })
})

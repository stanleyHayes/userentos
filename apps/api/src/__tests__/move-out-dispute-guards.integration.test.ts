import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { MoveOut } = await import('../models/MoveOut.js')
const { default: moveOutRouter } = await import('../routes/moveOut.js')

const uri = testMongoUri

describe.skipIf(!hasTestMongo)('move-out dispute guards', () => {
  const landlordId = String(new mongoose.Types.ObjectId())
  const tenantId = String(new mongoose.Types.ObjectId())
  const agreementId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: landlordId, roles: ['landlord'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' }
  const post = (path: string, body: unknown = {}) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const moveOut = (overrides: Record<string, unknown> = {}) => MoveOut.create({
    agreementId, tenantId, landlordId, propertyId: 'guard-property', status: 'disputed', preDisputeStatus: 'refund_pending', initiatedBy: 'tenant',
    moveOutDate: '2026-06-01', damages: [{ description: 'Broken window', cost: 200, photos: [] }], securityDeposit: 200, deductionsTotal: 200, refundAmount: 0, notes: [], ...overrides,
  })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create({ _id: landlordId, email: `moveout-${landlordId}@rentos.test`, phone: '0240000009', firstName: 'Move', lastName: 'Out', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' })
    const app = express()
    app.use(express.json())
    app.use('/move-outs', moveOutRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => { await MoveOut.deleteMany({ agreementId }) })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await User.deleteOne({ _id: landlordId })
    await mongoose.disconnect()
  })

  it('a zero refund cannot settle a disputed move-out', async () => {
    const mo = await moveOut()
    expect((await post(`/move-outs/${mo.id}/process-refund`)).status).toBe(409)
    expect((await MoveOut.findById(mo.id).lean())?.status).toBe('disputed')
  })

  it('the landlord cannot rewrite inspection findings while they are disputed', async () => {
    const mo = await moveOut()
    const response = await post(`/move-outs/${mo.id}/inspection`, { damages: [{ description: 'New claim', cost: 50 }] })
    expect(response.status).toBe(409)
    const stored = await MoveOut.findById(mo.id).lean()
    expect(stored?.damages.map((d) => d.description)).toEqual(['Broken window'])
    expect(stored?.status).toBe('disputed')
  })

  it('rescheduling an inspection cannot walk a move-out out of dispute', async () => {
    const mo = await moveOut()
    expect((await post(`/move-outs/${mo.id}/schedule-inspection`, { inspectionDate: '2026-06-10' })).status).toBe(409)
    expect((await MoveOut.findById(mo.id).lean())?.status).toBe('disputed')
  })

  it('undisputed move-outs still inspect and settle with no refund owed', async () => {
    const mo = await moveOut({ status: 'inspection_scheduled', preDisputeStatus: undefined, damages: [], deductionsTotal: 0, refundAmount: 200 })
    const inspected = await post(`/move-outs/${mo.id}/inspection`, { damages: [{ description: 'Broken window', cost: 200 }] })
    expect(inspected.status).toBe(200)
    expect((await inspected.json()).data).toMatchObject({ status: 'refund_pending', refundAmount: 0, deductionsTotal: 200 })
    const settled = await post(`/move-outs/${mo.id}/process-refund`)
    expect(settled.status).toBe(200)
    expect((await settled.json()).data).toMatchObject({ status: 'refund_paid', refundReference: expect.stringMatching(/-ZERO$/) })
  })
})

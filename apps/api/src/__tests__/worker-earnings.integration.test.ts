import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Worker } = await import('../models/Worker.js')
const { ServiceBooking } = await import('../models/ServiceBooking.js')
const { default: workersRouter } = await import('../routes/workers.js')

/*
 * A refunded job's money went back to the buyer, so the earnings dashboard
 * must not count it as paid. A full marketplace refund now clears
 * paymentAmount; bookings refunded before that still carry it.
 */
describe.skipIf(!hasTestMongo)('worker earnings after a refund', () => {
  const workerUser = new mongoose.Types.ObjectId()
  const requester = String(new mongoose.Types.ObjectId())
  let server: Server, base = ''
  const auth = () => `Bearer ${jwt.sign({ userId: String(workerUser), roles: ['service_provider'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: workerUser, email: `earnings-${workerUser}@rentos.test`, phone: '0241234567', firstName: 'Earn', lastName: 'Fixture', passwordHash: 'fixture-only', roles: ['service_provider'], activeRole: 'service_provider' })
    const worker = await Worker.create({ userId: String(workerUser), name: 'Earn Fixture', phone: '0241234567', location: 'Accra' })
    const job = { requesterId: requester, requesterRole: 'tenant' as const, workerId: String(worker._id), workerUserId: String(workerUser), description: 'Fix the gate', status: 'completed' as const, finalCost: 100 }
    await ServiceBooking.create([
      { ...job, paymentStatus: 'paid' as const, paymentAmount: 100 },
      // Refunded before paymentAmount was cleared on refund.
      { ...job, paymentStatus: 'refunded' as const, paymentAmount: 100 },
      { ...job, paymentStatus: 'refunded' as const },
    ])
    const app = express(); app.use(express.json()); app.use('/workers', workersRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await ServiceBooking.deleteMany({ requesterId: requester })
    await Worker.deleteMany({ userId: String(workerUser) })
    await User.deleteOne({ _id: workerUser })
    await mongoose.disconnect()
  })

  it('counts only the job still paid for as paid', async () => {
    const res = await fetch(`${base}/workers/me/earnings`, { headers: { Authorization: auth() } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toMatchObject({ totalEarned: 300, totalPaid: 100, pendingPayout: 200, completedJobs: 3 })
  })
})

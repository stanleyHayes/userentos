import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('../services/bookingEvents.js', () => ({ emitBookingCreated: vi.fn(), emitBookingUpdated: vi.fn() }))
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { resolveQuote } from '../services/marketplace/pricing.js'
import router from '../routes/serviceBookings.js'

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('service booking price lock', () => {
  const customer = new mongoose.Types.ObjectId(), worker = new mongoose.Types.ObjectId()
  const bookingId = new mongoose.Types.ObjectId()
  let server: Server, url: string
  const patch = (as: mongoose.Types.ObjectId, body: unknown) => fetch(`${url}/${bookingId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jwt.sign({ userId: String(as), roles: ['tenant'], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const booking = async () => (await ServiceBooking.findById(bookingId).lean())!
  const checkoutPrice = async () => {
    const quote = await resolveQuote({ purpose: 'service_booking', buyerId: String(customer), bookingId: String(bookingId) })
    return quote.ok ? quote.amount : quote.reason
  }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.create([customer, worker].map((_id, i) => ({
      _id, email: `price-${i}-${_id}@rentos.test`, phone: '0241234567', firstName: 'Price', lastName: 'Fixture',
      passwordHash: 'fixture-only', roles: ['tenant'], activeRole: 'tenant',
    })))
    await ServiceBooking.create({ _id: bookingId, requesterId: String(customer), requesterRole: 'tenant', workerId: `w-${worker}`, workerUserId: String(worker), description: 'Rewire the kitchen', status: 'confirmed' })
    const app = express(); app.use(express.json()); app.use('/', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await ServiceBooking.deleteOne({ _id: bookingId })
    await User.deleteMany({ _id: { $in: [customer, worker] } })
    await mongoose.disconnect()
  })

  it('keeps the checkout price at what the customer agreed to', async () => {
    expect((await patch(worker, { quoteAmount: 200 })).status).toBe(200)
    // The worker cannot accept their own quote.
    expect((await patch(worker, { quoteAccepted: true })).status).toBe(403)
    expect((await patch(customer, { quoteAccepted: true })).status).toBe(200)
    expect(await checkoutPrice()).toBe(200)

    // Raising the final cost after acceptance is only a proposal...
    expect((await patch(worker, { finalCost: 2000 })).status).toBe(200)
    expect(await booking()).toMatchObject({ proposedFinalCost: 2000 })
    expect((await booking()).finalCost).toBeUndefined()
    expect(await checkoutPrice()).toBe(200)

    // ...until the customer approves it.
    expect((await patch(worker, { approveFinalCost: true })).status).toBe(403)
    expect((await patch(customer, { approveFinalCost: true })).status).toBe(200)
    expect(await checkoutPrice()).toBe(2000)
  })

  it('never lets the customer write the payment amount, and derives it when paid', async () => {
    expect((await patch(customer, { paymentAmount: 1 })).status).toBe(403)
    expect((await patch(worker, { paymentStatus: 'paid', paymentAmount: 1 })).status).toBe(200)
    expect(await booking()).toMatchObject({ paymentStatus: 'paid', paymentAmount: 2000 })
    // Paid is final for the price.
    expect((await patch(worker, { finalCost: 5000 })).status).toBe(409)
  })
})

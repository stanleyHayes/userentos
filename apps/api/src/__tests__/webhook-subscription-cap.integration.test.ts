import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { WebhookSubscription } = await import('../models/WebhookSubscription.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: webhooksRouter } = await import('../routes/webhooks.js')

describe.skipIf(!hasTestMongo)('webhook subscription cap', () => {
  const userId = String(new mongoose.Types.ObjectId())
  let server: Server
  let base = ''
  const headers = { Authorization: `Bearer ${jwt.sign({ userId, roles: ['landlord'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}`, 'Content-Type': 'application/json' }
  const patch = async (id: string, body: unknown) => (await fetch(`${base}/webhooks/subscriptions/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })).status
  const subscribe = (count: number, isActive: boolean) => WebhookSubscription.create(Array.from({ length: count }, (_, i) => ({ userId, url: `https://hooks.example.com/${isActive ? 'on' : 'off'}/${i}`, events: ['payment.completed'], secret: 'fixture', isActive })))

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.create({ _id: userId, email: `hooks-${userId}@rentos.test`, phone: '0240000550', firstName: 'Web', lastName: 'Hook', passwordHash: 'fixture', roles: ['landlord'], activeRole: 'landlord' })
    const app = express()
    app.use(express.json())
    app.use('/webhooks', webhooksRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([User.deleteOne({ _id: userId }), WebhookSubscription.deleteMany({ userId })])
    await mongoose.disconnect()
  })

  it('refuses to re-activate a paused subscription once ten are active', async () => {
    // Ten paused, then ten new active ones: the old PATCH turned the first ten back on.
    const paused = await subscribe(10, false)
    await subscribe(10, true)
    expect(await patch(String(paused[0]._id), { isActive: true })).toBe(409)
    expect(await WebhookSubscription.countDocuments({ userId, isActive: true })).toBe(10)

    // Editing events, or re-sending isActive:true on an active one, is not a new activation.
    const active = await WebhookSubscription.findOne({ userId, isActive: true })
    expect(await patch(String(active!._id), { isActive: true, events: ['payment.failed'] })).toBe(200)
    expect(await patch(String(paused[1]._id), { events: ['payment.failed'] })).toBe(200)

    // Pausing one frees a slot.
    expect(await patch(String(active!._id), { isActive: false })).toBe(200)
    expect(await patch(String(paused[0]._id), { isActive: true })).toBe(200)
    expect(await WebhookSubscription.countDocuments({ userId, isActive: true })).toBe(10)
  })

  it('holds the cap when re-activations race each other', async () => {
    await WebhookSubscription.deleteMany({ userId })
    const paused = await subscribe(5, false)
    await subscribe(9, true)
    const statuses = await Promise.all(paused.map((p) => patch(String(p._id), { isActive: true })))
    expect(statuses.filter((code) => code === 200).length).toBeLessThanOrEqual(1)
    expect(await WebhookSubscription.countDocuments({ userId, isActive: true })).toBeLessThanOrEqual(10)
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Notification } from '../models/Notification.js'
import { signDownloadToken } from '../services/authService.js'
import exportDownloadRouter from '../routes/accountExportDownload.js'
import usersRouter from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

/*
 * The mobile app downloads the personal-data export as a file instead of
 * sharing it as message text (Android's binder limit rejected large ones).
 * The file route takes a short-lived download token only, never a session.
 */
describe.skipIf(!hasTestMongo)('personal-data export as a file download', () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  const [owner, outsider, suspended] = ids.map(String)
  let server: Server
  let base: string
  const session = (userId: string) => jwt.sign({ userId, roles: ['tenant'], permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret, { expiresIn: '5m' })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertMany(ids.map(_id => ({ _id, email: `export-file-${_id}@rentos.test`, firstName: 'Export', lastName: 'Fixture', roles: ['tenant'], activeRole: 'tenant', passwordHash: 'private-password', sessionVersion: 0 })))
    await User.updateOne({ _id: suspended }, { $set: { suspendedAt: new Date(), suspensionReason: 'fixture' } })
    await Notification.create([owner, outsider].map(userId => ({ userId, title: 'Rent', message: `message-${userId}`, channel: 'in_app' })))
    const app = express()
    app.use(express.json())
    app.use('/api/users', exportDownloadRouter)
    app.use('/api/users', usersRouter)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await Notification.deleteMany({ userId: { $in: [owner, outsider] } })
    await User.deleteMany({ _id: { $in: ids } })
    await mongoose.disconnect()
  })

  it('a minted download link returns the export as a JSON attachment for its own account only', async () => {
    const link = await fetch(`${base}/me/export-link`, { method: 'POST', headers: { Authorization: `Bearer ${session(owner)}` } })
    expect(link.status).toBe(200)
    const { data } = await link.json()
    const response = await fetch(`${base}/me/export.json?token=${encodeURIComponent(data.token)}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="rentos-personal-data-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.user.id).toBe(owner)
    expect(body.notifications.map((n: { message: string }) => n.message)).toEqual([`message-${owner}`])
    expect(JSON.stringify(body)).not.toContain(outsider)
    expect(JSON.stringify(body)).not.toContain('private-password')
  })

  it('the in-app JSON export is unchanged', async () => {
    const response = await fetch(`${base}/me/export`, { headers: { Authorization: `Bearer ${session(owner)}` } })
    expect(response.status).toBe(200)
    expect((await response.json()).data.user.id).toBe(owner)
  })

  it('refuses a session token, an expired download token and no token', async () => {
    expect((await fetch(`${base}/me/export.json`, { headers: { Authorization: `Bearer ${session(owner)}` } })).status).toBe(401)
    expect((await fetch(`${base}/me/export.json?token=${encodeURIComponent(session(owner))}`)).status).toBe(401)
    const expired = jwt.sign({ userId: owner, purpose: 'download', sessionVersion: 0, exp: Math.floor(Date.now() / 1000) - 10 }, config.jwtSecret)
    expect((await fetch(`${base}/me/export.json?token=${expired}`)).status).toBe(401)
    expect((await fetch(`${base}/me/export.json`)).status).toBe(401)
    // A download token cannot mint another link.
    expect((await fetch(`${base}/me/export-link`, { method: 'POST', headers: { Authorization: `Bearer ${signDownloadToken(owner, 0)}` } })).status).toBe(401)
  })

  it('a download token from before logout-all (older session version) is refused', async () => {
    const stale = signDownloadToken(owner, 0)
    await User.updateOne({ _id: owner }, { $set: { sessionVersion: 1 } })
    try {
      expect((await fetch(`${base}/me/export.json?token=${stale}`)).status).toBe(401)
    } finally {
      await User.updateOne({ _id: owner }, { $set: { sessionVersion: 0 } })
    }
  })

  it('a suspended account can still mint a link and download its export', async () => {
    const link = await fetch(`${base}/me/export-link`, { method: 'POST', headers: { Authorization: `Bearer ${session(suspended)}` } })
    expect(link.status).toBe(200)
    const { data } = await link.json()
    const response = await fetch(`${base}/me/export.json?token=${encodeURIComponent(data.token)}`)
    expect(response.status).toBe(200)
    expect((await response.json()).user.id).toBe(suspended)
  })
})

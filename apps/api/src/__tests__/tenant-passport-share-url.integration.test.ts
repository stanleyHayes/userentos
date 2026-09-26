import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { publicBaseUrl } from '../utils/env.js'
import router from '../routes/tenantPassport.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

const uri = testMongoUri
describe.skipIf(!hasTestMongo)('tenant passport share links', () => {
  const _id = new mongoose.Types.ObjectId()
  const tenantId = String(_id)
  let server: Server
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tenant-passport`
  const auth = { Authorization: `Bearer ${jwt.sign({ userId: tenantId, roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })}` }
  // What a proxy (or anyone calling the API directly) may put in front of it.
  const spoofed = { 'X-Forwarded-Host': 'phish.example', 'X-Forwarded-Proto': 'http' }

  beforeAll(async () => {
    await mongoose.connect(uri)
    await User.collection.insertOne({ _id, email: `passport-url-${tenantId}@rentos.test`, firstName: 'Kofi', lastName: 'Share', roles: ['tenant'], activeRole: 'tenant', passwordHash: 'x' })
    const app = express(); app.use(express.json()); app.use('/api/tenant-passport', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await User.deleteMany({ _id })
    await mongoose.disconnect()
  })

  it('points the share link at the web app, not the API host or a forwarded host', async () => {
    const res = await fetch(`${base()}/share`, { method: 'POST', headers: { ...auth, ...spoofed } })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.url).toBe(`${publicBaseUrl()}/passport/${data.token}`)
    expect(data.url).not.toContain('phish.example')
    expect(data.url).not.toContain('127.0.0.1')
  })

  it('prints the same web link in the shared PDF QR code', async () => {
    const { data: link } = await (await fetch(`${base()}/share`, { method: 'POST', headers: auth })).json()
    const qr = vi.spyOn(QRCode, 'toDataURL')
    try {
      const pdf = await fetch(`${base()}/shared/${link.token}/pdf`, { headers: spoofed })
      expect(pdf.status).toBe(200)
      await pdf.arrayBuffer()
      expect(qr).toHaveBeenCalledWith(`${publicBaseUrl()}/passport/${link.token}`, expect.anything())
    } finally {
      qr.mockRestore()
    }
  })
})

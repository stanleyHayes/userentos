import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import router from '../routes/biometricAuth.js'
import { disconnectBiometricUser } from '../services/socket.js'
vi.mock('../services/socket.js', () => ({ disconnectBiometricUser: vi.fn() }))
import { User } from '../models/User.js'
import { BiometricToken } from '../models/BiometricToken.js'
const auth = vi.hoisted(() => ({ version: 2 as number | undefined }))
vi.mock('../middleware/auth.js', () => ({ authenticate: (req: Request, _res: Response, next: NextFunction) => {
  req.user = { userId: 'fixture', sessionVersion: auth.version } as Request['user']; next()
} }))
vi.mock('../middleware/rateLimit.js', () => ({ loginLimiter: (_req: Request, _res: Response, next: NextFunction) => next() }))
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true) } }))
vi.mock('../models/User.js', () => ({ User: { findById: vi.fn(), updateOne: vi.fn(), exists: vi.fn() } }))
vi.mock('../models/BiometricToken.js', () => ({ BiometricToken: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn(), updateMany: vi.fn(), updateOne: vi.fn() } }))
const user = { _id: 'fixture', email: 'fixture@example.test', roles: ['tenant'], sessionVersion: 2, passwordHash: 'fixture', toSafe: () => ({ id: 'fixture' }) }
const record = { userId: 'fixture', deviceId: 'fixture-device', sessionVersion: 2 }
let server: Server, base: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router)
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
beforeEach(() => {
  vi.resetAllMocks(); auth.version = 2
  vi.mocked(BiometricToken.updateMany).mockResolvedValue({ modifiedCount: 1 } as never)
  // Resetting mocks also resets the password comparator.
  vi.mocked(User.findById).mockResolvedValue({ ...user } as never)
  vi.mocked(BiometricToken.findOneAndUpdate).mockResolvedValue({ ...record } as never)
})
const send = (path: string, body: unknown) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const exchange = () => send('exchange', { refreshToken: 'fixture-opaque-token-12345', deviceId: record.deviceId })
it.each([undefined, 0, 1])('rejects old biometric generation %s before successor issuance', async version => {
  vi.mocked(BiometricToken.findOneAndUpdate).mockResolvedValue({ ...record, sessionVersion: version } as never)
  expect((await exchange()).status).toBe(401)
  expect(BiometricToken.create).not.toHaveBeenCalled()
})
it('preserves current generation in both credentials', async () => {
  const response = await exchange()
  expect(response.status).toBe(200)
  expect(jwt.decode((await response.json()).data.token)).toMatchObject({ sessionVersion: 2 })
  expect(BiometricToken.create).toHaveBeenCalledWith(expect.objectContaining({ sessionVersion: 2 }))
})
it('keeps legacy exchange at generation zero', async () => {
  vi.mocked(User.findById).mockResolvedValue({ ...user, sessionVersion: undefined } as never)
  vi.mocked(BiometricToken.findOneAndUpdate).mockResolvedValue({ ...record, sessionVersion: undefined } as never)
  expect((await exchange()).status).toBe(200)
  expect(BiometricToken.create).toHaveBeenCalledWith(expect.objectContaining({ sessionVersion: 0 }))
})
it('rejects an enrollment authenticated before revocation but loaded afterward', async () => {
  auth.version = 1
  expect((await send('enroll', { deviceId: record.deviceId, password: 'fixture' })).status).toBe(401)
  expect(BiometricToken.create).not.toHaveBeenCalled()
  expect(BiometricToken.updateMany).not.toHaveBeenCalled()
})
it('binds enrollment to authenticated generation and ignores caller-supplied version', async () => {
  const bcrypt = await import('bcryptjs')
  vi.mocked(bcrypt.default.compare).mockImplementation(async () => true)
  expect((await send('enroll', { deviceId: record.deviceId, password: 'fixture', sessionVersion: 900 })).status).toBe(201)
  expect(BiometricToken.create).toHaveBeenCalledWith(expect.objectContaining({ sessionVersion: 2 }))
})

it('revoke-all advances only biometric generation before record cleanup', async () => {
  expect((await send('revoke-all', {})).status).toBe(200)
  expect(User.updateOne).toHaveBeenCalledWith({ _id: 'fixture' }, { $inc: { biometricVersion: 1 } })
  expect(disconnectBiometricUser).toHaveBeenCalledWith('fixture')
  expect(vi.mocked(User.updateOne).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(BiometricToken.updateMany).mock.invocationCallOrder[0])
})
it('replay advances biometric generation before cleanup', async () => {
  // The claim finds no live token; a rotated one from the current generation is then claimed as replay.
  vi.mocked(BiometricToken.findOneAndUpdate).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...record, _id: 'rotated' } as never)
  vi.mocked(BiometricToken.findOne).mockResolvedValue({ ...record, _id: 'rotated', revokedAt: new Date(Date.now() - 120_000), revokedReason: 'rotated' } as never)
  vi.mocked(User.exists).mockResolvedValue({ _id: 'fixture' } as never)
  expect((await exchange()).status).toBe(401)
  expect(User.updateOne).toHaveBeenCalledWith({ _id: 'fixture' }, { $inc: { biometricVersion: 1 } })
  expect(disconnectBiometricUser).toHaveBeenCalledWith('fixture')
  expect(vi.mocked(User.updateOne).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(BiometricToken.updateMany).mock.invocationCallOrder[0])
})
it('rejects old biometric generations even when account session version matches', async () => {
  vi.mocked(User.findById).mockResolvedValue({ ...user, biometricVersion: 1 } as never)
  expect((await exchange()).status).toBe(401)
  expect(BiometricToken.create).not.toHaveBeenCalled()
})
it('carries a nonzero biometric generation into access and successor credentials', async () => {
  vi.mocked(User.findById).mockResolvedValue({ ...user, biometricVersion: 4 } as never)
  vi.mocked(BiometricToken.findOneAndUpdate).mockResolvedValue({ ...record, biometricVersion: 4 } as never)
  const response = await exchange()
  expect(response.status).toBe(200)
  expect(jwt.decode((await response.json()).data.token)).toMatchObject({ biometricVersion: 4, sessionVersion: 2 })
  expect(BiometricToken.create).toHaveBeenCalledWith(expect.objectContaining({ biometricVersion: 4 }))
})

import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import router from '../routes/push.js'
import { registerDeviceToken, unregisterDeviceToken } from '../services/push.js'
vi.mock('../services/push.js', () => ({ registerDeviceToken: vi.fn(), unregisterDeviceToken: vi.fn() }))
vi.mock('../middleware/auth.js', () => ({ authenticate: (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization !== 'Bearer fixture') { res.sendStatus(401); return }
  req.user = { userId: 'fixture-owner' } as Request['user']; next()
} }))
let server: Server, base: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/push', router)
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
beforeEach(() => vi.clearAllMocks())
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
const send = (path: string, body: unknown, auth = true) => fetch(`${base}/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(body) })
for (const path of ['register', 'unregister']) it.each([
  { $ne: null }, ['token'], 123, null, '', 'token\nheader', 'token with spaces', 'x'.repeat(4097),
])(`${path} rejects malformed/query-operator token %# before service access`, async token => {
  expect((await send(path, { token })).status).toBe(400)
  expect(registerDeviceToken).not.toHaveBeenCalled(); expect(unregisterDeviceToken).not.toHaveBeenCalled()
})
it.each(['invalid', { $ne: null }, ['expo']])('rejects invalid platform %# before registering', async platform => {
  expect((await send('register', { token: 'ExponentPushToken[fixture]', platform })).status).toBe(400)
  expect(registerDeviceToken).not.toHaveBeenCalled()
})
it('registers valid opaque tokens only for the authenticated owner', async () => {
  expect((await send('register', { token: 'ExponentPushToken[fixture]', platform: 'expo' })).status).toBe(200)
  expect(registerDeviceToken).toHaveBeenCalledWith('fixture-owner', 'ExponentPushToken[fixture]', 'expo')
})
it('unregisters only the supplied scalar token for the authenticated owner', async () => {
  expect((await send('unregister', { token: 'opaque-fcm:fixture' })).status).toBe(200)
  expect(unregisterDeviceToken).toHaveBeenCalledWith('fixture-owner', 'opaque-fcm:fixture')
})
it('rejects unauthenticated enrollment and caller-supplied owner fields', async () => {
  expect((await send('register', { token: 'fixture' }, false)).status).toBe(401)
  expect((await send('register', { token: 'fixture', userId: 'other-owner' })).status).toBe(400)
  expect(registerDeviceToken).not.toHaveBeenCalled()
})

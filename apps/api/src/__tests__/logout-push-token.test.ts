import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

/*
 * POST /auth/logout carries the phone's push token so the signed-out phone
 * stops receiving the account's notifications. A malformed token is dropped,
 * never a reason to leave the session signed in.
 */
const { authService } = vi.hoisted(() => ({ authService: { logout: vi.fn() } }))
vi.mock('../container.js', () => ({ authService }))

const { default: authRouter } = await import('../routes/auth.js')

describe('logout request contract', () => {
  let server: Server
  let base: string
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/auth', authRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`
  })
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })
  beforeEach(() => { authService.logout.mockReset().mockResolvedValue({ data: null }) })

  const logout = (body: unknown) => fetch(`${base}/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('passes the push token to the sign-out', async () => {
    expect((await logout({ refreshToken: 'refresh', pushToken: 'ExponentPushToken[device]' })).status).toBe(200)
    expect(authService.logout).toHaveBeenCalledWith('refresh', 'ExponentPushToken[device]')
  })

  it('still signs out without one, or with an unusable one', async () => {
    for (const pushToken of [undefined, '', { $ne: null }, 'has spaces', 'x'.repeat(5000)]) {
      expect((await logout({ refreshToken: 'refresh', pushToken })).status).toBe(200)
      expect(authService.logout).toHaveBeenLastCalledWith('refresh', undefined)
    }
  })

  it('still requires the refresh token', async () => {
    expect((await logout({ pushToken: 'ExponentPushToken[device]' })).status).toBe(400)
    expect(authService.logout).not.toHaveBeenCalled()
  })
})

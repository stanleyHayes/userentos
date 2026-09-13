import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type RequestHandler } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
const calls = vi.hoisted(() => ({ chat: vi.fn() }))
vi.mock('../middleware/auth.js', () => ({ authenticate: ((_req, _res, next) => next()) as RequestHandler, requireRole: () => ((_req, _res, next) => next()) as RequestHandler }))
vi.mock('../middleware/rateLimit.js', () => ({ aiLimiter: ((_req, _res, next) => next()) as RequestHandler, publicLimiter: ((_req, _res, next) => next()) as RequestHandler }))
vi.mock('../services/ai.js', async original => ({ ...await original<typeof import('../services/ai.js')>(), chat: calls.chat }))
import router from '../routes/ai.js'
import { AI_SHARING_VERSION } from '../middleware/aiConsent.js'
let server: Server
let url: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => { vi.clearAllMocks(); calls.chat.mockResolvedValue('Fixture reply') })
function send(path: string, body: unknown) { return fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
it.each(['chat', 'generate', 'listing', 'formalize', 'translate', 'case-summary'])('rejects /%s without explicit current permission before processing input', async path => {
  const response = await send('/' + path, { prompt: 'Private fixture', messages: [{ role: 'user', content: 'Private fixture' }] })
  expect(response.status).toBe(403)
  expect(calls.chat).not.toHaveBeenCalled()
})
it.each([true, 'yes', 'old-version', null])('rejects invalid permission %s', async aiSharingConsent => {
  expect((await send('/chat', { aiSharingConsent, messages: [{ role: 'user', content: 'Question' }] })).status).toBe(403)
  expect(calls.chat).not.toHaveBeenCalled()
})
it('passes only validated chat input after current request permission', async () => {
  const messages = [{ role: 'user', content: 'Question' }]
  const response = await send('/chat', { messages, aiSharingConsent: AI_SHARING_VERSION })
  expect(response.status).toBe(200)
  expect(calls.chat).toHaveBeenCalledExactlyOnceWith(messages, 'en')
})

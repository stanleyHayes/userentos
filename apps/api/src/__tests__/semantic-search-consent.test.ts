import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
const mocks = vi.hoisted(() => ({ embed: vi.fn(), get: vi.fn(), set: vi.fn(), find: vi.fn() }))
vi.mock('../services/embeddings.js', async original => ({ ...await original<typeof import('../services/embeddings.js')>(), embed: mocks.embed }))
vi.mock('../services/cache.js', () => ({ cache: { get: mocks.get, set: mocks.set } }))
vi.mock('../models/Property.js', async original => ({ ...await original<typeof import('../models/Property.js')>(), Property: { find: mocks.find } }))
import router from '../routes/properties.js'
import { AI_SHARING_VERSION } from '../middleware/aiConsent.js'
let server: Server
let url: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/properties', router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/properties/search/semantic`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))
beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined)
  mocks.embed.mockResolvedValue({ embedding: [1, 0] })
  mocks.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
})
function send(body: unknown) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
it('requires current explicit permission even when a cached response exists', async () => {
  mocks.get.mockResolvedValue({ items: [] })
  for (const aiSharingConsent of [undefined, true, 'old-version']) {
    expect((await send({ query: 'private question', aiSharingConsent })).status).toBe(403)
  }
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.embed).not.toHaveBeenCalled()
})
it('rejects blank or oversized searches before provider or cache access', async () => {
  for (const query of ['   ', 'x'.repeat(4001)]) {
    expect((await send({ query, aiSharingConsent: AI_SHARING_VERSION })).status).toBe(400)
  }
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.embed).not.toHaveBeenCalled()
})
it('uses an opaque parameter-specific cache key and sends only search text to the provider', async () => {
  const body = { query: 'Private housing question', city: 'Accra', aiSharingConsent: AI_SHARING_VERSION }
  expect((await send(body)).status).toBe(200)
  expect(mocks.embed).toHaveBeenCalledExactlyOnceWith(body.query)
  const firstKey = mocks.get.mock.calls[0][0]
  expect(firstKey).toMatch(/^semantic-search:[a-f0-9]{64}$/)
  expect(firstKey).not.toContain(body.query)
  expect(mocks.set).toHaveBeenCalledWith(firstKey, expect.objectContaining({ items: [] }), 300)
  await send({ ...body, city: 'Kumasi' })
  expect(mocks.get.mock.calls[1][0]).not.toBe(firstKey)
})

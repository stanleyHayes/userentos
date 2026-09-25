import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import express, { type RequestHandler } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// The public rights check must not hand people unverified phone numbers,
// street addresses or promises of free services (Apple 2.3.1).
vi.mock('../middleware/auth.js', () => ({ authenticate: ((_req, _res, next) => next()) as RequestHandler, requireRole: () => ((_req, _res, next) => next()) as RequestHandler }))
vi.mock('../middleware/rateLimit.js', () => ({ aiLimiter: ((_req, _res, next) => next()) as RequestHandler, publicLimiter: ((_req, _res, next) => next()) as RequestHandler }))
vi.mock('../services/legal/complaintLog.js', () => ({ recordComplaint: vi.fn(), listComplaints: vi.fn(), reviewComplaint: vi.fn(), scoreClassifier: vi.fn() }))
vi.mock('../services/legal/abuseCheck.js', async original => ({ ...await original<typeof import('../services/legal/abuseCheck.js')>(), classifyComplaint: vi.fn(async () => null) }))
import router from '../routes/ai.js'

let server: Server
let url: string
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router)
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

async function check(query: string) {
  const response = await fetch(`${url}/abuse-check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  expect(response.status).toBe(200)
  return (await response.json()).data as { nextSteps: string[]; contacts: Record<string, { name: string; phone?: string; location?: string }> }
}

it.each([
  ['a violation', 'My landlord changed the locks while I was at work and threw my things out'],
  ['no clear violation', 'I want to know about my tenancy'],
])('contacts and next steps carry no phone numbers or free-service promises for %s', async (_label, query) => {
  const result = await check(query)
  expect(Object.values(result.contacts).map(contact => contact.name)).toEqual(['Rent Control Department', 'Commission on Human Rights and Administrative Justice (CHRAJ)'])
  for (const contact of Object.values(result.contacts)) expect(contact.phone).toBeUndefined()
  const text = JSON.stringify(result)
  expect(text).not.toMatch(/\+233|\b0\d{2}\s?\d{3}\s?\d{4}\b/)
  expect(text).not.toMatch(/\bfree\b/i)
  expect(text).not.toContain('General Post Office')
})

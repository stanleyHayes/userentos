import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { TERMS_VERSION, PRIVACY_VERSION, isConsentRequired } from '../types/index.js'

/*
 * Consent capture (Act 843 s.20; App Store / Play terms). Registration and
 * renewed acceptance must carry the exact current Terms/Privacy versions plus
 * an 18+ confirmation, and the server — not the client — records the evidence.
 */

const { authService } = vi.hoisted(() => ({
  authService: {
    register: vi.fn(),
    acceptConsents: vi.fn(),
  },
}))
vi.mock('../container.js', () => ({ authService }))
vi.mock('../models/User.js', async (importActual) => {
  const actual = await importActual<typeof import('../models/User.js')>()
  // authenticate() checks the account is live.
  vi.spyOn(actual.User, 'exists').mockResolvedValue({ _id: 'user-1' } as never)
  return actual
})

const { default: authRouter } = await import('../routes/auth.js')
const { User } = await import('../models/User.js')

const acceptance = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true }
const registration = {
  email: 'akua@example.com',
  phone: '0241234567',
  password: 'Str0ng!Pass',
  firstName: 'Akua',
  lastName: 'Mensah',
  role: 'tenant',
}

function sessionHeaders() {
  const token = jwt.sign({ userId: 'user-1', email: 'akua@example.com', roles: ['tenant'], permissions: [], purpose: 'session', sessionVersion: 0 }, config.jwtSecret)
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('registration and renewed acceptance — HTTP contract', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', false)
    app.use(express.json())
    app.use('/api/auth', authRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    authService.register.mockResolvedValue({ data: { user: { id: 'user-1' } }, status: 201 })
    authService.acceptConsents.mockResolvedValue({ data: { consentRequired: false } })
  })

  const post = (path: string, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'user-agent': 'consent-test/1.0', ...headers }, body: JSON.stringify(body) })

  it('refuses registration without an acceptance', async () => {
    const res = await post('/register', registration)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/accept the Terms of Service and Privacy Policy/)
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('refuses registration that accepted an older Terms or Privacy version', async () => {
    for (const stale of [{ termsVersion: '2000-01-01' }, { privacyVersion: '2000-01-01' }]) {
      const res = await post('/register', { ...registration, acceptance: { ...acceptance, ...stale } })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/has been updated/)
    }
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('refuses registration without the 18+ confirmation', async () => {
    for (const ageConfirmed of [false, 'true', undefined]) {
      const res = await post('/register', { ...registration, acceptance: { ...acceptance, ageConfirmed } })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/18 or older/)
    }
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('passes a server-built consent record (versions, time, IP, user agent) to the service', async () => {
    const res = await post('/register', { ...registration, acceptance })
    expect(res.status).toBe(201)
    const consent = authService.register.mock.calls[0][3]
    expect(consent).toMatchObject({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageConfirmed: true,
      userAgent: 'consent-test/1.0',
    })
    expect(consent.acceptedAt).toBeInstanceOf(Date)
    expect(consent.ip).toBeTruthy()
  })

  it('records renewed acceptance for a signed-in user', async () => {
    const res = await post('/consents', acceptance, sessionHeaders())
    expect(res.status).toBe(200)
    expect(authService.acceptConsents).toHaveBeenCalledWith('user-1', expect.objectContaining({ termsVersion: TERMS_VERSION, ageConfirmed: true }))
  })

  it('refuses renewed acceptance of a stale version or without auth', async () => {
    expect((await post('/consents', { ...acceptance, termsVersion: '2000-01-01' }, sessionHeaders())).status).toBe(400)
    expect((await post('/consents', acceptance)).status).toBe(401)
    expect(authService.acceptConsents).not.toHaveBeenCalled()
  })
})

describe('consentRequired', () => {
  it('is required when missing, incomplete or older than the current versions', () => {
    expect(isConsentRequired(undefined)).toBe(true)
    expect(isConsentRequired({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION })).toBe(true)
    expect(isConsentRequired({ termsVersion: '2000-01-01', privacyVersion: PRIVACY_VERSION, ageConfirmed: true })).toBe(true)
    expect(isConsentRequired({ termsVersion: TERMS_VERSION, privacyVersion: '2000-01-01', ageConfirmed: true })).toBe(true)
    expect(isConsentRequired({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true })).toBe(false)
  })

  it('is exposed on every safe user view (login, register, /users/me)', () => {
    const base = { email: 'a@b.co', phone: '0240000000', firstName: 'A', lastName: 'B', passwordHash: 'h', roles: ['tenant'], activeRole: 'tenant' }
    const legacy = new User(base) as unknown as { toSafe(): Record<string, unknown> }
    expect(legacy.toSafe().consentRequired).toBe(true)

    const current = new User({ ...base, consents: { ...acceptance, acceptedAt: new Date(), ip: '10.0.0.1' } }) as unknown as { toSafe(): Record<string, unknown> }
    expect(current.toSafe().consentRequired).toBe(false)
  })
})

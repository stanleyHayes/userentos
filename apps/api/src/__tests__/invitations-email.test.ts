import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Invitation } from '../models/Invitation.js'
import { User } from '../models/User.js'

// Mock the Resend transport, not our email module — that way the real subject
// line, role wording, and invite URL are exercised.
const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend }
  },
}))

vi.mock('../models/Invitation.js', async () => {
  const nodeCrypto = await import('node:crypto')
  return {
    Invitation: { findOne: vi.fn(), create: vi.fn(), findById: vi.fn(), updateOne: vi.fn() },
    hashInviteToken: (token: string) => nodeCrypto.createHash('sha256').update(token).digest('hex'),
  }
})
vi.mock('../models/User.js', () => ({
  User: { findOne: vi.fn(), findById: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/Wallet.js', () => ({
  Wallet: { create: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../services/notify.js', () => ({
  notifyWelcome: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/achievements.js', () => ({
  checkAndAward: vi.fn().mockResolvedValue(undefined),
}))

// email.ts reads these at module load, so they must be set before the import below.
process.env.RESEND_API_KEY = 'test-key'
process.env.PUBLIC_BASE_URL = 'https://app.rentos.test'

const { default: invitationsRouter } = await import('../routes/invitations.js')

function signToken(roles: string[], permissions: string[] = [], userId = 'inviter-1'): string {
  return jwt.sign(
    { userId, email: 'super@rentos.test', roles, permissions, purpose: 'session' },
    config.jwtSecret,
  )
}

const superAdmin = () => ({ authorization: `Bearer ${signToken(['super_admin'])}`, 'content-type': 'application/json' })

/** User.findById(id).select(...).lean() — used to name the inviter. */
function mockInviterLookup(firstName = 'Stanley', lastName = 'Hayford') {
  vi.mocked(User.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ firstName, lastName }) }),
  } as never)
}

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'invite-1' },
    email: 'official@moh.gov.gh',
    roles: ['government'],
    permissions: ['disputes:manage'],
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000),
    save: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** What Invitation.create() hands back: the input doc plus schema-applied fields. */
function createdInvite(doc: Record<string, unknown>) {
  return { ...doc, _id: { toString: () => 'invite-1' }, status: 'pending', createdAt: new Date() }
}

describe('invitations — email delivery and acceptance', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/invitations', invitationsRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}/api/invitations`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resendSend.mockResolvedValue({ id: 'email-1' })
  })

  it('emails the invite link and names the role in the subject', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.create).mockImplementation((async (doc: Record<string, unknown>) => createdInvite(doc)) as never)
    mockInviterLookup()

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: superAdmin(),
      body: JSON.stringify({ email: 'official@moh.gov.gh', roles: ['government'], permissions: ['disputes:manage'] }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.emailSent).toBe(true)
    expect(body.data.inviteUrl).toMatch(/^https:\/\/app\.rentos\.test\/accept-invite\?token=[a-f0-9]{64}$/)

    expect(resendSend).toHaveBeenCalledTimes(1)
    const mail = resendSend.mock.calls[0][0] as { to: string; subject: string; html: string; text: string }
    expect(mail.to).toBe('official@moh.gov.gh')
    expect(mail.subject).toContain('Government Official')
    expect(mail.html).toContain(body.data.inviteUrl)
    expect(mail.text).toContain(body.data.inviteUrl)
    // The inviter's name is shown to the invitee.
    expect(mail.html).toContain('Stanley Hayford')
  })

  it('stores only the hash of the token that goes out in the email', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.findOne).mockResolvedValue(null as never)
    let stored: { token: string } | null = null
    vi.mocked(Invitation.create).mockImplementation((async (doc: Record<string, unknown>) => { stored = doc as { token: string }; return createdInvite(doc) }) as never)
    mockInviterLookup()

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: superAdmin(),
      body: JSON.stringify({ email: 'official@moh.gov.gh', roles: ['government'] }),
    })

    const body = await res.json()
    const rawToken = new URL(body.data.inviteUrl).searchParams.get('token')!
    expect(stored!.token).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'))
    expect(stored!.token).not.toBe(rawToken)
  })

  it('keeps the invitation and reports emailSent=false when Resend fails', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.create).mockImplementation((async (doc: Record<string, unknown>) => createdInvite(doc)) as never)
    mockInviterLookup()
    resendSend.mockRejectedValue(new Error('provider down'))

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: superAdmin(),
      body: JSON.stringify({ email: 'official@moh.gov.gh', roles: ['government'] }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.emailSent).toBe(false)
    expect(body.data.inviteUrl).toContain('/accept-invite?token=')
    expect(Invitation.create).toHaveBeenCalledTimes(1)
  })

  it('verify returns the invited email and roles without auth', async () => {
    const invite = pendingInvite()
    vi.mocked(Invitation.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(invite) } as never)

    const res = await fetch(`${baseUrl}/verify?token=abc123`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ email: 'official@moh.gov.gh', roles: ['government'] })
    // The stored hash must never travel to the browser.
    expect(JSON.stringify(body.data)).not.toContain('token')
  })

  it('verify rejects an unknown token', async () => {
    vi.mocked(Invitation.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never)
    const res = await fetch(`${baseUrl}/verify?token=nope`)
    expect(res.status).toBe(404)
  })

  it('verify reports an expired invitation as 410 and marks it expired', async () => {
    const invite = pendingInvite({ expiresAt: new Date(Date.now() - 60_000) })
    vi.mocked(Invitation.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(invite) } as never)
    vi.mocked(Invitation.updateOne).mockResolvedValue({} as never)

    const res = await fetch(`${baseUrl}/verify?token=stale`)
    expect(res.status).toBe(410)
    expect(Invitation.updateOne).toHaveBeenCalledWith(
      { _id: invite._id },
      { status: 'expired' },
    )
  })

  it('accept creates the account with the invited roles and permissions', async () => {
    const invite = pendingInvite()
    vi.mocked(Invitation.findOne).mockResolvedValue(invite as never)
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    let created: { roles: string[]; permissions: string[]; isVerified: boolean } | null = null
    vi.mocked(User.create).mockImplementation((async (doc: Record<string, unknown>) => {
      created = doc as unknown as typeof created
      return { ...doc, _id: { toString: () => 'user-1' }, toSafe: () => ({ id: 'user-1' }) }
    }) as never)

    const res = await fetch(`${baseUrl}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'raw-token',
        firstName: 'Akosua',
        lastName: 'Mensah',
        phone: '0301234567',
        password: 'Str0ng!Pass',
      }),
    })

    expect(res.status).toBe(201)
    expect(created!.roles).toEqual(['government'])
    expect(created!.permissions).toEqual(['disputes:manage'])
    expect(created!.isVerified).toBe(true)
    expect(invite.status).toBe('accepted')
  })

  it('accept refuses a weak password before touching the invitation', async () => {
    const res = await fetch(`${baseUrl}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'raw-token',
        firstName: 'Akosua',
        lastName: 'Mensah',
        phone: '0301234567',
        password: 'password',
      }),
    })

    expect(res.status).toBe(400)
    expect(Invitation.findOne).not.toHaveBeenCalled()
  })

  it('does not send mail when the invitee already has an account', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'existing' } as never)

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: superAdmin(),
      body: JSON.stringify({ email: 'official@moh.gov.gh', roles: ['government'] }),
    })

    expect(res.status).toBe(409)
    expect(resendSend).not.toHaveBeenCalled()
  })
})

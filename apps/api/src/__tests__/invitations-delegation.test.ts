import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'

/*
 * Privilege-escalation regressions for POST /api/invitations.
 *
 * The route used to read roles/permissions straight off req.body and only
 * checked `roles.includes('super_admin')`. Mongoose casts `{ _id: 'x' }` to the
 * string 'x' for a [String] path, so `roles: [{ _id: 'super_admin' }]` slipped
 * past the includes() check and was stored as a real super_admin invitation.
 * Admins could also hand out roles they do not hold (government,
 * legal_officer). Both must now be refused before anything is written.
 */

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({ id: 'email-1' }) }
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
  User: { exists: vi.fn().mockResolvedValue({ _id: 'active-user' }), findOne: vi.fn(), findById: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/Wallet.js', () => ({ Wallet: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('../services/notify.js', () => ({ notifyWelcome: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))

process.env.RESEND_API_KEY = 'test-key'
process.env.PUBLIC_BASE_URL = 'https://app.rentos.test'

const { Invitation } = await import('../models/Invitation.js')
const { User } = await import('../models/User.js')
const { default: invitationsRouter } = await import('../routes/invitations.js')

const ADMIN_PERMISSIONS = ['users:view', 'users:create', 'users:invite', 'disputes:manage']

function headers(roles: string[], permissions: string[] = []) {
  const token = jwt.sign({ userId: 'inviter-1', email: 'inviter@rentos.test', roles, permissions, purpose: 'session' }, config.jwtSecret)
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

const admin = () => headers(['admin'], ADMIN_PERMISSIONS)

function createdInvite(doc: Record<string, unknown>) {
  return { ...doc, _id: { toString: () => 'invite-1' }, status: 'pending', createdAt: new Date() }
}

describe('invitations — delegation guard', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/invitations', invitationsRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/invitations`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(User.findOne).mockResolvedValue(null as never)
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ firstName: 'Ada', lastName: 'Admin' }) }),
    } as never)
    vi.mocked(Invitation.findOne).mockResolvedValue(null as never)
    vi.mocked(Invitation.create).mockImplementation((async (doc: Record<string, unknown>) => createdInvite(doc)) as never)
  })

  async function invite(body: unknown, h = admin()) {
    return fetch(baseUrl, { method: 'POST', headers: h, body: JSON.stringify(body) })
  }

  it('refuses the object-cast super_admin exploit ({"_id":"super_admin"})', async () => {
    const res = await invite({ email: 'mallory@example.com', roles: [{ _id: 'super_admin' }] })
    expect(res.status).toBe(400)
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses object-cast permissions too', async () => {
    const res = await invite({ email: 'mallory@example.com', roles: ['admin'], permissions: [{ _id: 'system:settings' }] })
    expect(res.status).toBe(400)
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses roles that do not exist', async () => {
    const res = await invite({ email: 'mallory@example.com', roles: ['root'] }, headers(['super_admin']))
    expect(res.status).toBe(400)
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses permissions that do not exist', async () => {
    const res = await invite({ email: 'mallory@example.com', roles: ['government'], permissions: ['everything:all'] }, headers(['super_admin']))
    expect(res.status).toBe(400)
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses a plain string super_admin or admin from a non-super-admin', async () => {
    for (const role of ['super_admin', 'admin']) {
      const res = await invite({ email: 'mallory@example.com', roles: [role] })
      expect(res.status).toBe(403)
    }
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses roles the inviter does not hold (admin granting government / legal_officer)', async () => {
    for (const role of ['government', 'legal_officer']) {
      const res = await invite({ email: 'official@example.com', roles: [role] })
      expect(res.status).toBe(403)
      expect((await res.json()).error).toContain(role)
    }
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('refuses permissions the inviter does not hold', async () => {
    const res = await invite(
      { email: 'official@example.com', roles: ['government'], permissions: ['system:settings'] },
      headers(['government'], ['users:invite']),
    )
    expect(res.status).toBe(403)
    expect(Invitation.create).not.toHaveBeenCalled()
  })

  it('allows a non-super-admin to delegate a role and permissions they hold', async () => {
    const res = await invite(
      { email: 'Colleague@Example.com', roles: ['government'], permissions: ['disputes:manage'] },
      headers(['government'], ['users:invite', 'disputes:manage']),
    )
    expect(res.status).toBe(201)
    expect(Invitation.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'colleague@example.com',
      roles: ['government'],
      permissions: ['disputes:manage'],
    }))
  })

  it('lets a super admin invite any real role', async () => {
    const res = await invite({ email: 'official@example.com', roles: ['government', 'legal_officer'], permissions: ['legal:edit'] }, headers(['super_admin']))
    expect(res.status).toBe(201)
    const doc = vi.mocked(Invitation.create).mock.calls[0][0] as unknown as { roles: string[] }
    expect(doc.roles).toEqual(['government', 'legal_officer'])
  })

  it('refuses a malformed email before any lookup', async () => {
    const res = await invite({ email: { $ne: null }, roles: ['government'] }, headers(['super_admin']))
    expect(res.status).toBe(400)
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it('resend refuses an invitation carrying roles the caller does not hold', async () => {
    vi.mocked(Invitation.findById).mockResolvedValue({
      _id: { toString: () => 'invite-2' },
      email: 'official@example.com',
      roles: ['legal_officer'],
      permissions: [],
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      save: vi.fn(),
    } as never)
    const res = await fetch(`${baseUrl}/invite-2/resend`, { method: 'POST', headers: admin() })
    expect(res.status).toBe(403)
  })
})

describe('role enum constraints on the schemas', () => {
  it('Invitation and User reject a role outside the known set', async () => {
    const { Invitation: RealInvitation } = await vi.importActual<typeof import('../models/Invitation.js')>('../models/Invitation.js')
    const { User: RealUser } = await vi.importActual<typeof import('../models/User.js')>('../models/User.js')

    const inv = new RealInvitation({ email: 'a@b.co', roles: ['root'], invitedBy: 'x', token: 't', expiresAt: new Date() })
    expect(inv.validateSync()?.errors['roles.0']).toBeDefined()

    const invPerm = new RealInvitation({ email: 'a@b.co', roles: ['tenant'], permissions: ['everything:all'], invitedBy: 'x', token: 't', expiresAt: new Date() })
    expect(invPerm.validateSync()?.errors['permissions.0']).toBeDefined()

    const user = new RealUser({ email: 'a@b.co', phone: '0240000000', firstName: 'A', lastName: 'B', passwordHash: 'h', roles: ['root'], activeRole: 'root' })
    const errs = user.validateSync()?.errors ?? {}
    expect(errs['roles.0']).toBeDefined()
    expect(errs.activeRole).toBeDefined()

    const ok = new RealUser({ email: 'a@b.co', phone: '0240000000', firstName: 'A', lastName: 'B', passwordHash: 'h', roles: ['tenant'], activeRole: 'tenant' })
    expect(ok.validateSync()).toBeUndefined()
  })
})

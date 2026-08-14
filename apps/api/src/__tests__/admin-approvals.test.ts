import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'
import { User } from '../models/User.js'
import { recordAudit } from '../utils/audit.js'
import { notify } from '../services/notify.js'

vi.mock('../models/Worker.js', () => ({
  Worker: { find: vi.fn(), countDocuments: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/Business.js', () => ({
  Business: { find: vi.fn(), countDocuments: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/FinancierProfile.js', () => ({
  FinancierProfile: { find: vi.fn(), countDocuments: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/InsuranceProviderProfile.js', () => ({
  InsuranceProviderProfile: { find: vi.fn(), countDocuments: vi.fn(), findById: vi.fn() },
}))
vi.mock('../models/User.js', () => ({
  User: { find: vi.fn() },
}))
vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))

// Imported AFTER mocks are registered (vitest hoists vi.mock anyway).
const { default: adminApprovalsRouter } = await import('../routes/adminApprovals.js')

function signToken(roles: string[], userId = 'admin-1'): string {
  return jwt.sign(
    { userId, email: 'admin@example.com', roles, permissions: [], purpose: 'session' },
    config.jwtSecret,
  )
}

/** Chainable query mock: find().sort().skip().limit().lean() */
function mockFindChain(model: { find: ReturnType<typeof vi.fn> }, docs: unknown[]) {
  const lean = vi.fn().mockResolvedValue(docs)
  const limit = vi.fn().mockReturnValue({ lean })
  const skip = vi.fn().mockReturnValue({ limit })
  const sort = vi.fn().mockReturnValue({ skip })
  model.find.mockReturnValue({ sort } as never)
}

function mockWorkerDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: { toString: () => 'worker-doc-1' },
    userId: 'worker-user-1',
    name: 'Kwame Mensah',
    approvalStatus: 'pending',
    verificationLevel: 'none',
    rejectionReason: undefined as string | undefined,
    save: vi.fn(async () => undefined),
    ...overrides,
  }
  return {
    ...doc,
    toObject() {
      const { save: _save, toObject: _to, ...rest } = this as Record<string, unknown>
      return rest
    },
  }
}

describe('admin approvals API', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/admin/approvals', adminApprovalsRouter)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}/api/admin/approvals`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}?type=worker`)
    expect(res.status).toBe(401)
  })

  it('rejects non-admin callers with 403', async () => {
    const res = await fetch(`${baseUrl}?type=worker`, {
      headers: { authorization: `Bearer ${signToken(['tenant'])}` },
    })
    expect(res.status).toBe(403)
  })

  it('lists pending workers with joined user info, paginated', async () => {
    const workerDoc = { _id: { toString: () => 'worker-doc-1' }, userId: 'worker-user-1', name: 'Kwame', approvalStatus: 'pending' }
    mockFindChain(Worker as never, [workerDoc])
    vi.mocked(Worker.countDocuments).mockResolvedValue(1)
    const selectLean = vi.fn().mockResolvedValue([
      { _id: { toString: () => 'worker-user-1' }, firstName: 'Kwame', lastName: 'Mensah', email: 'kwame@example.com', phone: '0240000000' },
    ])
    vi.mocked(User.find).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: selectLean }) } as never)

    const res = await fetch(`${baseUrl}?type=worker&status=pending&page=1&limit=20`, {
      headers: { authorization: `Bearer ${signToken(['admin'])}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(20)
    expect(body.data.items[0].id).toBe('worker-doc-1')
    expect(body.data.items[0].user).toMatchObject({ firstName: 'Kwame', email: 'kwame@example.com' })
  })

  it('approve sets approvalStatus, verificationLevel basic, audits and notifies', async () => {
    const doc = mockWorkerDoc()
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/worker/worker-doc-1/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    expect(doc.approvalStatus).toBe('approved')
    expect(doc.verificationLevel).toBe('basic')
    expect(doc.save).toHaveBeenCalledOnce()
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      expect.anything(),
      'admin.worker.approve',
      'Worker',
      'worker-doc-1',
    )
    expect(vi.mocked(notify)).toHaveBeenCalledWith(expect.objectContaining({ userId: 'worker-user-1' }))
  })

  it('approve on a worker with a higher verificationLevel does not downgrade it', async () => {
    const doc = mockWorkerDoc({ verificationLevel: 'verified' })
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/worker/worker-doc-1/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)

    expect(doc.approvalStatus).toBe('approved')
    expect(doc.verificationLevel).toBe('verified') // never downgrade to 'basic'
  })

  it('approve on a business sets isVerified', async () => {
    const doc = {
      _id: { toString: () => 'biz-doc-1' },
      ownerId: 'biz-user-1',
      approvalStatus: 'pending',
      isVerified: false,
      save: vi.fn(async () => undefined),
      toObject() {
        return { _id: this._id, ownerId: this.ownerId, approvalStatus: this.approvalStatus, isVerified: this.isVerified }
      },
    }
    vi.mocked(Business.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/business/biz-doc-1/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(doc.approvalStatus).toBe('approved')
    expect(doc.isVerified).toBe(true)
  })

  it('reject requires a reason (zod validation)', async () => {
    const res = await fetch(`${baseUrl}/worker/worker-doc-1/reject`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(400)
    expect(vi.mocked(Worker.findById)).not.toHaveBeenCalled()
  })

  it('reject stores the reason, audits and notifies with it', async () => {
    const doc = mockWorkerDoc()
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/worker/worker-doc-1/reject`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['super_admin'])}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Documents illegible' }),
    })
    expect(res.status).toBe(200)

    expect(doc.approvalStatus).toBe('rejected')
    expect(doc.rejectionReason).toBe('Documents illegible')
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      expect.anything(),
      'admin.worker.reject',
      'Worker',
      'worker-doc-1',
      { reason: 'Documents illegible' },
    )
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'worker-user-1', message: expect.stringContaining('Documents illegible') }),
    )
  })

  it('approve 404s for an unknown profile and 409s when already approved', async () => {
    vi.mocked(Worker.findById).mockResolvedValue(null)
    const notFound = await fetch(`${baseUrl}/worker/nope/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(notFound.status).toBe(404)

    vi.mocked(Worker.findById).mockResolvedValue(mockWorkerDoc({ approvalStatus: 'approved' }) as never)
    const conflict = await fetch(`${baseUrl}/worker/worker-doc-1/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['admin'])}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(conflict.status).toBe(409)
  })
})

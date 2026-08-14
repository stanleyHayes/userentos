import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'

vi.mock('../models/Worker.js', () => ({
  Worker: { findById: vi.fn(), findOne: vi.fn() },
}))
vi.mock('../models/Business.js', () => ({
  Business: { findOne: vi.fn() },
  BUSINESS_CATEGORIES: ['furniture', 'appliances', 'internet', 'moving', 'cleaning', 'other'],
}))
vi.mock('../models/ServiceBooking.js', () => ({
  ServiceBooking: { find: vi.fn() },
}))
vi.mock('../services/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  notifyPaymentConfirmed: vi.fn(),
  notifyPaymentReceived: vi.fn(),
}))

// Imported AFTER mocks are registered (vitest hoists vi.mock anyway).
const { default: workersRouter } = await import('../routes/workers.js')
const { default: businessesRouter } = await import('../routes/businesses.js')

function signToken(roles: string[], userId: string): string {
  return jwt.sign(
    { userId, email: 'user@example.com', roles, permissions: [], purpose: 'session' },
    config.jwtSecret,
  )
}

function mockWorkerDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'worker-doc-1',
    userId: 'worker-user-1',
    name: 'Kwame Mensah',
    approvalStatus: 'approved',
    approvedBy: 'admin-1',
    approvedAt: new Date('2026-01-01'),
    save: vi.fn(async () => undefined),
    ...overrides,
  }
}

function mockBusinessDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: { toString: () => 'biz-doc-1' },
    ownerId: 'biz-user-1',
    name: 'Adom Furnishings',
    approvalStatus: 'approved',
    approvedBy: 'admin-1',
    approvedAt: new Date('2026-01-01'),
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

describe('entity profile re-queue on edit', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/workers', workersRouter)
    app.use('/api/businesses', businessesRouter)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('owner editing an approved worker profile re-queues it as pending', async () => {
    const doc = mockWorkerDoc()
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/api/workers/worker-doc-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${signToken(['service_provider'], 'worker-user-1')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Updated bio' }),
    })
    expect(res.status).toBe(200)

    expect(doc.approvalStatus).toBe('pending')
    expect(doc.approvedBy).toBeUndefined()
    expect(doc.approvedAt).toBeUndefined()
    expect(doc.save).toHaveBeenCalledOnce()
  })

  it('admin editing an approved worker profile does NOT re-queue it', async () => {
    const doc = mockWorkerDoc()
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/api/workers/worker-doc-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${signToken(['admin'], 'admin-1')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Admin correction' }),
    })
    expect(res.status).toBe(200)

    expect(doc.approvalStatus).toBe('approved')
    expect(doc.approvedBy).toBe('admin-1')
  })

  it('owner editing a pending worker profile leaves it pending', async () => {
    const doc = mockWorkerDoc({ approvalStatus: 'pending', approvedBy: undefined, approvedAt: undefined })
    vi.mocked(Worker.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/api/workers/worker-doc-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${signToken(['service_provider'], 'worker-user-1')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Still pending' }),
    })
    expect(res.status).toBe(200)
    expect(doc.approvalStatus).toBe('pending')
  })

  it('owner updating an approved business profile re-queues it as pending', async () => {
    const doc = mockBusinessDoc()
    vi.mocked(Business.findOne).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/api/businesses/me`, {
      method: 'POST',
      headers: { authorization: `Bearer ${signToken(['business'], 'biz-user-1')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Adom Furnishings', category: 'furniture', phone: '0244331000', city: 'Accra' }),
    })
    expect(res.status).toBe(200)

    expect(doc.approvalStatus).toBe('pending')
    expect(doc.approvedBy).toBeUndefined()
    expect(doc.approvedAt).toBeUndefined()
    expect(doc.save).toHaveBeenCalledOnce()
  })
})

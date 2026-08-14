import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireApprovedEntity } from '../middleware/entityApproval.js'
import { Worker } from '../models/Worker.js'

vi.mock('../models/Worker.js', () => ({
  Worker: { findOne: vi.fn() },
}))
vi.mock('../models/Business.js', () => ({
  Business: { findOne: vi.fn() },
}))
vi.mock('../models/FinancierProfile.js', () => ({
  FinancierProfile: { findOne: vi.fn() },
}))
vi.mock('../models/InsuranceProviderProfile.js', () => ({
  InsuranceProviderProfile: { findOne: vi.fn() },
}))

interface MockResponse {
  statusCode: number
  body: unknown
  status: (code: number) => MockResponse
  json: (body: unknown) => MockResponse
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  return res
}

function makeReq(roles: string[], userId = 'u1'): Request {
  return {
    user: { userId, email: 't@example.com', roles, permissions: [] },
  } as unknown as Request
}

function mockProfile(profile: { approvalStatus: string; rejectionReason?: string } | null) {
  const lean = vi.fn().mockResolvedValue(profile)
  const select = vi.fn().mockReturnValue({ lean })
  vi.mocked(Worker.findOne).mockReturnValue({ select } as never)
}

describe('requireApprovedEntity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')({} as Request, res as unknown as Response, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('403s a pending profile with a pending-approval message', async () => {
    mockProfile({ approvalStatus: 'pending' })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')(makeReq(['service_provider']), res as unknown as Response, next)
    expect(res.statusCode).toBe(403)
    expect((res.body as { error: string }).error).toMatch(/pending admin approval/)
    expect(next).not.toHaveBeenCalled()
  })

  it('403s a rejected profile and includes the reason', async () => {
    mockProfile({ approvalStatus: 'rejected', rejectionReason: 'No trade license' })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')(makeReq(['service_provider']), res as unknown as Response, next)
    expect(res.statusCode).toBe(403)
    expect((res.body as { error: string }).error).toMatch(/No trade license/)
    expect(next).not.toHaveBeenCalled()
  })

  it('404s when the caller has no profile at all', async () => {
    mockProfile(null)
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')(makeReq(['service_provider']), res as unknown as Response, next)
    expect(res.statusCode).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })

  it('passes an approved profile through', async () => {
    mockProfile({ approvalStatus: 'approved' })
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')(makeReq(['service_provider']), res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('bypasses the check for admin', async () => {
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('worker')(makeReq(['admin']), res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(vi.mocked(Worker.findOne)).not.toHaveBeenCalled()
  })

  it('bypasses the check for super_admin', async () => {
    const res = makeRes()
    const next = vi.fn() as unknown as NextFunction
    await requireApprovedEntity('financier')(makeReq(['super_admin']), res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

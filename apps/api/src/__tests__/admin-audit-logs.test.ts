import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { AuditLog } from '../models/AuditLog.js'
import { User } from '../models/User.js'

// No database anywhere in this suite: the models are stubbed, so what is under
// test is the filter we build and the shape we hand back.
vi.mock('../models/AuditLog.js', () => ({
  AuditLog: { find: vi.fn(), countDocuments: vi.fn(), distinct: vi.fn() },
}))
vi.mock('../models/User.js', () => ({ User: { find: vi.fn() } }))

const { default: auditRouter, buildAuditLogFilter, AUDIT_LOG_DEFAULT_LIMIT, AUDIT_LOG_MAX_LIMIT } =
  await import('../routes/adminAuditLogs.js')

describe('buildAuditLogFilter — equality filters', () => {
  it('constrains nothing when no filter is supplied', () => {
    const plan = buildAuditLogFilter({})
    expect(plan.filter).toEqual({})
    expect(plan).toMatchObject({ page: 1, limit: AUDIT_LOG_DEFAULT_LIMIT, skip: 0 })
  })

  it('matches on userId, action and entityType exactly', () => {
    expect(buildAuditLogFilter({
      userId: '65f0c0ffee00000000000001',
      action: 'payout.approved',
      entityType: 'Payout',
    }).filter).toEqual({
      userId: '65f0c0ffee00000000000001',
      action: 'payout.approved',
      entityType: 'Payout',
    })
  })

  it('treats a blank param as absent rather than matching the empty string', () => {
    expect(buildAuditLogFilter({ action: '', entityType: '   ' }).filter).toEqual({})
  })

  it('takes the first value when a param is repeated in the query string', () => {
    // Express 5 hands back an array for ?action=a&action=b; a raw array in the
    // filter would turn an equality match into an implicit $in.
    expect(buildAuditLogFilter({ action: ['storefront.created', 'storefront.updated'] }).filter)
      .toEqual({ action: 'storefront.created' })
  })

  it('ignores a value that is not a string at all', () => {
    expect(buildAuditLogFilter({ entityType: { $ne: null } }).filter).toEqual({})
  })
})

describe('buildAuditLogFilter — date range', () => {
  it('anchors a date-only lower bound at the first instant of that day', () => {
    const { createdAt } = buildAuditLogFilter({ from: '2026-03-01' }).filter
    expect(createdAt?.$gte).toEqual(new Date('2026-03-01T00:00:00.000Z'))
    expect(createdAt?.$lte).toBeUndefined()
  })

  it('stretches a date-only upper bound to the last instant of that day', () => {
    // Taken verbatim, '2026-03-31' is midnight and would drop every entry made
    // on the last day of the range — the range would silently lose a day.
    const { createdAt } = buildAuditLogFilter({ to: '2026-03-31' }).filter
    expect(createdAt?.$lte).toEqual(new Date('2026-03-31T23:59:59.999Z'))
    expect(createdAt?.$gte).toBeUndefined()
  })

  it('includes the bound itself and excludes the instant after it', () => {
    const { createdAt } = buildAuditLogFilter({ from: '2026-03-01', to: '2026-03-31' }).filter
    const lower = createdAt!.$gte!.getTime()
    const upper = createdAt!.$lte!.getTime()
    expect(Date.parse('2026-03-01T00:00:00.000Z')).toBeGreaterThanOrEqual(lower)
    expect(Date.parse('2026-02-28T23:59:59.999Z')).toBeLessThan(lower)
    expect(Date.parse('2026-03-31T23:59:59.999Z')).toBeLessThanOrEqual(upper)
    expect(Date.parse('2026-04-01T00:00:00.000Z')).toBeGreaterThan(upper)
  })

  it('uses a full timestamp exactly as given', () => {
    const { createdAt } = buildAuditLogFilter({ to: '2026-03-31T09:15:00.000Z' }).filter
    expect(createdAt?.$lte).toEqual(new Date('2026-03-31T09:15:00.000Z'))
  })

  it('drops an unparseable date instead of throwing', () => {
    // A hand-edited or bookmarked URL should still render the log.
    expect(() => buildAuditLogFilter({ from: 'not-a-date' })).not.toThrow()
    expect(buildAuditLogFilter({ from: 'not-a-date' }).filter).toEqual({})
    expect(buildAuditLogFilter({ to: '2026-13-45' }).filter).toEqual({})
  })

  it('keeps the valid half of a half-broken range', () => {
    const { createdAt } = buildAuditLogFilter({ from: 'yesterday', to: '2026-03-31' }).filter
    expect(createdAt).toEqual({ $lte: new Date('2026-03-31T23:59:59.999Z') })
  })
})

describe('buildAuditLogFilter — pagination', () => {
  it('caps an oversized limit at the maximum page size', () => {
    expect(buildAuditLogFilter({ limit: '5000' }).limit).toBe(AUDIT_LOG_MAX_LIMIT)
  })

  it('falls back to the default for a limit that is not a number', () => {
    expect(buildAuditLogFilter({ limit: 'all' }).limit).toBe(AUDIT_LOG_DEFAULT_LIMIT)
  })

  it('floors a zero or negative limit at one row', () => {
    expect(buildAuditLogFilter({ limit: '0' }).limit).toBe(1)
    expect(buildAuditLogFilter({ limit: '-10' }).limit).toBe(1)
  })

  it('honours a limit inside the allowed range', () => {
    expect(buildAuditLogFilter({ limit: '10' }).limit).toBe(10)
  })

  it('derives skip from the requested page', () => {
    expect(buildAuditLogFilter({ page: '3', limit: '10' })).toMatchObject({ page: 3, limit: 10, skip: 20 })
  })

  it('clamps a page below one so skip can never go negative', () => {
    expect(buildAuditLogFilter({ page: '-3' })).toMatchObject({ page: 1, skip: 0 })
  })
})

describe('GET /api/admin/audit-logs', () => {
  let server: Server
  let baseUrl: string

  const rows = [
    {
      _id: { toString: () => 'log-2' },
      userId: '65f0c0ffee00000000000001',
      action: 'storefront.suspended',
      entityType: 'Storefront',
      entityId: 'sf-1',
      details: '{"reason":"fraud"}',
      ipAddress: '10.0.0.4',
      createdAt: new Date('2026-03-31T10:00:00.000Z'),
    },
    {
      // recordAudit falls back to 'system' when nothing authenticated the write.
      _id: { toString: () => 'log-1' },
      userId: 'system',
      action: 'payment.completed',
      entityType: 'Payment',
      entityId: 'pay-1',
      createdAt: new Date('2026-03-30T10:00:00.000Z'),
    },
  ]

  beforeAll(async () => {
    const app = express()
    app.use('/api/admin/audit-logs', auditRouter)
    await new Promise<void>((r) => { server = app.listen(0, () => r()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/audit-logs`
  })
  afterAll(async () => { await new Promise((r) => server.close(r)) })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuditLog.find).mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: () => rows }) }) }),
    } as never)
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(2 as never)
    vi.mocked(AuditLog.distinct).mockImplementation(((field: string) =>
      field === 'action' ? ['storefront.suspended', 'payment.completed'] : ['Storefront', 'Payment']) as never)
    vi.mocked(User.find).mockReturnValue({
      select: () => ({ lean: () => [{ _id: { toString: () => '65f0c0ffee00000000000001' }, firstName: 'Yaa', lastName: 'Mensah', email: 'yaa@rentos.test' }] }),
    } as never)
  })

  function token(roles: string[]) {
    return jwt.sign({ userId: 'admin-1', email: 'a@rentos.test', roles, permissions: [], purpose: 'session' }, config.jwtSecret)
  }

  it('rejects an unauthenticated caller', async () => {
    expect((await fetch(baseUrl)).status).toBe(401)
  })

  it('rejects a signed-in tenant', async () => {
    const res = await fetch(baseUrl, { headers: { authorization: `Bearer ${token(['tenant'])}` } })
    expect(res.status).toBe(403)
  })

  it('serves admins the page, the vocabulary and the acting user', async () => {
    const res = await fetch(`${baseUrl}?entityType=Storefront&limit=10&page=2`, {
      headers: { authorization: `Bearer ${token(['admin'])}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.data.total).toBe(2)
    expect(body.data).toMatchObject({ page: 2, limit: 10, totalPages: 1 })
    expect(body.data.actions).toEqual(['payment.completed', 'storefront.suspended'])
    expect(body.data.entityTypes).toEqual(['Payment', 'Storefront'])
    expect(body.data.items[0]).toMatchObject({
      id: 'log-2',
      action: 'storefront.suspended',
      user: { name: 'Yaa Mensah', email: 'yaa@rentos.test' },
    })
    // 'system' resolves to no user rather than a broken join.
    expect(body.data.items[1].user).toBeNull()
    expect(body.data.items[1].ipAddress).toBeNull()

    expect(vi.mocked(AuditLog.find).mock.calls[0][0]).toEqual({ entityType: 'Storefront' })
  })

  it('looks the actors up once for the whole page, never per row', async () => {
    await fetch(baseUrl, { headers: { authorization: `Bearer ${token(['super_admin'])}` } })
    expect(vi.mocked(User.find)).toHaveBeenCalledTimes(1)
    // 'system' is not an ObjectId — passing it to $in would throw a CastError.
    expect(vi.mocked(User.find).mock.calls[0][0]).toEqual({ _id: { $in: ['65f0c0ffee00000000000001'] } })
  })
})

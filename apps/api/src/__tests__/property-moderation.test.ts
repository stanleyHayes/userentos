import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { PropertyReview } from '../models/PropertyReview.js'
import { canReview, canTransition } from '../services/propertyReview.js'

vi.mock('../models/Property.js', () => ({
  Property: { find: vi.fn(), findById: vi.fn(), countDocuments: vi.fn() },
}))
vi.mock('../models/PropertyReview.js', () => ({
  PropertyReview: { create: vi.fn().mockResolvedValue({}), find: vi.fn() },
}))
vi.mock('../models/User.js', () => ({ User: { find: vi.fn(), findById: vi.fn() } }))
vi.mock('../services/notify.js', () => ({
  notifyPropertyApproved: vi.fn(), notifyPropertyRejected: vi.fn(), notifyPropertyChangesRequested: vi.fn(), notify: vi.fn(),
}))
vi.mock('../services/achievements.js', () => ({ checkAndAward: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/audit.js', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }))

const { default: moderationRouter } = await import('../routes/propertyModeration.js')

function token(roles: string[], permissions: string[] = [], userId = 'reviewer-1') {
  return jwt.sign({ userId, email: 'r@rentos.test', roles, permissions, purpose: 'session' }, config.jwtSecret)
}
const auth = (roles: string[], perms: string[] = [], userId = 'reviewer-1') =>
  ({ authorization: `Bearer ${token(roles, perms, userId)}`, 'content-type': 'application/json' })

function propertyDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'prop-1' },
    title: 'East Legon 2-bed',
    landlordId: 'owner-1',
    listingStatus: 'pending_review',
    reviewVersion: 1,
    save: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('property moderation', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api/properties', moderationRouter)
    await new Promise<void>((r) => { server = app.listen(0, () => r()) })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/properties`
  })
  afterAll(async () => { await new Promise((r) => server.close(r)) })
  beforeEach(() => vi.clearAllMocks())

  // ── The reported defect (spec §5, §18) ──

  it('lets a super admin approve a submitted property', async () => {
    const doc = propertyDoc()
    vi.mocked(Property.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'approve', note: 'Looks good' }),
    })

    expect(res.status).toBe(200)
    expect(doc.listingStatus).toBe('approved')
    expect(PropertyReview.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'approve', reviewerId: 'reviewer-1', toStatus: 'approved',
    }))
  })

  it('lets a super admin request changes, with the issues the owner must fix', async () => {
    const doc = propertyDoc()
    vi.mocked(Property.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'request_changes', note: 'Fix these', issues: ['Photos are blurry', 'Rent missing'] }),
    })

    expect(res.status).toBe(200)
    expect(doc.listingStatus).toBe('changes_requested')
    expect(PropertyReview.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'request_changes', issues: ['Photos are blurry', 'Rent missing'],
    }))
  })

  it('rejects with a reason code and explanation', async () => {
    const doc = propertyDoc()
    vi.mocked(Property.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'reject', reasonCode: 'not_compliant', note: 'Exceeds the rent advance cap.' }),
    })

    expect(res.status).toBe(200)
    expect(doc.listingStatus).toBe('rejected')
  })

  it('refuses a reject with no reason code', async () => {
    vi.mocked(Property.findById).mockResolvedValue(propertyDoc() as never)
    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'reject', note: 'no' }),
    })
    expect(res.status).toBe(400)
  })

  it('refuses request_changes with no actionable issues', async () => {
    vi.mocked(Property.findById).mockResolvedValue(propertyDoc() as never)
    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'request_changes', issues: [] }),
    })
    expect(res.status).toBe(400)
  })

  // ── Queue must never filter the super admin out (spec §5.1) ──

  it('does not scope the queue by reviewer, owner or organization', async () => {
    const lean = vi.fn().mockResolvedValue([])
    vi.mocked(Property.find).mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean }) }) }) } as never)
    vi.mocked(Property.countDocuments).mockResolvedValue(0 as never)

    const res = await fetch(`${baseUrl}/review-queue`, { headers: auth(['super_admin']) })
    expect(res.status).toBe(200)

    const filter = vi.mocked(Property.find).mock.calls[0][0] as unknown as Record<string, unknown>
    for (const leaky of ['reviewerId', 'reviewedBy', 'agencyId', 'organizationId', 'landlordId', 'ownerId']) {
      expect(filter).not.toHaveProperty(leaky)
    }
  })

  // ── Authority model (spec §5.4) ──

  it('denies a tenant, and allows a granted external authority reviewer', async () => {
    vi.mocked(Property.findById).mockResolvedValue(propertyDoc() as never)

    const denied = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['tenant']),
      body: JSON.stringify({ action: 'approve' }),
    })
    expect(denied.status).toBe(403)

    vi.mocked(Property.findById).mockResolvedValue(propertyDoc() as never)
    const allowed = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['government'], ['property.review.approve']),
      body: JSON.stringify({ action: 'approve' }),
    })
    expect(allowed.status).toBe(200)
  })

  it('reserves override actions for the super admin', () => {
    expect(canReview({ roles: ['super_admin'], permissions: [] }, 'property.review.override')).toBe(true)
    expect(canReview({ roles: ['admin'], permissions: [] }, 'property.review.override')).toBe(false)
    expect(canReview({ roles: ['government'], permissions: ['property.review.override'] }, 'property.review.override')).toBe(false)
  })

  // ── Resubmission preserves history (spec §18) ──

  it('starts a new review cycle on resubmit without erasing the last one', async () => {
    const doc = propertyDoc({ listingStatus: 'changes_requested', reviewVersion: 1, landlordId: 'owner-1' })
    vi.mocked(Property.findById).mockResolvedValue(doc as never)

    const res = await fetch(`${baseUrl}/prop-1/submit`, {
      method: 'POST', headers: auth(['landlord'], [], 'owner-1'), body: '{}',
    })

    expect(res.status).toBe(200)
    expect(doc.listingStatus).toBe('pending_review')
    expect(doc.reviewVersion).toBe(2)
    expect(PropertyReview.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit', reviewVersion: 2 }))
  })

  it('only lets the owner submit their own property', async () => {
    vi.mocked(Property.findById).mockResolvedValue(propertyDoc({ listingStatus: 'draft' }) as never)
    const res = await fetch(`${baseUrl}/prop-1/submit`, {
      method: 'POST', headers: auth(['landlord'], [], 'someone-else'), body: '{}',
    })
    expect(res.status).toBe(403)
  })

  // ── State machine (spec §5.2) ──

  it('enforces the documented transitions', () => {
    expect(canTransition('draft', 'pending_review')).toBe(true)
    expect(canTransition('pending_review', 'approved')).toBe(true)
    expect(canTransition('changes_requested', 'pending_review')).toBe(true)
    expect(canTransition('approved', 'published')).toBe(true)
    expect(canTransition('published', 'suspended')).toBe(true)
    // Illegal jumps
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('archived', 'published')).toBe(false)
    expect(canTransition('rejected', 'approved')).toBe(false)
  })

  it('refuses a moderation action on a property that is not reviewable', async () => {
    vi.mocked(Property.findById).mockResolvedValue(propertyDoc({ listingStatus: 'draft' }) as never)
    const res = await fetch(`${baseUrl}/prop-1/review`, {
      method: 'POST', headers: auth(['super_admin']),
      body: JSON.stringify({ action: 'approve' }),
    })
    expect(res.status).toBe(409)
  })
})

import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/cloudinary.js', () => ({ uploadToCloudinary: vi.fn(), deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }) }))

const { AuditLog } = await import('../models/AuditLog.js')
const { Application } = await import('../models/Application.js')
const { Lead } = await import('../models/Lead.js')
const { Viewing } = await import('../models/Viewing.js')
const { BusinessInquiry } = await import('../models/BusinessInquiry.js')
const { ProfileAccess } = await import('../models/ProfileAccess.js')
const { AvatarAsset } = await import('../models/AvatarAsset.js')
const { User } = await import('../models/User.js')
const { deleteFromCloudinary } = await import('../utils/cloudinary.js')
const { runRetentionPurge } = await import('../services/retentionPurge.js')

/*
 * The purge acts on whole collections, and other suites share this database.
 * So the clock is set decades back: only rows dated before that — the ones
 * seeded here — can ever be past a cutoff, and everyone else's data is
 * "in the future" and untouched.
 */
const NOW = new Date('2001-01-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

describe.skipIf(!hasTestMongo)('the daily retention purge', () => {
  const run = new mongoose.Types.ObjectId().toHexString()
  const owner = new mongoose.Types.ObjectId()
  const ownerId = String(owner)
  const tag = { tag: run }

  const seed = async () => {
    await Promise.all([
      AuditLog.collection.insertMany([
        { userId: ownerId, action: 'old', entityType: 'x', entityId: `a-old-${run}`, createdAt: ago(800) },
        { userId: ownerId, action: 'new', entityType: 'x', entityId: `a-new-${run}`, createdAt: ago(100) },
      ]),
      Application.collection.insertMany([
        { tenantId: ownerId, propertyId: `rejected-old-${run}`, landlordId: 'l', status: 'rejected', updatedAt: ago(400) },
        { tenantId: ownerId, propertyId: `approved-old-${run}`, landlordId: 'l', status: 'approved', updatedAt: ago(400) },
        { tenantId: ownerId, propertyId: `rejected-new-${run}`, landlordId: 'l', status: 'rejected', updatedAt: ago(30) },
      ]),
      Lead.collection.insertMany([{ ...tag, agentId: 'agent', propertyId: 'old', contactName: 'x', contactPhone: 'y', updatedAt: ago(400) }, { ...tag, agentId: 'agent', propertyId: 'new', contactName: 'x', contactPhone: 'y', updatedAt: ago(10) }]),
      Viewing.collection.insertMany([{ ...tag, agentId: 'agent', propertyId: 'old', viewerName: 'x', viewerPhone: 'y', updatedAt: ago(400) }]),
      BusinessInquiry.collection.insertMany([{ ...tag, businessId: 'b', requesterId: 'r', requesterName: 'x', requesterPhone: 'y', updatedAt: ago(400) }]),
      ProfileAccess.collection.insertMany([
        { requesterId: `revoked-old-${run}`, tenantId: ownerId, status: 'revoked', respondedAt: ago(400) },
        { requesterId: `denied-noanswerdate-${run}`, tenantId: ownerId, status: 'denied', updatedAt: ago(400) },
        { requesterId: `approved-old-${run}`, tenantId: ownerId, status: 'approved', respondedAt: ago(400) },
        { requesterId: `revoked-new-${run}`, tenantId: ownerId, status: 'revoked', respondedAt: ago(30) },
      ]),
      // Avatar ids are strings, not ObjectIds.
      AvatarAsset.collection.insertMany([
        { _id: `replaced-old-${run}`, ownerId, publicId: `rentos/avatars/replaced-old-${run}`, createdAt: ago(60) },
        { _id: `current-old-${run}`, ownerId, publicId: `rentos/avatars/current-old-${run}`, createdAt: ago(60) },
        { _id: `replaced-new-${run}`, ownerId, publicId: `rentos/avatars/replaced-new-${run}`, createdAt: ago(5) },
      ] as never[]),
    ])
  }
  const counts = async () => ({
    audit: await AuditLog.countDocuments({ userId: ownerId }),
    applications: (await Application.find({ tenantId: ownerId }).lean()).map((a) => a.propertyId).sort(),
    leads: await Lead.collection.countDocuments(tag),
    viewings: await Viewing.collection.countDocuments(tag),
    inquiries: await BusinessInquiry.collection.countDocuments(tag),
    access: (await ProfileAccess.find({ tenantId: ownerId }).lean()).map((a) => a.requesterId).sort(),
    avatars: (await AvatarAsset.find({ ownerId }).lean()).map((a) => String(a._id)).sort(),
  })
  const clean = () => Promise.all([
    AuditLog.collection.deleteMany({ userId: ownerId }),
    Application.collection.deleteMany({ tenantId: ownerId }),
    Lead.collection.deleteMany(tag), Viewing.collection.deleteMany(tag), BusinessInquiry.collection.deleteMany(tag),
    ProfileAccess.collection.deleteMany({ tenantId: ownerId }),
    AvatarAsset.collection.deleteMany({ ownerId }),
  ])

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertOne({ _id: owner, email: `purge-${ownerId}@rentos.test`, roles: ['tenant'], passwordHash: 'x', profileImage: `https://res.cloudinary.com/c/image/upload/v1/rentos/avatars/current-old-${run}.jpg` })
  })
  beforeEach(async () => { await clean(); await seed(); vi.mocked(deleteFromCloudinary).mockClear() })
  afterAll(async () => {
    await clean()
    await AuditLog.collection.deleteMany({ action: 'retention.purge', entityId: '2001-01-01' })
    await User.collection.deleteOne({ _id: owner })
    await mongoose.disconnect()
  })

  it('counts but deletes nothing in dry-run mode', async () => {
    const before = await counts()
    const summary = await runRetentionPurge({ now: NOW, dryRun: true })
    expect(await counts()).toEqual(before)
    expect(deleteFromCloudinary).not.toHaveBeenCalled()
    expect(summary['security.auditLog'].deleted).toBe(0)
    expect(summary['security.auditLog'].matched).toBeGreaterThanOrEqual(1)
    expect(summary['account.avatar.replaced']).toEqual({ matched: 1, deleted: 0 })
  })

  it('removes expired rows in small batches and keeps everything still in its period', async () => {
    await runRetentionPurge({ now: NOW, batchSize: 1 })
    expect(await counts()).toEqual({
      audit: 1,
      applications: [`approved-old-${run}`, `rejected-new-${run}`],
      leads: 1,
      viewings: 0,
      inquiries: 0,
      access: [`approved-old-${run}`, `revoked-new-${run}`],
      avatars: [`current-old-${run}`, `replaced-new-${run}`],
    })
    expect(deleteFromCloudinary).toHaveBeenCalledWith(`rentos/avatars/replaced-old-${run}`, 'image')
    expect(deleteFromCloudinary).toHaveBeenCalledTimes(1)
  })

  it('writes a counts-only audit summary', async () => {
    await runRetentionPurge({ now: NOW, dryRun: true })
    const entry = await AuditLog.findOne({ action: 'retention.purge', entityId: '2001-01-01' }).sort({ createdAt: -1 }).lean()
    expect(entry).toMatchObject({ userId: 'system', entityType: 'RetentionSchedule' })
    const details = JSON.parse(entry!.details!)
    expect(details.dryRun).toBe(true)
    expect(Object.keys(details.rules).sort()).toEqual(['account.avatar.replaced', 'applications.unapproved', 'enquiries', 'profileAccess.closed', 'security.auditLog'])
    expect(entry!.details).not.toContain(ownerId)
    expect(entry!.details).not.toContain(run)
  })
})

import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../utils/cloudinary.js', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }),
  signedDownloadUrl: vi.fn(),
}))

// The ledger lives in its own database, as ERASURE_LEDGER_MONGO_URI puts it
// on its own cluster in production: a "restore" of the main database below
// must not roll it back.
const ledgerUri = `${testMongoUri}ledger`
const previousLedgerUri = process.env.ERASURE_LEDGER_MONGO_URI
process.env.ERASURE_LEDGER_MONGO_URI = ledgerUri

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Worker } = await import('../models/Worker.js')
const { TenantProfile } = await import('../models/TenantProfile.js')
const { Favorite } = await import('../models/Favorite.js')
const { DocumentModel } = await import('../models/Document.js')
const { RefreshToken } = await import('../models/RefreshToken.js')
const { BiometricToken } = await import('../models/BiometricToken.js')
const { DeviceToken } = await import('../models/DeviceToken.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { deleteFromCloudinary } = await import('../utils/cloudinary.js')
const { erasureLedger, closeErasureLedger, warnIfErasureLedgerShared } = await import('../services/erasureLedger.js')
const { replayErasureLedger } = await import('../services/erasureReplay.js')
const { eraseAccountRecords } = await import('../services/accountErasure.js')
const { closeAccount, AccountClosureIncompleteError } = await import('../services/accountClosure.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: documentsRouter } = await import('../routes/documents.js')

const DAY = 24 * 60 * 60 * 1000

describe.skipIf(!hasTestMongo)('the erasure ledger re-applies deletions to a restored backup', () => {
  const subject = new mongoose.Types.ObjectId()
  const uid = String(subject)
  const owner = new mongoose.Types.ObjectId()
  const partial = new mongoose.Types.ObjectId()
  const stranded = new mongoose.Types.ObjectId()
  let server: Server
  let base = ''

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    await User.collection.insertMany([
      { _id: subject, email: `ledger-${uid}@rentos.test`, phone: '0201112223', firstName: 'Abena', lastName: 'Ledger', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant', sessionVersion: 0 },
      { _id: owner, email: `ledger-owner-${String(owner)}@rentos.test`, phone: '0201112224', firstName: 'Owner', lastName: 'Ledger', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant' },
      { _id: partial, email: `ledger-partial-${String(partial)}@rentos.test`, phone: '0201112225', firstName: 'Kofi', lastName: 'Partial', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant', sessionVersion: 0 },
      { _id: stranded, email: `ledger-stranded-${String(stranded)}@rentos.test`, phone: '0201112226', firstName: 'Esi', lastName: 'Stranded', passwordHash: 'fixture', roles: ['tenant'], activeRole: 'tenant', sessionVersion: 0 },
    ])
    await Worker.collection.insertOne({ userId: String(partial), name: 'Kofi', phone: '0201112225', location: 'Accra', status: 'available', approvalStatus: 'approved' })
    await TenantProfile.collection.insertOne({ userId: uid, occupation: 'Teacher' })
    await Favorite.collection.insertOne({ userId: uid, propertyId: 'ledger-property' })
    const app = express()
    app.use(express.json())
    app.use('/api/documents', documentsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.collection.deleteMany({ _id: { $in: [subject, owner, partial, stranded] } }),
      RefreshToken.collection.deleteMany({ userId: String(stranded) }),
      BiometricToken.collection.deleteMany({ userId: String(stranded) }),
      DeviceToken.collection.deleteMany({ userId: String(stranded) }),
      AuditLog.collection.deleteMany({ entityId: { $in: [uid, String(partial), String(stranded)] } }),
      Worker.collection.deleteMany({ userId: String(partial) }),
      TenantProfile.collection.deleteMany({ userId: uid }),
      Favorite.collection.deleteMany({ userId: uid }),
      DocumentModel.collection.deleteMany({ ownerId: String(owner) }),
    ])
    await erasureLedger().db.dropDatabase()
    await closeErasureLedger()
    await mongoose.disconnect()
    if (previousLedgerUri === undefined) delete process.env.ERASURE_LEDGER_MONGO_URI
    else process.env.ERASURE_LEDGER_MONGO_URI = previousLedgerUri
  })

  it('stores the ledger on its own connection, and says when it shares the cluster', async () => {
    await erasureLedger().db.asPromise()
    expect(erasureLedger().db).not.toBe(mongoose.connection)
    expect(erasureLedger().db.name).toBe(`${mongoose.connection.name}ledger`)
    expect(warnIfErasureLedgerShared('mongodb://elsewhere.example.test:27017/rentos_production')).toBe('separate')
    expect(warnIfErasureLedgerShared(testMongoUri)).toBe('shared_cluster')
  })

  it('closes, erases, and after a restore of the pre-closure data erases the account again', async () => {
    const snapshot = await User.collection.findOne({ _id: subject })
    expect(await closeAccount(uid, { source: 'self_service', actorId: uid })).toBe(true)
    const [entry] = await erasureLedger().find({ subjectId: uid }).lean()
    expect(entry).toMatchObject({ scope: 'account', source: 'self_service' })
    expect(JSON.stringify(entry)).not.toMatch(/Abena|Ledger|rentos\.test|0201112223/)

    // Backdate the closure past the grace period, then purge.
    await User.collection.updateOne({ _id: subject }, { $set: { deletedAt: new Date(Date.now() - 40 * DAY) } })
    await erasureLedger().updateOne({ _id: entry._id }, { $set: { requestedAt: new Date(Date.now() - 40 * DAY) } })
    expect(await eraseAccountRecords(uid, new Date(Date.now() - 30 * DAY))).toBe(true)
    expect(await erasureLedger().findById(entry._id).lean()).toMatchObject({ completedAt: expect.any(Date) })

    // Simulated restore of a backup taken before the closure: the account and
    // its related records come back in full.
    await User.collection.insertOne(snapshot!)
    await TenantProfile.collection.insertOne({ userId: uid, occupation: 'Teacher' })
    await Favorite.collection.insertOne({ userId: uid, propertyId: 'ledger-property' })

    const summary = await replayErasureLedger()
    expect(summary.failed).toBe(0)
    expect(summary.accountsClosed).toBeGreaterThanOrEqual(1)
    expect(await User.collection.countDocuments({ _id: subject })).toBe(0)
    expect(await TenantProfile.countDocuments({ userId: uid })).toBe(0)
    expect(await Favorite.countDocuments({ userId: uid })).toBe(0)

    // Replaying again changes nothing.
    const again = await replayErasureLedger()
    expect(again.failed).toBe(0)
    expect(await User.collection.countDocuments({ _id: subject })).toBe(0)
  })

  it('records a document deletion before replying and deletes a restored copy again', async () => {
    const doc = await DocumentModel.create({
      ownerId: String(owner), name: 'payslip.pdf', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://res.cloudinary.com/x/raw/upload/rentos/documents/p.pdf',
      storagePublicId: 'rentos/documents/p.pdf', storageResourceType: 'raw', fileSize: 10, accessControl: [String(owner)],
    })
    const snapshot = await DocumentModel.collection.findOne({ _id: doc._id })
    const token = jwt.sign({ userId: String(owner), roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const res = await fetch(`${base}/api/documents/${doc.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const entry = await erasureLedger().findOne({ subjectId: String(owner), scope: 'document' }).lean()
    expect(entry).toMatchObject({ recordIds: [doc.id], storageAssets: [{ publicId: 'rentos/documents/p.pdf', resourceType: 'raw', deliveryType: 'upload' }], completedAt: expect.any(Date) })

    await DocumentModel.collection.insertOne(snapshot!)
    vi.mocked(deleteFromCloudinary).mockClear()
    const summary = await replayErasureLedger()
    expect(summary.recordsDeleted).toBeGreaterThanOrEqual(1)
    expect(await DocumentModel.exists({ _id: doc._id })).toBeNull()
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/documents/p.pdf', 'raw', 'upload')
  })

  it('refuses a document deletion it cannot record, leaving the document in place', async () => {
    const doc = await DocumentModel.create({
      ownerId: String(owner), name: 'keep.pdf', type: 'other', mimeType: 'application/pdf', fileUrl: 'https://example.test/keep.pdf', fileSize: 10, accessControl: [String(owner)],
    })
    const create = vi.spyOn(erasureLedger(), 'create').mockRejectedValueOnce(new Error('ledger unavailable'))
    const token = jwt.sign({ userId: String(owner), roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const res = await fetch(`${base}/api/documents/${doc.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    create.mockRestore()
    expect(res.status).toBe(500)
    expect(await DocumentModel.exists({ _id: doc._id })).not.toBeNull()
  })

  it('finishes a closure that failed after it was recorded, on the next replay', async () => {
    const pid = String(partial)
    const updateMany = vi.spyOn(Worker, 'updateMany').mockRejectedValueOnce(new Error('database blip'))
    await expect(closeAccount(pid, { source: 'self_service', actorId: pid })).rejects.toBeInstanceOf(AccountClosureIncompleteError)
    updateMany.mockRestore()
    expect(await erasureLedger().findOne({ subjectId: pid }).lean()).toMatchObject({ scope: 'account' })
    expect(await User.findById(pid).lean()).toMatchObject({ firstName: 'Kofi' })

    const summary = await replayErasureLedger()
    expect(summary.failed).toBe(0)
    expect(await User.findById(pid).lean()).toBeNull()
    expect(await User.findOne({ _id: pid, deletedAt: { $exists: true } }).lean()).toMatchObject({ firstName: 'Deleted' })
    expect(await Worker.findOne({ userId: pid }).lean()).toMatchObject({ approvalStatus: 'rejected', status: 'offline' })
  })

  it('revokes the sessions of a closure that failed after the tombstone was saved', async () => {
    // The user cannot retry this one: once deletedAt is set their token is refused.
    const sid = String(stranded)
    await RefreshToken.collection.insertOne({ userId: sid, tokenHash: `stranded-${sid}`, expiresAt: new Date(Date.now() + DAY) })
    await BiometricToken.collection.insertOne({ userId: sid, tokenHash: `stranded-bio-${sid}`, deviceId: 'phone', expiresAt: new Date(Date.now() + DAY) })
    await DeviceToken.collection.insertOne({ userId: sid, token: `ExponentPushToken[stranded-${sid}]`, platform: 'expo' })
    const revoke = vi.spyOn(RefreshToken, 'updateMany').mockRejectedValueOnce(new Error('database blip'))
    await expect(closeAccount(sid, { source: 'self_service', actorId: sid })).rejects.toBeInstanceOf(AccountClosureIncompleteError)
    revoke.mockRestore()
    expect(await User.findOne({ _id: sid, deletedAt: { $exists: true } }).lean()).toMatchObject({ firstName: 'Deleted' })
    expect(await RefreshToken.findOne({ userId: sid }).lean()).not.toHaveProperty('revokedAt')
    expect(await BiometricToken.countDocuments({ userId: sid })).toBe(1)
    expect(await AuditLog.countDocuments({ action: 'users.delete', entityId: sid })).toBe(0)

    const summary = await replayErasureLedger()
    expect(summary.failed).toBe(0)
    expect(await RefreshToken.findOne({ userId: sid }).lean()).toMatchObject({ revokedReason: 'gdpr_deletion' })
    expect(await BiometricToken.countDocuments({ userId: sid })).toBe(0)
    expect(await DeviceToken.countDocuments({ userId: sid })).toBe(0)
    expect(await AuditLog.findOne({ action: 'users.delete', entityId: sid }).lean())
      .toMatchObject({ userId: 'system', details: JSON.stringify({ source: 'self_service', completedBy: 'ledger_replay' }) })

    // Replaying again writes no second audit entry.
    await replayErasureLedger()
    expect(await AuditLog.countDocuments({ action: 'users.delete', entityId: sid })).toBe(1)
  })
})

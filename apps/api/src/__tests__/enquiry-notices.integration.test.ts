import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Notification } from '../models/Notification.js'
import { NEW_LEAD_TITLE, VIEWING_REQUESTED_TITLE, legacyLeadMessage, legacyViewingMessage, newLeadMessage, rewriteLegacyEnquiryNotices, viewingRequestedMessage } from '../services/enquiryNotices.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

// Notifications written before the wording changed quoted the enquirer's
// name and phone; the per-erasure scrub only found them while the lead still
// existed with those details. This rewrites them by format.
describe.skipIf(!hasTestMongo)('rewriting old enquiry notifications', () => {
  const agentId = new mongoose.Types.ObjectId().toString()
  beforeAll(async () => { await mongoose.connect(testMongoUri) })
  afterAll(async () => {
    await Notification.deleteMany({ userId: agentId })
    await mongoose.disconnect()
  })

  it('removes enquirers\' names and phones from old lead and viewing notices, and nothing else', async () => {
    const old = new Date('2026-01-01T00:00:00Z')
    await Notification.collection.insertMany([
      { userId: agentId, type: 'system', title: NEW_LEAD_TITLE, message: legacyLeadMessage('Ama Serwaa', '0241234567'), read: false, createdAt: old, updatedAt: old },
      { userId: agentId, type: 'system', title: VIEWING_REQUESTED_TITLE, message: legacyViewingMessage('Kofi Mensah', '2026-10-01', '10:00'), read: false, createdAt: old, updatedAt: old },
      { userId: agentId, type: 'system', title: NEW_LEAD_TITLE, message: newLeadMessage(), read: false, createdAt: old, updatedAt: old },
      { userId: agentId, type: 'system', title: 'Payment received', message: 'Ama Serwaa is interested in your listing. Reach them at 0241234567.', read: false, createdAt: old, updatedAt: old },
    ])
    expect(await rewriteLegacyEnquiryNotices()).toEqual({ leads: 1, viewings: 1 })
    const stored = await Notification.collection.find({ userId: agentId }).sort({ _id: 1 }).toArray()
    expect(stored.map((n) => n.message)).toEqual([
      newLeadMessage(),
      viewingRequestedMessage('2026-10-01', '10:00'),
      newLeadMessage(),
      'Ama Serwaa is interested in your listing. Reach them at 0241234567.',
    ])
    // The rewrite does not restart a notification's retention clock.
    expect(stored.every((n) => (n.updatedAt as Date).getTime() === old.getTime())).toBe(true)
    expect(await rewriteLegacyEnquiryNotices()).toEqual({ leads: 0, viewings: 0 })
  })
})

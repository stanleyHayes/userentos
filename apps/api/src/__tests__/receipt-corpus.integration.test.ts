import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LegalDocument } from '../models/LegalDocument.js'
import { correctLegacyReceiptDocuments, LEGACY_RECEIPT_CONTENT, LEGACY_RECEIPT_TITLE, RECEIPT_LEGAL_DOCUMENT } from '../services/legal/receiptCorpus.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('receipt corpus correction with real Mongo', () => {
  const ids: mongoose.Types.ObjectId[] = []
  beforeAll(async () => { await mongoose.connect(uri) })
  afterAll(async () => { await LegalDocument.deleteMany({ _id: { $in: ids } }); await mongoose.disconnect() })
  it('corrects exact legacy copies, invalidates old vectors and preserves edits and activation state', async () => {
    const original = { ...RECEIPT_LEGAL_DOCUMENT, title: LEGACY_RECEIPT_TITLE, section: '23', content: LEGACY_RECEIPT_CONTENT, embedding: [1, 0], isActive: false }
    const old = await LegalDocument.create(original)
    const edited = await LegalDocument.create({ ...original, content: LEGACY_RECEIPT_CONTENT + '\nReviewer note.' })
    ids.push(old._id as mongoose.Types.ObjectId, edited._id as mongoose.Types.ObjectId)
    await correctLegacyReceiptDocuments()
    const fixed = await LegalDocument.findById(old._id).lean()
    expect(fixed).toMatchObject({ title: RECEIPT_LEGAL_DOCUMENT.title, content: RECEIPT_LEGAL_DOCUMENT.content, section: '33', isActive: false, embedding: [] })
    expect((await LegalDocument.findById(edited._id).lean())?.content).toContain('Reviewer note.')
    const second = await correctLegacyReceiptDocuments()
    expect(second.modifiedCount).toBe(0)
  })
})

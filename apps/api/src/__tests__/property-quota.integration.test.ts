import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Property } from '../models/Property.js'
import { PropertyRepository } from '../repositories/index.js'
import { PropertyService } from '../services/propertyService.js'
import { EntitlementError, requireQuota } from '../services/entitlements.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/entitlements.js', async importOriginal => ({
  ...await importOriginal<typeof import('../services/entitlements.js')>(), requireQuota: vi.fn(),
}))
const uri = testMongoUri
const data = { title: 'Quota fixture', description: 'Test property', type: 'apartment', address: { street: '1 Test St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 1500, rentDurationMonths: 12, advanceMonths: 6 }
const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }
describe.skipIf(!hasTestMongo)('atomic property quota admission', () => {
  const owners: string[] = []
  const repo = new PropertyRepository()
  const service = new PropertyService(repo, logger as never)
  beforeAll(async () => { await mongoose.connect(uri); await repo.ensureQuotaIndex() })
  afterAll(async () => { await Property.deleteMany({ landlordId: { $in: owners } }); await mongoose.disconnect() })
  function owner(limit: number) {
    const id = String(new mongoose.Types.ObjectId()); owners.push(id)
    vi.mocked(requireQuota).mockImplementation(async (_id, feature, count) => {
      if (count >= limit) throw new EntitlementError(feature, 'Property limit reached')
    })
    return id
  }
  it('admits only one of twelve requests for the final slot when legacy properties exist', async () => {
    const id = owner(2)
    await Property.create({ ...data, landlordId: id })
    const responses = await Promise.all(Array.from({ length: 12 }, () => service.create(data, id)))
    expect(responses.filter(r => r.status === 201)).toHaveLength(1)
    expect(responses.every(r => [201, 403, 409].includes(r.status))).toBe(true)
    expect(await Property.countDocuments({ landlordId: id })).toBe(2)
  })
  it('fills three slots under contention without exceeding the quota', async () => {
    const id = owner(3)
    const responses = await Promise.all(Array.from({ length: 12 }, () => service.create(data, id)))
    expect(responses.filter(r => r.status === 201)).toHaveLength(3)
    expect((await Property.find({ landlordId: id }).lean()).map(p => p.quotaSlot).sort()).toEqual([0, 1, 2])
  })
  it('reuses a deleted slot and ignores attempts to change its immutable number', async () => {
    const id = owner(1)
    const first = await service.create(data, id)
    await Property.updateOne({ _id: first.data!.id }, { $set: { quotaSlot: 99 } })
    expect((await Property.findById(first.data!.id))!.quotaSlot).toBe(0)
    await Property.deleteOne({ _id: first.data!.id })
    expect((await service.create(data, id)).status).toBe(201)
    expect((await Property.findOne({ landlordId: id }))!.quotaSlot).toBe(0)
  })
  it('does not consume capacity on validation failure', async () => {
    const id = owner(1)
    await expect(service.create({ ...data, title: '' }, id)).rejects.toThrow()
    expect((await service.create(data, id)).status).toBe(201)
    expect(await Property.countDocuments({ landlordId: id })).toBe(1)
  })
})

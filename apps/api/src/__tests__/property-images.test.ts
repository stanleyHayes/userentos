import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from 'winston'
import type { Request, Response } from 'express'

vi.mock('../utils/cloudinary.js', () => ({ uploadToCloudinary: vi.fn(), deleteFromCloudinary: vi.fn() }))
vi.mock('../services/erasureLedger.js', () => ({ recordErasure: vi.fn().mockResolvedValue('entry-1'), completeErasure: vi.fn().mockResolvedValue(undefined) }))

const { Property } = await import('../models/Property.js')
const { PropertyService } = await import('../services/propertyService.js')
const { propertyImageAssets } = await import('../services/propertyImages.js')
const { propertyController } = await import('../controllers/propertyController.js')
const { uploadToCloudinary, deleteFromCloudinary } = await import('../utils/cloudinary.js')
const { recordErasure, completeErasure } = await import('../services/erasureLedger.js')
type Repo = ConstructorParameters<typeof PropertyService>[0]

const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger
const CLOUD = 'rentos-test'
const previousCloudName = process.env.CLOUDINARY_CLOUD_NAME
afterAll(() => {
  if (previousCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME
  else process.env.CLOUDINARY_CLOUD_NAME = previousCloudName
})
const ours = (id: string) => `https://res.cloudinary.com/${CLOUD}/image/upload/v17/rentos/properties/${id}.jpg`

function listing(overrides: Record<string, unknown> = {}) {
  const property = new Property({
    landlordId: 'owner', title: 'Osu 2-bed', description: 'Near the beach', type: 'apartment',
    address: { street: '1 Oxford St', city: 'Accra', region: 'Greater Accra' }, rentAmount: 2000, rentDurationMonths: 12, advanceMonths: 2,
    status: 'available', listingStatus: 'approved', ...overrides,
  })
  vi.spyOn(property, 'save').mockResolvedValue(property)
  const deleteOne = vi.spyOn(property, 'deleteOne').mockResolvedValue({} as never)
  return { property, deleteOne }
}

const response = () => {
  const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this }, json(body: unknown) { this.body = body; return this } }
  return res as unknown as Response & { statusCode: number; body: { data?: unknown; error?: string } }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD
  vi.mocked(deleteFromCloudinary).mockResolvedValue({ result: 'ok' })
})

describe('listing photos are tracked so they can be erased', () => {
  it('uses recorded storage ids, recovers ours from legacy URLs, and skips links that are not ours', () => {
    const assets = propertyImageAssets({
      images: [ours('recorded'), ours('legacy'), 'https://images.example.test/street.jpg', 'https://res.cloudinary.com/other-cloud/image/upload/rentos/properties/x.jpg'],
      imageAssets: [{ url: ours('recorded'), publicId: 'rentos/properties/recorded' }],
    })
    expect(assets).toEqual([
      { publicId: 'rentos/properties/recorded', resourceType: 'image', deliveryType: 'upload' },
      { publicId: 'rentos/properties/legacy', resourceType: 'image', deliveryType: 'upload' },
    ])
  })

  it('records the storage id of every uploaded photo', async () => {
    const { property } = listing({ images: [], imageAssets: [] })
    vi.spyOn(Property, 'findById').mockResolvedValueOnce(property as never)
    vi.mocked(uploadToCloudinary).mockResolvedValueOnce({ url: ours('new'), publicId: 'rentos/properties/new', format: 'jpg', bytes: 1 })
    const res = response()
    await propertyController.uploadImages({ params: { id: property.id }, files: [{ buffer: Buffer.from('x') }], user: { userId: 'owner', roles: ['landlord'] } } as unknown as Request, res)
    expect(res.statusCode).toBe(200)
    expect(property.images).toEqual([ours('new')])
    expect(property.imageAssets.map((a) => ({ url: a.url, publicId: a.publicId }))).toEqual([{ url: ours('new'), publicId: 'rentos/properties/new' }])
  })

  it('erases every photo when the listing is deleted, after writing the ledger entry', async () => {
    const { property, deleteOne } = listing({ images: [ours('a'), ours('b')], imageAssets: [{ url: ours('a'), publicId: 'rentos/properties/a' }] })
    const service = new PropertyService({ findById: vi.fn().mockResolvedValue(property) } as unknown as Repo, logger)
    expect(await service.delete(property.id, 'owner')).toMatchObject({ message: 'Property deleted' })
    expect(recordErasure).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'owner', scope: 'property', recordIds: [property.id], storageAssets: [expect.objectContaining({ publicId: 'rentos/properties/a' }), expect.objectContaining({ publicId: 'rentos/properties/b' })] }))
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/properties/a', 'image', 'upload')
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/properties/b', 'image', 'upload')
    expect(vi.mocked(recordErasure).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deleteFromCloudinary).mock.invocationCallOrder[0])
    expect(deleteOne).toHaveBeenCalled()
    expect(completeErasure).toHaveBeenCalledWith('entry-1')
  })

  it('keeps the listing when the file host does not confirm, so the deletion can be retried', async () => {
    const { property, deleteOne } = listing({ images: [ours('a')], imageAssets: [{ url: ours('a'), publicId: 'rentos/properties/a' }] })
    vi.mocked(deleteFromCloudinary).mockRejectedValueOnce(new Error('Storage provider did not confirm asset deletion'))
    const service = new PropertyService({ findById: vi.fn().mockResolvedValue(property) } as unknown as Repo, logger)
    await expect(service.delete(property.id, 'owner')).rejects.toThrow('did not confirm')
    expect(deleteOne).not.toHaveBeenCalled()
    expect(completeErasure).not.toHaveBeenCalled()
  })

  it('erases a single removed photo and drops it from the listing', async () => {
    const { property } = listing({ images: [ours('keep'), ours('drop')], imageAssets: [{ url: ours('keep'), publicId: 'rentos/properties/keep' }, { url: ours('drop'), publicId: 'rentos/properties/drop' }] })
    vi.spyOn(Property, 'findById').mockResolvedValueOnce(property as never)
    const res = response()
    await propertyController.removeImage({ params: { id: property.id }, body: { url: ours('drop') }, user: { userId: 'owner', roles: ['landlord'] } } as unknown as Request, res)
    expect(res.statusCode).toBe(200)
    expect(deleteFromCloudinary).toHaveBeenCalledTimes(1)
    expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/properties/drop', 'image', 'upload')
    expect(property.images).toEqual([ours('keep')])
    expect(property.imageAssets.map((a) => a.publicId)).toEqual(['rentos/properties/keep'])
  })

  it('lets only the owner remove a photo', async () => {
    const { property } = listing({ images: [ours('a')] })
    vi.spyOn(Property, 'findById').mockResolvedValueOnce(property as never)
    const res = response()
    await propertyController.removeImage({ params: { id: property.id }, body: { url: ours('a') }, user: { userId: 'someone-else', roles: ['landlord'] } } as unknown as Request, res)
    expect(res.statusCode).toBe(403)
    expect(deleteFromCloudinary).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cloudinary, deleteFromCloudinary } from '../utils/cloudinary.js'
import { DocumentModel } from '../models/Document.js'
import { eraseDocumentFile, erasePersonalDocuments, legacyDocumentAsset } from '../services/documentErasure.js'
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { destroy: vi.fn() } } }))
vi.mock('../models/Document.js', () => ({ DocumentModel: { find: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: 'ok' })
})

describe('provider-confirmed document erasure', () => {
  it.each(['ok', 'not found'])('accepts idempotent provider result %s and invalidates the CDN', async result => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result })
    await deleteFromCloudinary('rentos/documents/private.pdf', 'raw')
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('rentos/documents/private.pdf', { resource_type: 'raw', invalidate: true })
  })
  it('does not accept an unknown provider response as deletion', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result: 'pending' })
    await expect(deleteFromCloudinary('file')).rejects.toThrow('did not confirm')
  })
  it('uses persisted upload identifiers rather than deriving them from transformed URLs', async () => {
    await eraseDocumentFile({ fileUrl: 'https://example.test/transformed', storagePublicId: 'rentos/documents/original', storageResourceType: 'image' })
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('rentos/documents/original', { resource_type: 'image', invalidate: true })
  })
  it('preserves the document and identifiers when storage is unavailable, then retries', async () => {
    const doc = { fileUrl: 'https://example.test/file', storagePublicId: 'rentos/documents/file.pdf', storageResourceType: 'raw' as const, deleteOne: vi.fn().mockResolvedValue({}) }
    const limit = vi.fn().mockResolvedValueOnce([doc]).mockResolvedValueOnce([doc]).mockResolvedValueOnce([])
    vi.mocked(DocumentModel.find).mockReturnValue({ sort: () => ({ limit }) } as never)
    vi.mocked(cloudinary.uploader.destroy).mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(erasePersonalDocuments('owner')).rejects.toThrow('provider unavailable')
    expect(doc.deleteOne).not.toHaveBeenCalled()
    await erasePersonalDocuments('owner')
    expect(doc.deleteOne).toHaveBeenCalledOnce()
    expect(DocumentModel.find).toHaveBeenCalledWith({ ownerId: 'owner', $or: [
      { type: 'identity' },
      { type: 'other', linkedEntityId: { $in: [null, ''] }, linkedEntityType: { $in: [null, ''] } },
    ] })
    expect(limit).toHaveBeenCalledWith(50)
  })
})

describe('legacy original upload identifiers', () => {
  it('keeps raw-file extensions and removes image delivery extensions', () => {
    expect(legacyDocumentAsset('https://res.cloudinary.com/ours/raw/upload/v123/rentos/documents/file.pdf', 'ours')).toEqual({ publicId: 'rentos/documents/file.pdf', resourceType: 'raw' })
    expect(legacyDocumentAsset('https://res.cloudinary.com/ours/image/upload/v123/rentos/documents/photo.jpg', 'ours')).toEqual({ publicId: 'rentos/documents/photo', resourceType: 'image' })
  })
  it.each([
    'https://res.cloudinary.com/theirs/image/upload/v1/rentos/documents/photo.jpg',
    'https://res.cloudinary.com/ours/image/upload/w_100/v1/rentos/documents/photo.jpg',
    'https://res.cloudinary.com/ours/image/upload/v1/rentos/properties/photo.jpg',
    'https://res.cloudinary.com/ours/image/upload/v1/rentos/documents/a%2Fb.jpg',
  ])('refuses ambiguous or unowned storage: %s', url => {
    expect(() => legacyDocumentAsset(url, 'ours')).toThrow()
  })
  it('does not send third-party linked files to our storage deletion API', async () => {
    await eraseDocumentFile({ fileUrl: 'https://example.org/document.pdf' })
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })
})

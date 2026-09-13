import { beforeEach, expect, it, vi } from 'vitest'
import { AvatarAsset } from '../models/AvatarAsset.js'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js'
import { uploadAvatar, eraseAvatars, rememberLegacyAvatar } from '../services/avatarStorage.js'
vi.mock('../models/AvatarAsset.js', () => ({ AvatarAsset: { create: vi.fn(), updateOne: vi.fn(), find: vi.fn() } }))
vi.mock('../utils/cloudinary.js', () => ({ uploadToCloudinary: vi.fn(), deleteFromCloudinary: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AvatarAsset.create).mockResolvedValue({} as never)
  vi.mocked(AvatarAsset.updateOne).mockResolvedValue({} as never)
  vi.mocked(deleteFromCloudinary).mockResolvedValue({ result: 'ok' })
})
it('persists the storage identifier before upload, including failed uploads', async () => {
  vi.mocked(uploadToCloudinary).mockRejectedValueOnce(new Error('upload failed'))
  await expect(uploadAvatar('owner', Buffer.from('test'))).rejects.toThrow('upload failed')
  const row = vi.mocked(AvatarAsset.create).mock.calls[0][0] as unknown as { publicId: string; _id: string; ownerId: string }
  expect(row.ownerId).toBe('owner')
  expect(row.publicId).toBe(`rentos/avatars/${row._id}`)
  expect(uploadToCloudinary).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'avatars', publicId: row._id, resourceType: 'image' })
  expect(vi.mocked(AvatarAsset.create).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(uploadToCloudinary).mock.invocationCallOrder[0])
})
it('never starts an upload if its durable record cannot be created', async () => {
  vi.mocked(AvatarAsset.create).mockRejectedValueOnce(new Error('database unavailable'))
  await expect(uploadAvatar('owner', Buffer.from('test'))).rejects.toThrow()
  expect(uploadToCloudinary).not.toHaveBeenCalled()
})
it('remembers old avatar URLs idempotently before they are cleared or replaced', async () => {
  await rememberLegacyAvatar('owner', 'https://example.test/photo')
  await rememberLegacyAvatar('owner', 'https://example.test/photo')
  expect(vi.mocked(AvatarAsset.updateOne).mock.calls[0]).toEqual(vi.mocked(AvatarAsset.updateOne).mock.calls[1])
  expect(AvatarAsset.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: expect.any(String) }), { $setOnInsert: expect.objectContaining({ ownerId: 'owner', legacyUrl: 'https://example.test/photo' }) }, { upsert: true })
})
it('retains a failed deletion and retries the same identifier', async () => {
  const row = { publicId: 'rentos/avatars/photo', deleteOne: vi.fn().mockResolvedValue({}) }
  const limit = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([row]).mockResolvedValueOnce([])
  vi.mocked(AvatarAsset.find).mockReturnValue({ sort: () => ({ limit }) } as never)
  vi.mocked(deleteFromCloudinary).mockRejectedValueOnce(new Error('provider unavailable'))
  await expect(eraseAvatars('owner')).rejects.toThrow('provider unavailable')
  expect(row.deleteOne).not.toHaveBeenCalled()
  await eraseAvatars('owner')
  expect(row.deleteOne).toHaveBeenCalledOnce()
  expect(deleteFromCloudinary).toHaveBeenCalledWith('rentos/avatars/photo', 'image')
  expect(AvatarAsset.find).toHaveBeenCalledWith({ ownerId: 'owner' })
})
it('does not delete from another storage account after configuration changes', async () => {
  const row = { publicId: 'rentos/avatars/photo', cloudName: 'definitely-not-current-cloud', deleteOne: vi.fn() }
  vi.mocked(AvatarAsset.find).mockReturnValue({ sort: () => ({ limit: async () => [row] }) } as never)
  await expect(eraseAvatars('owner')).rejects.toThrow('storage account changed')
  expect(deleteFromCloudinary).not.toHaveBeenCalled()
  expect(row.deleteOne).not.toHaveBeenCalled()
})

import { randomUUID, createHash } from 'node:crypto'
import { isValidObjectId } from 'mongoose'
import { AvatarAsset } from '../models/AvatarAsset.js'
import { User } from '../models/User.js'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js'
import { legacyDocumentAsset } from './documentErasure.js'
import { logger } from '../utils/logger.js'

interface StoredAvatar {
  _id: string
  ownerId: string
  publicId?: string | null
  cloudName?: string | null
  legacyUrl?: string | null
  deleteOne(): PromiseLike<unknown>
}

export async function rememberLegacyAvatar(ownerId: string, url?: string): Promise<void> {
  if (!url) return
  const id = createHash('sha256').update(`${ownerId}\n${url}`).digest('hex')
  await AvatarAsset.updateOne({ _id: id }, { $setOnInsert: { ownerId, legacyUrl: url, cloudName: process.env.CLOUDINARY_CLOUD_NAME } }, { upsert: true })
}

export async function uploadAvatar(ownerId: string, buffer: Buffer) {
  const id = randomUUID()
  const publicId = `rentos/avatars/${id}`
  await AvatarAsset.create({ _id: id, ownerId, publicId, cloudName: process.env.CLOUDINARY_CLOUD_NAME })
  return uploadToCloudinary(buffer, { folder: 'avatars', publicId: id, resourceType: 'image' })
}

/** Delete the file, then the record — the record stays if the provider does not confirm. */
async function eraseAvatarAsset(asset: StoredAvatar): Promise<void> {
  if (asset.cloudName && asset.cloudName !== process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('Avatar storage account changed; manual provider review required')
  }
  const original = asset.publicId
    ? { publicId: asset.publicId, resourceType: 'image' as const }
    : legacyDocumentAsset(asset.legacyUrl ?? '', process.env.CLOUDINARY_CLOUD_NAME, 'avatars')
  if (original) await deleteFromCloudinary(original.publicId, original.resourceType)
  await asset.deleteOne()
}

export async function eraseAvatars(ownerId: string): Promise<void> {
  for (;;) {
    const assets = await AvatarAsset.find({ ownerId }).sort({ _id: 1 }).limit(50)
    if (!assets.length) return
    for (const asset of assets) await eraseAvatarAsset(asset as unknown as StoredAvatar)
  }
}

/** Whether a stored avatar is the photo the profile shows now. */
export function isCurrentAvatar(asset: Pick<StoredAvatar, 'publicId' | 'legacyUrl'>, profileImage: string | undefined): boolean {
  if (!profileImage) return false
  if (asset.legacyUrl) return asset.legacyUrl === profileImage
  if (!asset.publicId) return false
  const path = new URL(profileImage, 'https://invalid.local').pathname
  return path.endsWith(`/${asset.publicId}`) || path.includes(`/${asset.publicId}.`)
}

/**
 * Retention: photos that are no longer the profile photo, older than the
 * cutoff, are deleted with their files. Closed accounts are left to account
 * erasure; photos of accounts that no longer exist at all are orphans and go.
 */
export async function purgeReplacedAvatars(cutoff: Date, options: { dryRun?: boolean; batchSize?: number } = {}): Promise<{ matched: number; deleted: number }> {
  const { dryRun = false, batchSize = 100 } = options
  const result = { matched: 0, deleted: 0 }
  let after: string | undefined
  for (;;) {
    const assets = await AvatarAsset.find({ createdAt: { $lt: cutoff }, ...(after ? { _id: { $gt: after } } : {}) })
      .sort({ _id: 1 }).limit(batchSize)
    if (!assets.length) return result
    const ownerIds = [...new Set(assets.map((asset) => String(asset.ownerId)))].filter((id) => isValidObjectId(id))
    const [open, closed] = await Promise.all([
      User.find({ _id: { $in: ownerIds } }).select('profileImage').lean(),
      User.distinct('_id', { _id: { $in: ownerIds }, deletedAt: { $exists: true } }),
    ])
    const current = new Map(open.map((user) => [String(user._id), user.profileImage ?? undefined]))
    const closing = new Set(closed.map(String))
    for (const doc of assets) {
      const asset = doc as unknown as StoredAvatar
      after = asset._id
      if (closing.has(asset.ownerId)) continue
      if (current.has(asset.ownerId) && isCurrentAvatar(asset, current.get(asset.ownerId))) continue
      result.matched++
      if (dryRun) continue
      try {
        await eraseAvatarAsset(asset)
        result.deleted++
      } catch {
        logger.warn(`[Retention] Replaced avatar ${asset._id} could not be erased; will retry on the next run`)
      }
    }
    if (assets.length < batchSize) return result
  }
}

import { randomUUID, createHash } from 'node:crypto'
import { AvatarAsset } from '../models/AvatarAsset.js'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js'
import { legacyDocumentAsset } from './documentErasure.js'

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

export async function eraseAvatars(ownerId: string): Promise<void> {
  for (;;) {
    const assets = await AvatarAsset.find({ ownerId }).sort({ _id: 1 }).limit(50)
    if (!assets.length) return
    for (const asset of assets) {
      if (asset.cloudName && asset.cloudName !== process.env.CLOUDINARY_CLOUD_NAME) {
        throw new Error('Avatar storage account changed; manual provider review required')
      }
      const original = asset.publicId
        ? { publicId: asset.publicId, resourceType: 'image' as const }
        : legacyDocumentAsset(asset.legacyUrl ?? '', process.env.CLOUDINARY_CLOUD_NAME, 'avatars')
      if (original) await deleteFromCloudinary(original.publicId, original.resourceType)
      await asset.deleteOne()
    }
  }
}

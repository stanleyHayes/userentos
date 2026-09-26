import { deleteFromCloudinary } from '../utils/cloudinary.js'
import { DocumentModel } from '../models/Document.js'
import type { ErasedStorageAsset } from '../models/ErasureLedger.js'

type ResourceType = 'image' | 'video' | 'raw'
interface DocumentAsset {
  fileUrl: string
  storagePublicId?: string
  storageResourceType?: ResourceType
  storageDeliveryType?: 'upload' | 'authenticated'
}

/** The storage folders under rentos/ whose files we own and erase. */
export type StorageFolder = 'documents' | 'avatars' | 'properties' | 'evidence'

/** Only our original, untransformed document URLs are eligible for legacy recovery. */
export function legacyDocumentAsset(fileUrl: string, cloudName: string | undefined, folder: StorageFolder = 'documents'): { publicId: string; resourceType: ResourceType } | null {
  let url: URL
  try { url = new URL(fileUrl) } catch { throw new Error('Invalid stored document URL; manual storage review required') }
  // External links do not represent files held by our storage provider.
  if (url.hostname !== 'res.cloudinary.com') return null
  const parts = url.pathname.split('/').slice(1)
  if (!cloudName || parts[0] !== cloudName || !['image', 'video', 'raw'].includes(parts[1]) || parts[2] !== 'upload') {
    throw new Error('Document storage ownership could not be verified')
  }
  const resourceType = parts[1] as ResourceType
  let path = parts.slice(3)
  if (/^v\d+$/.test(path[0] ?? '')) path = path.slice(1)
  if (path[0] !== 'rentos' || path[1] !== folder || path.length < 3 || path.some(part => !part || /%|\.\./.test(part))) {
    throw new Error('Document storage identifier requires manual review')
  }
  let publicId = path.join('/')
  // Raw assets retain their extension as part of public_id; images/videos do not.
  if (resourceType !== 'raw') publicId = publicId.replace(/\.[^/.]+$/, '')
  return { publicId, resourceType }
}

/** The stored file behind a document, or null for an external link. */
export function documentStorageAsset(doc: DocumentAsset): ErasedStorageAsset | null {
  if (doc.storagePublicId && doc.storageResourceType) {
    return { publicId: doc.storagePublicId, resourceType: doc.storageResourceType, deliveryType: doc.storageDeliveryType ?? 'upload' }
  }
  const legacy = legacyDocumentAsset(doc.fileUrl, process.env.CLOUDINARY_CLOUD_NAME)
  return legacy ? { ...legacy, deliveryType: 'upload' } : null
}

export async function eraseDocumentFile(doc: DocumentAsset): Promise<void> {
  const asset = documentStorageAsset(doc)
  if (asset) await deleteFromCloudinary(asset.publicId, asset.resourceType, asset.deliveryType)
}

/** Personal identity and standalone miscellaneous files; contracts/evidence await retention review. */
export async function erasePersonalDocuments(ownerId: string): Promise<void> {
  for (;;) {
    const docs = await DocumentModel.find({ ownerId, $or: [
      { type: 'identity' },
      { type: 'other', linkedEntityId: { $in: [null, ''] }, linkedEntityType: { $in: [null, ''] } },
    ] }).sort({ _id: 1 }).limit(50)
    if (docs.length === 0) return
    for (const doc of docs) {
      await eraseDocumentFile(doc)
      // Retain provider identifiers until remote deletion is confirmed, so retries work.
      await doc.deleteOne()
    }
  }
}

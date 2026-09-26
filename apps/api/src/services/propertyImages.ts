import type { ErasedStorageAsset } from '../models/ErasureLedger.js'
import { deleteFromCloudinary } from '../utils/cloudinary.js'
import { legacyDocumentAsset } from './documentErasure.js'
import { logger } from '../utils/logger.js'

interface PropertyImages {
  images?: string[]
  imageAssets?: Array<{ url: string; publicId: string }>
}

/**
 * The stored files behind a listing's photos: the storage id recorded at
 * upload, or — for photos uploaded before ids were recorded — the id read
 * back from our own untransformed Cloudinary URL (the legacy backfill).
 * External links and URLs we cannot attribute to our account are skipped:
 * they are not files we hold, and one odd URL must not block erasing the rest.
 */
export function propertyImageAssets(property: PropertyImages): ErasedStorageAsset[] {
  const assets = new Map<string, ErasedStorageAsset>()
  const recorded = new Set<string>()
  for (const asset of property.imageAssets ?? []) {
    if (!asset?.publicId) continue
    recorded.add(asset.url)
    assets.set(asset.publicId, { publicId: asset.publicId, resourceType: 'image', deliveryType: 'upload' })
  }
  for (const url of property.images ?? []) {
    if (!url || recorded.has(url)) continue
    try {
      const legacy = legacyDocumentAsset(url, process.env.CLOUDINARY_CLOUD_NAME, 'properties')
      if (legacy) assets.set(legacy.publicId, { ...legacy, deliveryType: 'upload' })
    } catch {
      logger.warn('[Property images] A listing photo URL could not be attributed to our storage; left for manual review')
    }
  }
  return [...assets.values()]
}

/** Delete files at the provider (with CDN invalidation). Throws if any deletion is not confirmed. */
export async function eraseStoredAssets(assets: readonly ErasedStorageAsset[]): Promise<void> {
  for (const asset of assets) await deleteFromCloudinary(asset.publicId, asset.resourceType, asset.deliveryType ?? 'upload')
}

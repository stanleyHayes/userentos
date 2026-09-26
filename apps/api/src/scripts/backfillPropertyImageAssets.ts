/**
 * One-off backfill: listing photos uploaded before Property.imageAssets
 * existed kept only their URL. Records the storage id for every photo whose
 * URL is one of our own untransformed Cloudinary uploads, so deleting the
 * listing (or the account) erases the file. External links are left alone;
 * URLs that look like ours but cannot be attributed are counted for manual
 * review. Erasure derives the same ids at run time, so this only makes them
 * visible in the data. Safe to re-run.
 *
 * Usage: node dist/scripts/backfillPropertyImageAssets.js
 *   or   npx tsx --env-file=.env src/scripts/backfillPropertyImageAssets.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { legacyDocumentAsset } from '../services/documentErasure.js'

export async function backfillPropertyImageAssets(scope: { propertyIds?: string[] } = {}): Promise<{ properties: number; images: number; needsReview: number }> {
  const result = { properties: 0, images: 0, needsReview: 0 }
  const cursor = Property.find({ ...(scope.propertyIds ? { _id: { $in: scope.propertyIds } } : {}), 'images.0': { $exists: true } })
    .select('images imageAssets').cursor()
  for await (const property of cursor) {
    const known = new Set((property.imageAssets ?? []).map((asset) => asset.url))
    const found: Array<{ url: string; publicId: string }> = []
    for (const url of property.images) {
      if (known.has(url)) continue
      try {
        const asset = legacyDocumentAsset(url, process.env.CLOUDINARY_CLOUD_NAME, 'properties')
        if (asset) found.push({ url, publicId: asset.publicId })
      } catch {
        result.needsReview++
      }
    }
    if (!found.length) continue
    await Property.updateOne({ _id: property._id }, { $push: { imageAssets: { $each: found } } })
    result.properties++
    result.images += found.length
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  const result = await backfillPropertyImageAssets()
  console.log(`Recorded storage ids for ${result.images} photos on ${result.properties} listings; ${result.needsReview} photo URLs need manual review.`)
  await mongoose.disconnect()
}

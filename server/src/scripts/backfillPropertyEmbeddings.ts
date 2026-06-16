/**
 * One-off script to backfill embeddings for existing properties.
 * Computes OpenAI embeddings for all properties missing them.
 * Safe to re-run — skips properties that already have embeddings.
 *
 * Usage: npx tsx src/scripts/backfillPropertyEmbeddings.ts
 */
import mongoose from 'mongoose'
import { config } from '../config/index.js'
import { Property } from '../models/Property.js'
import { embed } from '../services/embeddings.js'

function propertyText(property: object): string {
  const p = property as Record<string, unknown>
  const parts: string[] = []
  if (p.title) parts.push(String(p.title))
  if (p.description) parts.push(String(p.description))
  const address = p.address as Record<string, unknown> | undefined
  if (address?.city) parts.push(String(address.city))
  if (address?.neighborhood) parts.push(String(address.neighborhood))
  if (address?.region) parts.push(String(address.region))
  if (p.type) parts.push(String(p.type))
  const features = p.features as Record<string, unknown> | undefined
  const amenities = Array.isArray(features?.amenities) ? features.amenities : []
  if (amenities.length) parts.push(amenities.join(', '))
  const proximity = Array.isArray(features?.proximity) ? features.proximity : []
  if (proximity.length) parts.push('near: ' + proximity.join(', '))
  if (p.rentAmount != null) parts.push(`rent: ${p.rentAmount}`)
  return parts.join('. ')
}

async function run() {
  await mongoose.connect(config.mongoUri)
  console.log('Connected to MongoDB.')

  let updated = 0
  let skipped = 0
  let failed = 0

  const batchSize = 10 // OpenAI rate limit friendly
  let page = 0

  while (true) {
    const properties = await Property
      .find({ $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }] })
      .limit(batchSize)
      .skip(page * batchSize)
      .lean()

    if (properties.length === 0) break

    for (const property of properties) {
      const text = propertyText(property)
      if (!text.trim()) {
        skipped++
        continue
      }

      try {
        const vector = await embed(text)
        await Property.updateOne(
          { _id: property._id },
          { $set: { embedding: vector } },
        )
        updated++
        process.stdout.write(`\rUpdated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`)
      } catch (err) {
        failed++
        console.error(`\nFailed to embed property ${property._id}:`, (err as Error).message)
      }
    }

    page++
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`\n\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})

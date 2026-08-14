/**
 * Backfill map pins onto listings that have none.
 *
 *   npm run backfill:coordinates            # report what would change
 *   npm run backfill:coordinates -- --apply # write them
 *
 * Properties created before the map existed have no coordinates, which makes
 * them invisible on it and absent from nearby searches. This derives a
 * neighbourhood-level pin from each address using the gazetteer in
 * data/ghanaPlaces.ts.
 *
 * Accuracy is neighbourhood-level, NOT street-level: the pin says "in Osu", not
 * "at 22 Oxford Street". Landlords should still confirm with their own pin via
 * Set Map Location. Existing coordinates are never touched.
 */
import mongoose from 'mongoose'
import { config } from './config/index.js'
import { Property } from './models/Property.js'
import { resolveCoordinates } from './data/ghanaPlaces.js'

interface AddressShape {
  street?: string
  city?: string
  region?: string
  neighborhood?: string
}

async function main() {
  const apply = process.argv.includes('--apply')

  await mongoose.connect(config.mongoUri)
  // Never log config.mongoUri itself — it can embed credentials.
  console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`)
  console.log(apply ? 'Mode: APPLY (writing changes)\n' : 'Mode: DRY RUN (pass --apply to write)\n')

  const missing = await Property.find({
    $or: [
      { coordinates: { $exists: false } },
      { 'coordinates.lat': null },
      { 'coordinates.lng': null },
    ],
  }).select('title address coordinates').lean()

  const total = await Property.countDocuments()
  console.log(`${total} properties, ${missing.length} without a pin\n`)

  let resolved = 0
  const unresolved: string[] = []

  for (const property of missing) {
    const address = (property.address ?? {}) as AddressShape
    // Seed the jitter with the title so the same listing always lands in the
    // same spot, however many times this runs.
    const coordinates = resolveCoordinates(address, property.title)

    if (!coordinates) {
      unresolved.push(`${property.title} — ${address.neighborhood ?? ''} ${address.city ?? '(no city)'}`.trim())
      continue
    }

    resolved++
    const where = [address.neighborhood, address.city].filter(Boolean).join(', ')
    console.log(`  ${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}  ${property.title}  (${where})`)

    if (apply) {
      await Property.updateOne({ _id: property._id }, { $set: { coordinates } })
    }
  }

  console.log(`\n${resolved} pin(s) ${apply ? 'written' : 'resolved (dry run)'}`)

  if (unresolved.length) {
    console.log(`\n${unresolved.length} could not be resolved — no gazetteer entry for their city:`)
    for (const line of unresolved) console.log(`  - ${line}`)
    console.log('\nAdd the city to data/ghanaPlaces.ts, or pin these by hand in the app.')
  }

  if (resolved > 0 && apply) {
    console.log('\nPins are neighbourhood-level. Ask landlords to confirm exact positions with Set Map Location.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})

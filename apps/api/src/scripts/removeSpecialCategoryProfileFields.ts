/**
 * One-off cleanup: tenant profiles used to collect religion and ethnic group —
 * special personal data (Act 843 s.37) with no purpose on a rental platform.
 * The fields are gone from the schema and API; this removes values already
 * stored. Safe to re-run.
 *
 * Usage: npx tsx --env-file=.env src/scripts/removeSpecialCategoryProfileFields.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { TenantProfile } from '../models/TenantProfile.js'

export const REMOVED_PROFILE_FIELDS = ['religion', 'ethnicGroup'] as const

/** `userIds` limits the run to specific accounts (tests share a database). */
export async function removeSpecialCategoryProfileFields(scope: { userIds?: string[] } = {}): Promise<number> {
  // The native collection: Mongoose strips paths the schema no longer declares
  // from an update, which would make this a silent no-op.
  const result = await TenantProfile.collection.updateMany(
    { ...(scope.userIds ? { userId: { $in: scope.userIds } } : {}), $or: REMOVED_PROFILE_FIELDS.map((field) => ({ [field]: { $exists: true } })) },
    { $unset: Object.fromEntries(REMOVED_PROFILE_FIELDS.map((field) => [field, ''])) },
  )
  return result.modifiedCount
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  console.log(`Removed religion/ethnic group from ${await removeSpecialCategoryProfileFields()} tenant profiles.`)
  await mongoose.disconnect()
}

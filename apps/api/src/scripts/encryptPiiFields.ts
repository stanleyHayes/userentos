/**
 * One-off backfill: encrypt national IDs written before field encryption
 * (User.ghanaCardId, TenantProfile.idNumber). Reads already tolerate legacy
 * plaintext, so this can run any time after deploy. Safe to re-run —
 * encrypted values are skipped.
 *
 * Usage: npx tsx --env-file=.env src/scripts/encryptPiiFields.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { TenantProfile } from '../models/TenantProfile.js'

const legacy = { $type: 'string' as const, $not: /^pii:v1\./ }

/** `userIds` limits the run to specific accounts (tests share a database). */
export async function encryptLegacyPii(scope: { userIds?: string[] } = {}): Promise<{ users: number; profiles: number }> {
  const only = scope.userIds ? { $in: scope.userIds } : undefined
  let users = 0
  let profiles = 0
  // updateOne casts through each path's setter, which encrypts.
  for await (const user of User.find({ ghanaCardId: legacy, ...(only ? { _id: only } : {}) }).select('ghanaCardId').lean().cursor()) {
    await User.updateOne({ _id: user._id }, { $set: { ghanaCardId: user.ghanaCardId } })
    users++
  }
  for await (const profile of TenantProfile.find({ idNumber: legacy, ...(only ? { userId: only } : {}) }).select('idNumber').lean().cursor()) {
    await TenantProfile.updateOne({ _id: profile._id }, { $set: { idNumber: profile.idNumber } })
    profiles++
  }
  return { users, profiles }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  const result = await encryptLegacyPii()
  console.log(`Encrypted ${result.users} Ghana Card IDs and ${result.profiles} tenant ID numbers.`)
  await mongoose.disconnect()
}

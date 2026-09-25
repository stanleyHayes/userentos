/**
 * One-off backfill: accepted invitations and admin-created accounts used to be
 * marked isVerified (and given the "Verified Member" badge) without any
 * identity review. An admin review always sets verificationStatus 'verified',
 * so isVerified without it was never reviewed. Clears the flag and the badge
 * for those accounts; the owner can request a real review from their profile.
 * Safe to re-run.
 *
 * Usage: npx tsx --env-file=.env src/scripts/revokeUnreviewedVerification.ts
 */
import mongoose, { isValidObjectId } from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Achievement } from '../models/Achievement.js'

/** `userIds` limits the run to specific accounts (tests share a database). */
export async function revokeUnreviewedVerification(scope: { userIds?: string[] } = {}): Promise<{ users: number; badges: number }> {
  const only = scope.userIds ? { _id: { $in: scope.userIds } } : {}
  const users = await User.updateMany({ ...only, isVerified: true, verificationStatus: { $ne: 'verified' } }, { $set: { isVerified: false } })
  const holders: string[] = await Achievement.distinct('userId', { code: 'profile_verified', ...(scope.userIds ? { userId: { $in: scope.userIds } } : {}) })
  const reviewed = new Set((await User.find({ _id: { $in: holders.filter((id) => isValidObjectId(id)) }, verificationStatus: 'verified' }).select('_id').lean()).map((u) => String(u._id)))
  const badges = await Achievement.deleteMany({ code: 'profile_verified', userId: { $in: holders.filter((id) => !reviewed.has(id)) } })
  return { users: users.modifiedCount, badges: badges.deletedCount }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  const result = await revokeUnreviewedVerification()
  console.log(`Withdrew unreviewed verification from ${result.users} accounts and removed ${result.badges} badges.`)
  await mongoose.disconnect()
}

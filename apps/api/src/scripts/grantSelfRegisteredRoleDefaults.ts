/**
 * One-off backfill: employers and financiers who signed up themselves were
 * created with no permissions, so every permission-gated employer or
 * financing call answered 403 until an admin granted them by hand. Gives
 * those accounts their role's default permissions. Accounts that already hold
 * any permission (an admin has set them) are left alone. Safe to re-run.
 *
 * Accounts pick the new permissions up at their next sign-in or token refresh.
 *
 * Usage: npx tsx --env-file=.env src/scripts/grantSelfRegisteredRoleDefaults.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { ROLE_DEFAULT_PERMISSIONS } from '../types/index.js'

const ROLES = ['employer', 'financier'] as const

/** `userIds` limits the run to specific accounts (tests share a database). */
export async function grantSelfRegisteredRoleDefaults(scope: { userIds?: string[] } = {}): Promise<{ users: number }> {
  const only = scope.userIds ? { _id: { $in: scope.userIds } } : {}
  // Chosen once, before any grant, so an account holding both roles gets both
  // sets and not just the first.
  const targets = await User.find({ ...only, roles: { $in: [...ROLES] }, permissions: { $size: 0 } }).select('_id').lean()
  const ids = targets.map((t) => t._id)
  for (const role of ROLES) {
    await User.updateMany({ _id: { $in: ids }, roles: role }, { $addToSet: { permissions: { $each: ROLE_DEFAULT_PERMISSIONS[role] ?? [] } } })
  }
  return { users: ids.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  const result = await grantSelfRegisteredRoleDefaults()
  console.log(`Granted role default permissions to ${result.users} employer/financier accounts.`)
  await mongoose.disconnect()
}

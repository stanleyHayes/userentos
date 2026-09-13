import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { User } from '../../models/User.js'

const productId = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/)
export const storeProductInput = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('apple'), productId, packageId: z.string().regex(/^[a-f\d]{24}$/i), isActive: z.boolean().default(false) }).strict(),
  z.object({ platform: z.literal('google'), productId, basePlanId: z.string().trim().min(1).max(63).regex(/^[a-z0-9][a-z0-9-]*$/), packageId: z.string().regex(/^[a-f\d]{24}$/i), isActive: z.boolean().default(false) }).strict(),
])

export function purchaseAccountIdentifiers(token: string) {
  return {
    appAccountToken: token,
    obfuscatedAccountId: createHash('sha256').update(`rentos:google:${token}`).digest('hex'),
  }
}

/** Allocate once on the User so normal account erasure also removes the binding. */
export async function getPurchaseAccount(userId: string) {
  await User.updateOne({ _id: userId, deletedAt: { $exists: false }, storeAccountToken: { $exists: false } }, { $set: { storeAccountToken: randomUUID() } })
  // The winner of concurrent allocations is the only value returned to clients.
  const user = await User.findOne({ _id: userId, deletedAt: { $exists: false } }).select('+storeAccountToken').lean()
  if (!user?.storeAccountToken) return null
  return purchaseAccountIdentifiers(user.storeAccountToken)
}

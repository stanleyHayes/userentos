import type { Purchase } from 'expo-iap'
export type AppleCompletion = { purchaseState: number; entitlementState: string }
export async function completeAppleTransaction(purchase: Purchase, dependencies: {
  current: () => boolean
  verify: (transactionId: string) => Promise<AppleCompletion>
  finish: (purchase: Purchase) => Promise<unknown>
}) {
  if (!dependencies.current() || purchase.store !== 'apple' || purchase.purchaseState !== 'purchased') return null
  if (!/^\d{1,32}$/.test(purchase.id)) throw new Error('Invalid App Store transaction identifier')
  const result = await dependencies.verify(purchase.id)
  if (!dependencies.current()) return null
  if (![1, 2, 3, 4, 5].includes(result.purchaseState) || !['active', 'revoked'].includes(result.entitlementState)) throw new Error('Purchase processing is incomplete. Restore purchases to retry; do not purchase again.')
  await dependencies.finish(purchase)
  return dependencies.current() ? result : null
}

import type { Purchase } from 'expo-iap'
export type GoogleCompletion = { purchaseState: string; entitlementState: string; acknowledged: boolean }

/**
 * Hands a Play purchase token to the server, pending ones included. Google
 * refunds a purchase not acknowledged within three days of it becoming
 * PURCHASED, and the server can only acknowledge (or poll, or match a
 * real-time notification to) a token it has seen. A slow or cash payment
 * held back until the user reopened the app could be refunded. The server
 * grants nothing for SUBSCRIPTION_STATE_PENDING. Nothing is consumed or
 * acknowledged on the device.
 */
export async function completeGooglePurchase(purchase: Purchase, dependencies: {
  current: () => boolean
  verify: (purchaseToken: string) => Promise<GoogleCompletion>
}): Promise<{ result: GoogleCompletion; message: string } | null> {
  if (!dependencies.current() || purchase.store !== 'google' || !purchase.purchaseToken) return null
  if (purchase.purchaseState !== 'purchased' && purchase.purchaseState !== 'pending') return null
  const result = await dependencies.verify(purchase.purchaseToken)
  if (!dependencies.current()) return null
  return { result, message: googleCompletionMessage(result) }
}

export function googleCompletionMessage(result: GoogleCompletion): string {
  if (result.purchaseState === 'SUBSCRIPTION_STATE_PENDING') return 'Payment is pending in Google Play. Your plan activates after confirmation.'
  if (result.entitlementState === 'active' && result.acknowledged) return 'Your Google Play subscription is active.'
  return 'No active subscription access was confirmed.'
}

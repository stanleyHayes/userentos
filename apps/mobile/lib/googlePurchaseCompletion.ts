import type { Purchase } from 'expo-iap'
export type GoogleCompletion = { purchaseState: string; entitlementState: string; acknowledged: boolean }

/**
 * Hands a Play purchase token to the server, whatever state the device
 * reports: pending, purchased or unknown. Google refunds a purchase not
 * acknowledged within three days of it becoming PURCHASED, and the server can
 * only acknowledge (or poll, or match a real-time notification to) a token it
 * has seen. A slow or cash payment held back until the user reopened the app
 * could be refunded. The server is the authority: it verifies every token
 * with Google and grants nothing for SUBSCRIPTION_STATE_PENDING or a state it
 * cannot verify. Nothing is consumed or acknowledged on the device.
 */
export async function completeGooglePurchase(purchase: Purchase, dependencies: {
  current: () => boolean
  verify: (purchaseToken: string) => Promise<GoogleCompletion>
}): Promise<{ result: GoogleCompletion; message: string } | null> {
  if (!dependencies.current() || purchase.store !== 'google' || !purchase.purchaseToken) return null
  const result = await dependencies.verify(purchase.purchaseToken)
  if (!dependencies.current()) return null
  return { result, message: googleCompletionMessage(result) }
}

export function googleCompletionMessage(result: GoogleCompletion): string {
  if (result.purchaseState === 'SUBSCRIPTION_STATE_PENDING') return 'Payment is pending in Google Play. Your plan activates after confirmation.'
  if (result.entitlementState === 'active' && result.acknowledged) return 'Your Google Play subscription is active.'
  return 'No active subscription access was confirmed.'
}

export type GoogleBillingUpdate = { busy?: boolean; error?: string; message?: string; revision?: number }

/**
 * Completes the purchases a restore finds and the ones the purchase listener
 * delivers, each token once at a time (both can deliver the same one).
 *
 * `delivered`: the listener delivered it, which ends the checkout buy()
 * started. That clears `busy` even when there is nothing to post, or the
 * checkout buttons stay disabled until the next foreground restore. A
 * restore clears `busy` itself when its loop ends. `update` is expected to
 * ignore calls once the session is no longer current.
 */
export function createGooglePurchaseCompleter(dependencies: {
  current: () => boolean
  verify: (purchaseToken: string) => Promise<GoogleCompletion>
  update: (state: GoogleBillingUpdate) => void
  revision: () => number
}) {
  const inFlight = new Set<string>()
  return async function complete(purchase: Purchase, delivered = false): Promise<void> {
    const settle = () => { if (delivered) dependencies.update({ busy: false }) }
    const token = purchase.purchaseToken
    if (!dependencies.current() || purchase.store !== 'google' || !token) { settle(); return }
    // The completion already in flight for this token reports the outcome.
    if (inFlight.has(token)) return
    inFlight.add(token)
    try {
      // Google acknowledgement is performed on the server after activation.
      // Do not consume a subscription or acknowledge it before verification.
      const completion = await completeGooglePurchase(purchase, dependencies)
      if (!completion) { settle(); return }
      dependencies.update({ busy: false, error: '', message: completion.message, revision: dependencies.revision() + 1 })
    } catch (error) {
      dependencies.update({ busy: false, error: error instanceof Error ? error.message : 'Could not finish verifying your purchase. Tap Restore purchases to retry; do not purchase again.' })
    } finally { inFlight.delete(token) }
  }
}

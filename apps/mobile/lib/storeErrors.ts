export type StoreName = 'App Store' | 'Google Play'

/**
 * What a failed store checkout means for the user (expo-iap ErrorCode).
 *
 * - `silent`: the user cancelled; nothing to say.
 * - `pending`: Ask to Buy or a slow payment method; the purchase listener
 *   completes it later, so it is a notice, not an error.
 * - `restore`: the store says this account already owns it; restore instead.
 * - `error`: a message with the next step for that failure.
 */
export type StoreErrorOutcome =
  | { kind: 'silent' }
  | { kind: 'pending'; message: string }
  | { kind: 'restore' }
  | { kind: 'error'; message: string }

export function mapStoreError(code: string | null | undefined, store: StoreName): StoreErrorOutcome {
  switch (code) {
    case 'user-cancelled':
      return { kind: 'silent' }
    case 'deferred-payment':
    case 'pending':
      return { kind: 'pending', message: `Payment is pending in ${store}. Your plan activates after confirmation.` }
    case 'already-owned':
      return { kind: 'restore' }
    case 'billing-unavailable':
    case 'iap-not-available':
      return { kind: 'error', message: `${store} purchases are unavailable on this device. Sign in to ${store === 'App Store' ? 'the App Store' : 'the Play Store'} and try again.` }
    case 'network-error':
    case 'service-timeout':
    case 'service-disconnected':
      return { kind: 'error', message: `Could not reach ${store}. Check your connection and try again.` }
    case 'item-unavailable':
    case 'sku-not-found':
      return { kind: 'error', message: `This plan is not available in ${store} right now. Please try again later.` }
    default:
      return { kind: 'error', message: `${store} could not complete checkout. Restore purchases if needed.` }
  }
}

/**
 * Restore runs silently on start and on every foreground; only a restore the
 * user asked for may say nothing was found, or every landlord without a store
 * subscription would see that on each return to the app.
 */
export function restoreSummary(found: number, explicit: boolean, store: StoreName): string | null {
  if (found > 0 || !explicit) return null
  return `No ${store} purchases were found for this store account.`
}

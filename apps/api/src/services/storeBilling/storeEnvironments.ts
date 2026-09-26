import { envOptional } from '../../utils/env.js'

export type StoreEnvironment = 'production' | 'test'

/** Store test purchases (Apple sandbox, Google Play license testing) are free
 * and carry no revenue. App Review and TestFlight can only buy in the sandbox,
 * so production grants test rows to the accounts named here (the review demo
 * landlord) and to nobody else. Entries must be 24-hex user IDs. Nothing that
 * reports revenue may read ApplePurchase/StorePurchase without environment 'production'.
 */
export function sandboxAllowedUserIds(): string[] {
  return [...new Set((envOptional('STORE_SANDBOX_ALLOWED_USER_IDS') ?? '').split(',')
    .map(id => id.trim().toLowerCase()).filter(id => /^[a-f\d]{24}$/.test(id)))]
}
function sandboxAllowed(userId: string) { return sandboxAllowedUserIds().includes(userId) }

/** Production verifies against Apple production first and the sandbox second.
 * Sandbox is a development-only mode in which every account buys in the sandbox.
 */
export function appleStoreMode() {
  const applicationId = envOptional('APPLE_STORE_BUNDLE_ID')
  const mode = envOptional('APPLE_STORE_ENVIRONMENT')
  if (!applicationId || !['Production', 'Sandbox'].includes(mode ?? '') || (mode === 'Sandbox' && process.env.NODE_ENV === 'production')) return null
  return { applicationId, sandboxOnly: mode === 'Sandbox' }
}

/** Journal environments that may grant this account App Store access. */
export function appleEnvironmentsFor(userId: string): StoreEnvironment[] {
  const mode = appleStoreMode()
  if (!mode) return []
  if (mode.sandboxOnly) return ['test']
  return sandboxAllowed(userId) ? ['production', 'test'] : ['production']
}

// Developer switch: every account, and never in production.
function googleTestPurchasesOpen() {
  return process.env.NODE_ENV !== 'production' && envOptional('GOOGLE_PLAY_ALLOW_TEST_PURCHASES') === 'true'
}

/** Journal environments that may grant this account Google Play access. */
export function googleEnvironmentsFor(userId: string): StoreEnvironment[] {
  return googleTestPurchasesOpen() || sandboxAllowed(userId) ? ['production', 'test'] : ['production']
}

type RecoveryScope = { $or: Array<{ environment: StoreEnvironment; userId?: { $in: string[] } }> }
const allowlistedScope = (): RecoveryScope => ({ $or: [{ environment: 'production' }, { environment: 'test', userId: { $in: sandboxAllowedUserIds() } }] })

/** Recovery polls live rows and only the test rows their owners may still hold. */
export function appleRecoveryScope(): RecoveryScope | null {
  const mode = appleStoreMode()
  if (!mode) return null
  return mode.sandboxOnly ? { $or: [{ environment: 'test' }] } : allowlistedScope()
}
export function googleRecoveryScope(): RecoveryScope {
  return googleTestPurchasesOpen() ? { $or: [{ environment: 'production' }, { environment: 'test' }] } : allowlistedScope()
}
